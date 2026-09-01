'use client'

// `animation:stashOrPassWrapRing` — the SINGLE-LANE build of stash-or-pass.
//
// Third of three parallel builds, all reacting to the same `stash_or_pass` cue: the original
// (`animation:stashOrPassWrap`), the timeline rebuild (`…Tl`), and this. Place any of them
// together, point them at different boards with `target`, and one keypress plays them side by
// side. Shares the timeline engine with `…Tl` and nothing else.
//
// WHAT IS DIFFERENT HERE. The four marquee lanes are gone. There is ONE rounded-rect path (the
// ring centreline, ringGeometry.ts) which is stroked to make the gold lane and carries the text as
// `<textPath>`s, so the stream is genuinely continuous around the corners rather than four
// separate scrolls that happen to abut. The perimeter is divided into a WHOLE number of phrase
// slots and each phrase is placed absolutely in its own — see phraseSlots/slotOffsets for why
// that, and not a single repeated run, is what keeps the seam closed at every ring size. The four copies therefore arrive TOGETHER
// (STAGGER = 0), the lane forms as one uniform ring, holds still for the `form` stage, and only
// then does the text start running.
//
// THE COST, STATED PLAINLY. A single clockwise loop means the bottom of the ring reads
// upside-down — overlay-stash-or-pass-spec.md §5 forbade exactly that, and this build reverses it
// knowingly (see ringGeometry.ts's header). And `startOffset` is an SVG attribute, not a CSS
// property, so the scroll is a rAF loop that re-lays-out the ring text every frame rather than a
// compositor-driven transform. That is the one thing to measure in OBS before this build wins:
// spec §6 already flagged four CSS marquees as a lot of moving pixels, and this is more expensive
// per frame, not less.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ElementProps } from '../../../registry'
import { useResolvedBox } from '../../../resolvedBoxes'
import { useSceneEvent } from '../../../sceneEventBus'
import { useEventActive } from '../../../eventActive'
import { useLayoutData } from '../../../useLayoutData'
import { CANVAS } from '../../../schema'
import { buildTimeline } from '../timeline/timeline'
import { useNodes, useTimeline } from '../timeline/useTimeline'
import { Tuner } from '../timeline/Tuner'
import { buildStages, buildTracks } from './choreography'
import type { RingElId } from './choreography'
import {
    COPY_COLORS,
    DIAGONALS,
    SIDE_ORDER,
    boxCenter,
    buildRing,
    headlineSize,
    phraseSlots,
    STRIPE_SPEED_RATIO,
    STRIPE_TILE_PX,
    STRIPE_WIDTH_PX,
    stripeTilePath,
    ringTextPath,
    slotOffsets,
} from './ringGeometry'
import './StashOrPassRing.css'

type Style = CSSProperties & Record<string, string | number>

export const DEFAULT_PAD = 24
export const DEFAULT_LANE_FONT = 43
export const DEFAULT_SPEED = 37 // canvas px/s the text travels along the ring
export const DEFAULT_HOLD_MS = 1100 // paced to match tl/ — see its choreography header

const EXIT_RATE_MULTIPLIER = 2.2

const PHRASE = 'STASH OR PASS'
/** The gap we would like between repetitions, in ems — the four-lane builds' `padding: 0 0.6em`
 *  per span, i.e. 1.2em between one phrase and the next. It is only a STARTING point: the actual
 *  gap is whatever makes a whole number of phrases fit the ring exactly (see phraseSlots). */
const PHRASE_GAP_EM = 1.2
const LANE_TEXT_PAD = 5

const GLITCH_POOL = [
    'var(--soptlr-ivory)',
    'var(--soptlr-gold-bright)',
    'var(--soptlr-gold-mid)',
    'var(--soptlr-bronze)',
    'var(--soptlr-ground)',
    '#fff',
]

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

