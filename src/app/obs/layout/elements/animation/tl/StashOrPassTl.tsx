'use client'

// `animation:stashOrPassWrapTl` — the timeline build of stash-or-pass
// (stash-or-pass-timeline-plan.md, overlay-stash-or-pass-spec.md).
//
// Same element as `animation:stashOrPassWrap`, rebuilt on a local label timeline. It exists
// ALONGSIDE the original, deliberately: place both, point them at different boards with `target`,
// and one cue plays old and new side by side.
//
// WHAT MOVED. All timing now lives in choreography.ts as tracks anchored to stage labels. This
// file has no beat state, no timer chain, and no `if (beat === …)` in its render tree — nothing
// here branches on time. It owns four things only: resolving the target box, measuring the band
// text, the four-state phase machine, and the DOM the timeline attaches to.
//
// PHASE MACHINE — 'idle' | 'entrance' | 'orbit' | 'exit', unchanged in meaning from the original:
//   - The `stash_or_pass` cue always (re)starts the entrance, whether or not it is already up.
//   - `useEventActive('stash_or_pass')` going false is the ONLY thing that starts the exit —
//     turning the toggle off never sends a cue, so this cannot be driven off the cue bus.
//   - Mounting with `active === true` and no cue jumps straight into the orbit, no entrance.
//   - The target box disappearing, or unmount, cancels everything and resets to idle.
// The exit is the timeline run BACKWARDS (useTimeline's `reverse`), not a second choreography —
// from a live entrance it rewinds in place from wherever it got to; from the orbit it parks at
// the end of the timeline and runs back. Nothing can drift out of sync with the entrance because
// there is nothing else to keep in sync.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ElementProps } from '../../../registry'
import { useResolvedBox } from '../../../resolvedBoxes'
import { useSceneEvent } from '../../../sceneEventBus'
import { useEventActive } from '../../../eventActive'
import { useLayoutData } from '../../../useLayoutData'
import type { Box } from '../../../schema'
import { buildTimeline } from '../timeline/timeline'
import { useNodes, useTimeline } from '../timeline/useTimeline'
import { buildStages, buildTracks } from './choreography'
import type { TlElId } from './choreography'
import {
    BAND_ORDER,
    BAND_REVERSE,
    BAND_ROTATION,
    COPY_COLORS,
    bandRect,
    boxCenter,
    headlineSize,
    DIAGONALS,
} from './geometry'
import { Tuner } from '../timeline/Tuner'
import './StashOrPassTl.css'

type Style = CSSProperties & Record<string, string | number>

export const DEFAULT_PAD = 24
export const DEFAULT_LANE_FONT = 43
export const DEFAULT_SPEED = 37 // canvas px/s the orbit marquee scrolls at
// spec §7.1 calls the hold the single most likely timing to need retuning. 1100 = the spec's 220
// at the same x5 pace as choreography.ts's stages — see that file's header.
export const DEFAULT_HOLD_MS = 1100
/** 1 = the choreography as written, which is now the production pace (choreography.ts's header
 *  explains why the numbers there are the spec's x5). Kept as a setting purely so the pace can be
 *  nudged live without a redeploy. */
export const DEFAULT_RATE = 1

/** How much faster the exit runs than the entrance. The exit's shape is derived; only its
 *  urgency is a choice — coming off screen should not take as long as arriving. */
const EXIT_RATE_MULTIPLIER = 2.2

const PHRASE = 'STASH OR PASS'
/** Starting repeat count only — Band() grows it until one strip covers its band. */
const STRIP_REPS_MIN = 6
/** Gap between a lane's edge and its text, per side. The band has no thickness of its own. */
const LANE_TEXT_PAD = 5
const STRIPE_PERIOD_PX = 18
const STRIPE_SHIFT_PX = Math.round(STRIPE_PERIOD_PX * Math.SQRT2)
/** Stripes are a slow undertow behind the text, not a second thing competing to be read. */
const STRIPE_SPEED_RATIO = 0.25