export function StashOrPassRing(props: ElementProps) {
    const { elementKey, element } = props
    const anim = element.kind === 'animation' ? element : null

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

    // Lane thickness is derived from the rendered text, same as the four-lane builds.
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
        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(measure).catch(() => {})
        }
    }, [laneFontSize])
    const thickness = (textHeight ?? Math.round(laneFontSize * 1.2)) + 2 * LANE_TEXT_PAD

    // Keyed on the box's VALUES, not its identity. The layout page re-renders on a 60s reconcile
    // poll and hands back a structurally identical but freshly allocated Box; keying on the object
    // would rebuild the ring — and everything downstream of it — every minute for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const ring = useMemo(
        () => (box ? buildRing(box, pad, thickness) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [box?.x, box?.y, box?.w, box?.h, pad, thickness]
    )

    const active = useEventActive('stash_or_pass')

    const [phase, setPhase] = useState<Phase>('idle')
    const [playToken, setPlayToken] = useState(0)
    const pendingRef = useRef<'play' | 'reverse' | null>(null)
    const hadBoxRef = useRef(false)
    const prevActiveRef = useRef(active)
    const [rate, setRate] = useState(1)

    const built = useMemo(() => {
        if (!box || !ring) return null
        const rand = rng(playToken + 1)
        return buildTimeline(
            buildStages(holdMs),
            buildTracks({
                box,
                ring,
                recoil: DIAGONALS[Math.floor(rand() * DIAGONALS.length)],
                glitch: shuffled(GLITCH_POOL, rand),
            })
        )
    }, [box, ring, holdMs, playToken])

    const nodes = useNodes<RingElId>()
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

    useSceneEvent(elementKey, 'stash_or_pass', () => {
        if (!box) return
        pendingRef.current = 'play'
        setPhase('entrance')
        setPlayToken((t) => t + 1)
    })

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

    useIsomorphicLayoutEffect(() => {
        const pending = pendingRef.current
        pendingRef.current = null
        if (!pending || !built) return
        if (pending === 'play') ctl.play()
        else ctl.reverse(rate * EXIT_RATE_MULTIPLIER)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playToken])

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

    const probe = (
        <span ref={measureRef} className="soptlr-measure" style={{ fontSize: laneFontSize }}>
            {PHRASE}
        </span>
    )

    if (!box || !ring) return probe

    const showRig = phase === 'entrance' || phase === 'exit'
    const centre = boxCenter(box)

    return (
        <>
            {probe}
            <div className="soptlr-root" style={{ '--soptlr-headline': `${headlineSize(box)}px` } as Style}>
                {showRig && (
                    <>
                        <div ref={nodes.ref('wash')} className="soptlr-wash" />
                        <div
                            className="soptlr-panel"
                            style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
                        >
                            <div ref={nodes.ref('ring')} className="soptlr-ring" />
                            <div ref={nodes.ref('fill')} className="soptlr-fill" />
                            <div ref={nodes.ref('blowout')} className="soptlr-blowout" />
                        </div>
                        {SIDE_ORDER.map((side, i) => (
                            <div key={side} className="soptlr-anchor" style={{ left: centre.x, top: centre.y }}>
                                <div
                                    ref={nodes.ref('copy', i)}
                                    className="soptlr-copy"
                                    style={{ color: COPY_COLORS[side] }}
                                >
                                    {PHRASE}
                                </div>
                            </div>
                        ))}
                        <div className="soptlr-anchor" style={{ left: centre.x, top: centre.y }}>
                            <div ref={nodes.ref('word')} className="soptlr-word">
                                {PHRASE}
                            </div>
                        </div>
                    </>
                )}
                <Lane
                    ring={ring}
                    laneFontSize={laneFontSize}
                    thickness={thickness}
                    speed={speed}
                    laneRef={nodes.ref('lane')}
                    // Lit by the `lane forms` track during the entrance (which keeps filling
                    // afterwards) and by the class once the orbit owns it — both mean opacity 1.
                    lit={phase === 'orbit'}
                    // The text only starts running when the orbit takes over, i.e. after the
                    // `form` stage has held the finished ring still.
                    running={phase === 'orbit'}
                />
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
                title="stash or pass — ring"
            />
        </>
    )
}

/**
 * The single lane. One `<path>` in <defs> is referenced three times: stroked in gold for the lane
 * body, stroked with a diagonal `<pattern>` for the drifting undertow, and used as the
 * `<textPath>` the phrase runs along. Nothing here is per-side.
 */
function Lane({
    ring,
    laneFontSize,
    thickness,
    speed,
    laneRef,
    lit,
    running,
}: {
    ring: ReturnType<typeof buildRing>
    laneFontSize: number
    thickness: number
    speed: number
    laneRef: (node: SVGElement | HTMLElement | null) => void
    lit: boolean
    running: boolean
}) {
    // useId is unique per component instance, so two ring elements on one canvas cannot collide
    // over their <defs>. The colons React puts in the id are stripped — they are legal in an id
    // attribute but awkward inside url(#…) references.
    const uid = useId().replace(/:/g, '')
    const pathId = `soptlr-path-${uid}`
    // A SECOND path for the text: same centreline, traced twice. See Ring.dText.
    const textPathId = `soptlr-textpath-${uid}`
    const patternId = `soptlr-stripes-${uid}`

    const pathRef = useRef<SVGPathElement>(null)
    const phraseRef = useRef<SVGTextElement>(null)
    const patternRef = useRef<SVGPatternElement>(null)
    // One per rendered phrase (plus the seam instance) — see slotOffsets.
    const slotRefs = useRef<Array<SVGTextPathElement | null>>([])

    // Measured, not assumed: the real path length from the browser, and the real width of ONE
    // phrase at the real font. Both are needed before the ring can be divided into whole slots.
    const [metrics, setMetrics] = useState<{ perimeter: number; phrase: number } | null>(null)

    useEffect(() => {
        function measure() {
            const path = pathRef.current
            const phrase = phraseRef.current
            if (!path || !phrase) return
            const perimeter = path.getTotalLength()
            const width = phrase.getComputedTextLength()
            if (perimeter > 0 && width > 0) setMetrics({ perimeter, phrase: width })
        }
        measure()
        // Grechka SHA loads async (font-display: block) and changes the width once it swaps in.
        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(measure).catch(() => {})
        }
    }, [ring.d, laneFontSize])

    const slots = useMemo(
        () =>
            metrics
                ? phraseSlots(
                      metrics.perimeter,
                      metrics.phrase,
                      PHRASE_GAP_EM * laneFontSize,
                      ring.sideMid[0]
                  )
                : null,
        // ring.sideMid[0], not ring.sideMid: an array dep is identity-compared and would rebuild
        // `slots` on every re-render, restarting the scroll loop below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [metrics, laneFontSize, ring.sideMid[0]]
    )

    // Scroll position, held across effect restarts. Anything that changes this effect's deps tears
    // it down and rebuilds it, and re-seeding the phase there snaps the text backwards by up to a
    // whole slot — which is what a 60s config poll used to do, once a minute, very visibly.
    // Reset only when the lane stops running, so a fresh entrance still starts phase-aligned with
    // where the copies land.
    const scrollRef = useRef<{ base: number; stripe: number } | null>(null)

    // The scroll. `startOffset` is an SVG attribute, not a CSS property, so this cannot be a CSS
    // animation or a WAAPI one — it is a rAF loop. It writes `count` short offsets per frame
    // rather than one giant repeated run. It runs ONLY during the orbit, so an idle or
    // mid-entrance overlay costs nothing.
    useEffect(() => {
        if (!running) {
            scrollRef.current = null
            return
        }
        if (!slots) return

        // Re-seed only if there is no position to resume, or the ring changed enough that the old
        // phase is no longer inside the scroll window.
        const held = scrollRef.current
        const pos =
            held && held.base >= slots.origin && held.base < slots.wrapAt
                ? held
                : { base: slots.base0, stripe: held?.stripe ?? 0 }
        scrollRef.current = pos

        let raf = 0
        // Seeded on the first tick from the rAF clock itself. Priming it from performance.now()
        // beforehand can yield a negative first delta, because a frame's timestamp is when the
        // frame began — which may precede the moment the loop was set up.
        let prev: number | null = null
        const stripeSpeed = speed * STRIPE_SPEED_RATIO
        const tick = (now: number) => {
            // Clamped at both ends: never negative, and never a jump after a stalled tab.
            const dt = prev === null ? 0 : Math.max(0, Math.min(0.1, (now - prev) / 1000))
            prev = now
            pos.base += speed * dt
            // One slot on is the same picture with every phrase shifted into its neighbour's
            // place — so this wrap is invisible, and the seam stays exact forever.
            if (pos.base >= slots.wrapAt) pos.base -= slots.slot
            const offsets = slotOffsets(pos.base, slots.slot, slots.count)
            for (let i = 0; i < offsets.length; i++) {
                slotRefs.current[i]?.setAttribute('startOffset', String(offsets[i]))
            }
            // The undertow runs the other way from the text along the top edge, and slowly.
            pos.stripe -= stripeSpeed * dt
            // Exactly one tile back is the same picture, so this wrap is invisible.
            if (pos.stripe <= -STRIPE_TILE_PX) pos.stripe += STRIPE_TILE_PX
            patternRef.current?.setAttribute('patternTransform', `translate(${pos.stripe} 0)`)
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [running, slots, speed])

    const initialOffsets = slots ? slotOffsets(slots.base0, slots.slot, slots.count) : []
    // Built only once the metrics are in, because how many laps it needs depends on how the phrase
    // measures against the perimeter.
    const textD = slots ? ringTextPath(ring, slots.laps) : null

    return (
        <svg
            className="soptlr-svg"
            width={CANVAS.w}
            height={CANVAS.h}
            viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
        >
            <defs>
                {/* Measured and stroked: one closed lap. */}
                <path id={pathId} ref={pathRef} d={ring.d} fill="none" />
                {/* Ridden by the text: several open laps, so no glyph is ever near an end. */}
                {textD && <path id={textPathId} d={textD} fill="none" />}
                <pattern
                    id={patternId}
                    ref={patternRef}
                    patternUnits="userSpaceOnUse"
                    width={STRIPE_TILE_PX}
                    height={STRIPE_TILE_PX}
                    patternTransform="translate(0 0)"
                >
                    <path
                        d={stripeTilePath(STRIPE_TILE_PX)}
                        stroke="rgba(228, 228, 228, 0.28)"
                        strokeWidth={STRIPE_WIDTH_PX}
                        fill="none"
                    />
                </pattern>
                {/* Off-path probe for ONE phrase's width — what the ring is divided by. Hidden,
                    but it must be laid out, so `visibility` rather than `display`. */}
                <text
                    ref={phraseRef}
                    className="soptlr-lane-text"
                    style={{ fontSize: laneFontSize, visibility: 'hidden' }}
                >
                    {PHRASE}
                </text>
            </defs>

            <g ref={laneRef as (node: SVGGElement | null) => void} className={`soptlr-lane${lit ? ' soptlr-lane--lit' : ''}`}>
                <use href={`#${pathId}`} className="soptlr-lane-body" strokeWidth={thickness} />
                <use
                    href={`#${pathId}`}
                    className="soptlr-lane-stripes"
                    stroke={`url(#${patternId})`}
                    strokeWidth={thickness}
                />
                {/* One <textPath> per phrase, each anchored absolutely at its own slot on the
                    doubled path. No seam instance: nothing is ever clipped. */}
                {initialOffsets.map((offset, i) => (
                    <text key={i} className="soptlr-lane-text" style={{ fontSize: laneFontSize }}>
                        <textPath
                            ref={(el) => {
                                slotRefs.current[i] = el
                            }}
                            href={`#${textPathId}`}
                            startOffset={offset}
                            dominantBaseline="central"
                        >
                            {PHRASE}
                        </textPath>
                    </text>
                ))}
            </g>
        </svg>
    )
}

export default StashOrPassRing