/** Six tones the word flickers through while it distorts — in palette (spec §6 "Register"). */
const GLITCH_POOL = [
    'var(--soptl-ivory)',
    'var(--soptl-gold-bright)',
    'var(--soptl-gold-mid)',
    'var(--soptl-bronze)',
    'var(--soptl-ground)',
    '#fff',
]

/** Seeded LCG. The original used Math.random(), which makes a play impossible to reproduce while
 *  you are tuning it. Seeding per play keeps the variation and makes a replay identical. */
function rng(seed: number): () => number {
    let s = (seed * 1664525 + 1013904223) >>> 0
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0x100000000
    }
}
function shuffled<T>(items: T[], rand: () => number): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

type Phase = 'idle' | 'entrance' | 'orbit' | 'exit'

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function StashOrPassTl(props: ElementProps) {
    const { elementKey, element } = props
    const anim = element.kind === 'animation' ? element : null

    // No explicit target -> the first board in the config, recomputed from config rather than
    // cached so adding/removing boards is picked up without a config rewrite.
    const { config } = useLayoutData()
    const firstBoardKey = useMemo(
        () => Object.entries(config.elements).find(([, el]) => el.kind === 'board')?.[0],
        [config]
    )
    const targetKey = anim?.target ?? firstBoardKey
    const box = useResolvedBox(targetKey ?? '')

    const pad = anim?.pad ?? DEFAULT_PAD
    const laneFontSize = anim?.laneFontSize ?? DEFAULT_LANE_FONT
    const speed = anim?.speed ?? DEFAULT_SPEED
    const holdMs = anim?.holdMs ?? DEFAULT_HOLD_MS

    // Band thickness is DERIVED: the marquee text is measured at its real font size and the band
    // is that plus LANE_TEXT_PAD on each side. `offsetHeight` is layout px, unaffected by the
    // stage's transform scale, so this is canvas-space like every other coordinate here.
    const measureRef = useRef<HTMLSpanElement>(null)
    const [textHeight, setTextHeight] = useState<number | null>(null)
    useEffect(() => {
        const el = measureRef.current
        if (!el) return
        const measure = () => {
            const h = el.offsetHeight
            if (h > 0) setTextHeight(h)
        }
        measure()
        // Grechka SHA loads async and changes the measured height once it swaps in.
        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(measure).catch(() => {})
        }
    }, [laneFontSize])
    const thickness = (textHeight ?? Math.round(laneFontSize * 1.2)) + 2 * LANE_TEXT_PAD

    const active = useEventActive('stash_or_pass')

    const [phase, setPhase] = useState<Phase>('idle')
    // Bumped once per play; seeds this play's recoil diagonal and glitch order, and is what the
    // layout effect below watches to know a new pass has been asked for.
    const [playToken, setPlayToken] = useState(0)
    const pendingRef = useRef<'play' | 'reverse' | null>(null)
    const hadBoxRef = useRef(false)
    const prevActiveRef = useRef(active)

    // Playback rate, 1 = the choreography exactly as written (see its header — those numbers ARE
    // the production timings, so nothing has to be corrected at read time). A persisted setting
    // rather than a dev-only knob so the pace can be nudged without a redeploy, like `holdMs`.
    // TlTuner still overrides it live for tuning.
    const [rate, setRate] = useState(anim?.rate ?? DEFAULT_RATE)
    const configuredRate = anim?.rate ?? DEFAULT_RATE
    useEffect(() => {
        setRate(configuredRate)
    }, [configuredRate])

    const built = useMemo(() => {
        if (!box) return null
        const rand = rng(playToken + 1)
        return buildTimeline(
            buildStages(holdMs),
            buildTracks({
                box,
                pad,
                thickness,
                recoil: DIAGONALS[Math.floor(rand() * DIAGONALS.length)],
                glitch: shuffled(GLITCH_POOL, rand),
            })
        )
    }, [box, pad, thickness, holdMs, playToken])

    const nodes = useNodes<TlElId>()
    const ctl = useTimeline(built, nodes, {
        rate,
        onDone: (direction) => {
            if (direction === 'forward') {
                setPhase('orbit')
            } else {
                ctl.cancel()
                setPhase('idle')
            }
        },
    })

    // The cue always (re)starts the entrance.
    useSceneEvent(elementKey, 'stash_or_pass', () => {
        if (!box) return
        pendingRef.current = 'play'
        setPhase('entrance')
        setPlayToken((t) => t + 1)
    })

    // `active` flipping false is the only thing that starts the exit.
    useEffect(() => {
        const prev = prevActiveRef.current
        prevActiveRef.current = active
        if (prev && !active && phase !== 'idle') {
            pendingRef.current = 'reverse'
            setPhase('exit')
            setPlayToken((t) => t + 1)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active])

    // Start the pass AFTER the render that mounts (or keeps) the rig, but BEFORE paint — a plain
    // effect would let one unanimated frame through on the way out of the orbit.
    useIsomorphicLayoutEffect(() => {
        const pending = pendingRef.current
        pendingRef.current = null
        if (!pending || !built) return
        if (pending === 'play') ctl.play()
        else ctl.reverse(rate * EXIT_RATE_MULTIPLIER)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playToken])

    // Mount (or the target box reappearing) with `active` already true and no cue in flight ->
    // resume directly in orbit. Keyed on box-defined-ness, not on `box`, so the target merely
    // MOVING never re-triggers this.
    useEffect(() => {
        if (!box) {
            hadBoxRef.current = false
            ctl.cancel()
            setPhase('idle')
            return
        }
        if (!hadBoxRef.current) {
            hadBoxRef.current = true
            if (active) setPhase('orbit')
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [box === undefined])

    if (!anim) return null

    // The probe renders whatever the phase, so band geometry is already correct on the first
    // frame of an entrance rather than being measured after it starts.
    const probe = (
        <span ref={measureRef} className="soptl-measure" style={{ fontSize: laneFontSize }}>
            {PHRASE}
        </span>
    )

    if (!box) return probe

    // The rig is mounted for the whole of entrance AND exit rather than per-beat: WAAPI needs a
    // node to attach to, and `fill: 'forwards'` plus the keyframes' own opacity decide what is
    // actually visible.
    const showRig = phase === 'entrance' || phase === 'exit'
    const centre = boxCenter(box)

    return (
        <>
            {probe}
            <div className="soptl-root" style={{ '--soptl-headline': `${headlineSize(box)}px` } as Style}>
                {showRig && (
                    <>
                        <div ref={nodes.ref('wash')} className="soptl-wash" />
                        <div
                            className="soptl-panel"
                            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                        >
                            <div ref={nodes.ref('ring')} className="soptl-ring" />
                            <div ref={nodes.ref('fill')} className="soptl-fill" />
                            <div ref={nodes.ref('blowout')} className="soptl-blowout" />
                        </div>
                        {/* Copies before the word in paint order, so the stack they form at the
                            split sits UNDER the original — which is what makes them read as split
                            off it rather than spawned beside it. */}
                        {BAND_ORDER.map((side, i) => (
                            <div
                                key={side}
                                className="soptl-anchor"
                                style={{ left: centre.x, top: centre.y }}
                            >
                                <div
                                    ref={nodes.ref('copy', i)}
                                    className="soptl-copy"
                                    style={{ color: COPY_COLORS[side] }}
                                >
                                    {PHRASE}
                                </div>
                            </div>
                        ))}
                        <div className="soptl-anchor" style={{ left: centre.x, top: centre.y }}>
                            <div ref={nodes.ref('word')} className="soptl-word">
                                {PHRASE}
                            </div>
                        </div>
                    </>
                )}
                {BAND_ORDER.map((side, i) => (
                    <Band
                        key={side}
                        side={side}
                        box={box}
                        pad={pad}
                        thickness={thickness}
                        laneFontSize={laneFontSize}
                        speed={speed}
                        innerRef={nodes.ref('band', i)}
                        // Lit by the `band lights` track during the entrance (which keeps filling
                        // afterwards) and by the class once the orbit owns it — both mean opacity
                        // 1, so the handoff is invisible.
                        lit={phase === 'orbit'}
                        // Scroll from the first frame of the entrance: the band is invisible until
                        // its copy lands anyway, and starting it here means no per-arrival state.
                        scrolling={phase !== 'idle'}
                    />
                ))}
            </div>
            <Tuner
                built={built}
                ctl={ctl}
                rate={rate}
                onRate={(r) => {
                    setRate(r)
                    ctl.setRate(r)
                }}
                onReplay={() => {
                    pendingRef.current = 'play'
                    setPhase('entrance')
                    setPlayToken((t) => t + 1)
                }}
                phase={phase}
                title="stash or pass — timeline"
            />
        </>
    )
}

function Band({
    side,
    box,
    pad,
    thickness,
    laneFontSize,
    speed,
    innerRef,
    lit,
    scrolling,
}: {
    side: (typeof BAND_ORDER)[number]
    box: Box
    pad: number
    thickness: number
    laneFontSize: number
    speed: number
    innerRef: (node: HTMLElement | null) => void
    lit: boolean
    scrolling: boolean
}) {
    const rect = bandRect(box, pad, thickness, side)
    const vertical = side === 'left' || side === 'right'
    const rot = BAND_ROTATION[side]
    const trackRef = useRef<HTMLDivElement>(null)
    // How many times PHRASE is repeated inside ONE strip. The track holds two identical strips and
    // scrolls by exactly one strip length, so the wrap is only seamless while a single strip is at
    // least as long as the band it fills. Measured and grown below.
    const [reps, setReps] = useState(STRIP_REPS_MIN)
    const bandLength = vertical ? rect.h : rect.w

    useEffect(() => {
        function measure() {
            const el = trackRef.current
            if (!el) return
            const stripW = el.scrollWidth / 2 // one strip; the track holds two identical copies
            if (stripW <= 0) return
            const perPhrase = stripW / reps
            if (perPhrase > 0 && stripW < bandLength) {
                // +1 so the strip always OVERRUNS the band rather than matching it exactly.
                setReps(Math.ceil(bandLength / perPhrase) + 1)
                return // re-runs after the re-render, with the duration set from the final width
            }
            el.style.animationDuration = `${stripW / speed}s`
        }
        measure()
        // Grechka SHA loads async (font-display: block) and can change the strip's rendered width
        // after first paint — re-measure once it is ready rather than guessing.
        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(measure).catch(() => {})
        }
    }, [rect.w, rect.h, speed, reps, bandLength, thickness])

    const rotatorSize = vertical ? { width: rect.h, height: rect.w } : { width: rect.w, height: rect.h }

    return (
        <div
            className="soptl-band"
            style={
                {
                    left: rect.x,
                    top: rect.y,
                    width: rect.w,
                    height: rect.h,
                    '--soptl-band-font': `${laneFontSize}px`,
                } as Style
            }
        >
            <div ref={innerRef} className={`soptl-band-inner${lit ? ' soptl-band-inner--live' : ''}`}>
                <div
                    className="soptl-band-rotator"
                    style={{ ...rotatorSize, transform: `translate(-50%, -50%) rotate(${rot}deg)` }}
                >
                    {/* Behind the text, running the OTHER way: the track's direction is flipped
                        for every side except `bottom`, so the stripes take the opposite flip. */}
                    <div
                        className={`soptl-band-stripes${scrolling ? ' soptl-band-stripes--live' : ''}${
                            BAND_REVERSE[side] ? '' : ' soptl-band-stripes--reverse'
                        }`}
                        style={
                            {
                                '--soptl-stripe-ms': `${Math.round(
                                    (STRIPE_SHIFT_PX / Math.max(1, speed * STRIPE_SPEED_RATIO)) * 1000
                                )}ms`,
                            } as Style
                        }
                    />
                    <div
                        ref={trackRef}
                        className={`soptl-band-track${scrolling ? ' soptl-band-track--live' : ''}${
                            BAND_REVERSE[side] ? ' soptl-band-track--reverse' : ''
                        }`}
                    >
                        <Strip reps={reps} />
                        <Strip reps={reps} />
                    </div>
                </div>
            </div>
        </div>
    )
}

function Strip({ reps }: { reps: number }) {
    return (
        <div className="soptl-band-strip">
            {Array.from({ length: reps }, (_, i) => (
                <span key={i}>{PHRASE}</span>
            ))}
        </div>
    )
}

export default StashOrPassTl
