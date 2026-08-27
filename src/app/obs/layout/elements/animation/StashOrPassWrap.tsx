'use client'

// `animation:stashOrPassWrap` (obs-layout-plan.md §2.2, overlay-stash-or-pass-spec.md) — a
// boxless element that frames ANOTHER element's box (`useResolvedBox(target)`, resolvedBoxes.tsx)
// with four bands of running "STASH OR PASS" text, one per edge, orbiting the box. Two phases:
// an entrance (~1.13s, spec §2) and an orbit that runs until the operator toggles it off
// (`OverlayState.active.stash_or_pass`, schema.ts / config.ts `isEventActive`).
//
// STATE MACHINE, not a single rAF loop. `animPhase` is 'idle' | 'entrance' | 'orbit' | 'exit'.
//   - The `stash_or_pass` cue (useSceneEvent) always (re)starts the entrance — spec's lifecycle:
//     "cue while inactive -> entrance" and "cue while already active -> restart the entrance" are
//     the same rule (see obs-layout-plan.md §2.2 resolution #5).
//   - `useEventActive('stash_or_pass')` flipping false is the ONLY thing that starts the exit —
//     turning the toggle off never sends a cue (obs/controls/[id]/page.tsx's fireSceneEvent), so
//     this can't be driven off the cue bus.
//   - Mounting (or remounting, e.g. a browser-source reload) with `active === true` and no cue
//     jumps straight into the orbit, no entrance beats.
//   - The target box disappearing, or unmount, cancels every timer and resets to idle.
//
// WHY TIMERS + CSS TRANSITIONS, NOT rAF. The entrance is a fixed beat table (spec §2) — every
// beat boundary is a `setTimeout` (using the same genRef/timersRef cancellation idiom the old
// §1.9 demo used, so a repeat mid-run or an unmount cancels cleanly) that flips a small piece of
// React state; the actual motion between beats is a CSS transition/keyframe, so the browser's
// compositor drives it rather than a per-frame JS loop. The orbit's marquees are CSS
// `animation: … infinite`, transform-only, so the long-lived steady state costs nothing beyond a
// GPU layer per band (obs-layout-plan.md §2.2 resolution #7 / spec §6 "Four continuous marquees
// is a lot of moving pixels").
//
// THE 70MS CONSTRAINT (spec §4). `STAGGER_MS` is defined once and used for BOTH the gap between
// consecutive arrivals AND the pulse's own CSS transition-duration, so they cannot drift apart —
// see `timeline()`.
//
// THE FOUR-CORNER CIRCUIT. Each copy's travel target is not its band's midpoint but the band's
// *leading* corner in orbit order — the point it shares with the NEXT band. That makes "the pulse
// reaches the next corner exactly as the next copy lands" (spec §4) a single, well-defined
// straight-line trip along the next band's own length, in that band's own scroll direction:
// top-left -> top-right (top band) -> bottom-right (right band) -> bottom-left (bottom band) ->
// top-left (left band), closing the loop.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ElementProps } from '../../registry'
import { useResolvedBox } from '../../resolvedBoxes'
import { useSceneEvent } from '../../sceneEventBus'
import { useEventActive } from '../../eventActive'
import { useLayoutData } from '../../useLayoutData'
import type { Box } from '../../schema'
import './StashOrPassWrap.css'

// Inline styles below need to set CSS custom properties (`--sopw-copy-dur`, `--sopw-pulse-ms`,
// …) that the CSS file's `var()` calls read — CSSProperties' index signature doesn't allow
// arbitrary `--*` keys, so every style object that needs one is typed as `Style` instead.
type Style = CSSProperties & Record<string, string | number>

/**
 * Tuning multiplier for the entrance/exit choreography: every beat below is the spec's real
 * timing multiplied by this. 1 = the spec's timings; 5 = the 1/5-speed debug pace the design
 * canvas uses. MUST stay in sync with `--sopw-ts` in StashOrPassWrap.css, which scales the CSS
 * side of the same beats. Does NOT affect the orbit marquee — that has its own `speed` setting.
 */
export const TIME_SCALE = 5

export const DEFAULT_PAD = 24
export const DEFAULT_LANE_FONT = 43 // px; the band sizes itself around this
// Diagonal stripe texture that drifts through each lane behind the text. The period is measured
// along the gradient axis; a 45° pattern repeats horizontally every period * sqrt(2), which is the
// distance the layer must travel for the loop to be invisible.
const STRIPE_PERIOD_PX = 18
const STRIPE_SHIFT_PX = Math.round(STRIPE_PERIOD_PX * Math.SQRT2)
// Stripe drift speed as a fraction of the marquee's, so the two stay related when speed is retuned.
// The stripes are meant to be a slow undertow behind the text, not a second thing competing to be
// read, so they run at a quarter of it.
const STRIPE_SPEED_RATIO = 0.25

// Gap between a lane's edge and its text, per side. The band no longer has a thickness of its own:
// it is measured from the rendered marquee text and grown by this on each side, so a lane always
// hugs its own type whatever the font size or typeface.
const LANE_TEXT_PAD = 5
export const DEFAULT_SPEED = 37 // canvas px/s the orbit marquee scrolls at
export const DEFAULT_HOLD_MS = 220 // spec §7.1: the single most likely timing to need retuning
                                   // (raw ms; TIME_SCALE is applied in timeline())

// Hard constraint (spec §4): pulse corner-travel time === arrival stagger. Both are derived from
// this ONE constant so they can never drift apart. (Scaled, like every other beat.)
export const STAGGER_MS = 70 * TIME_SCALE

const ANTICIPATION_MS = 140 * TIME_SCALE
const IMPACT_MS = 80 * TIME_SCALE // 140 -> 220
const SPLIT_MS = 120 * TIME_SCALE // hold end -> travel start, in two halves:
// `split` — the word distorts and blinks out while the four copies appear ON ITS POSITION — then
// `fan`, where they ease apart into their corners. Splitting the beat is what makes the copies
// read as coming OUT of the word instead of arriving beside it.
const SPLIT_SPAWN_MS = Math.round(SPLIT_MS * 0.4)
// First copy's own travel window: the flight out to its lane AND the overshoot-and-settle at the
// end of it, since both are the one transition `--sopw-copy-dur` drives. Spec §2 allots 240
// (560 -> 800 unscaled); halved to 120 on the user's direction, which speeds up the travel and its
// overshoot correction together. Later copies still add STAGGER_MS each, so the arrivals stay
// staggered — this shortens the flight, it does not bunch the landings.
const TRAVEL_MS = 120 * TIME_SCALE
// Settle: how long a copy takes to come to rest in its lane after the overshoot at the end of
// travel. Spec §2 says "+120 each"; halved to 60 on the user's direction — the overshoot itself is
// unchanged, only the settling that follows it. `.sopw-copy--absorbed` in the CSS drives its own
// transition from this same number via --sopw-settle-ms, so the two cannot drift.
const ABSORB_MS = 60 * TIME_SCALE
const RECOIL_PX = 14 // how far the original word kicks at the split
// The word recoils toward ONE of the four diagonals, chosen per play; the copies fan out into the
// other three (see stackOffset). Spec §3 only fixes the RELATIONSHIP — "the original recoils ... as
// the copies stack" is what makes them read as split off rather than spawned — not which diagonal,
// so varying it keeps a repeated trigger from looking mechanical.
const RECOIL_DIRS: Array<[number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

// Six tones the word flickers through while it distorts. Kept inside the overlay's own palette
// (spec §6 "Register" — the glitch reads as digital decay, but doing it in ivory/gold/bronze keeps
// it in the Greek/bronze language rather than stepping out into RGB). Shuffled per play, so the
// same six colours arrive in a different order every time.
const GLITCH_POOL = [
    'var(--sopw-ivory)',
    'var(--sopw-gold-bright)',
    'var(--sopw-gold-mid)',
    'var(--sopw-bronze)',
    'var(--sopw-ground)',
    '#fff',
]

function shuffled<T>(items: T[]): T[] {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}
// How far into each corner a copy drifts during `fan`, as a fraction of the box's half-size.
// (Spec §2's literal "12px apart" stack was replaced on the user's direction: at board scale a
// 12px fan reads as one blurry clump.) A modest value on purpose — this is the "move them slightly
// to their corners" step, not the travel.
const CORNER_FRACTION = 0.25

const EXIT_GATHER_MS = 160 * TIME_SCALE
const EXIT_MERGE_MS = 100 * TIME_SCALE
const EXIT_COLLAPSE_MS = 140 * TIME_SCALE

const PHRASE = 'STASH OR PASS'
// Starting repeat count only — Band() measures the rendered strip and grows this until one strip
// is at least as long as its band, so the two-copy track can never expose a gap (see Band()).
const STRIP_REPS_MIN = 6

type BandSide = 'top' | 'right' | 'bottom' | 'left'
// Orbit order = reading order of spec §5's table = the direction the circuit travels.
const BAND_ORDER: BandSide[] = ['top', 'right', 'bottom', 'left']
const BAND_ROTATION: Record<BandSide, number> = { top: 0, right: 90, bottom: 0, left: -90 }
// Local scroll direction, expressed as whether the shared `sopw-scroll` keyframe plays in
// reverse. top/right/left all scroll "locally rightward" (which rotation turns into rightward /
// downward / upward on screen, respectively); bottom is the one spec §5 calls out as NOT rotated
// 180° — it stays upright and simply scrolls the other way, i.e. it's the odd one out here too.
const BAND_REVERSE: Record<BandSide, boolean> = { top: true, right: true, bottom: false, left: true }
// spec §6 Register: ivory/gold/bronze/mid-gold stand in for the RGB split.
const COPY_COLORS: Record<BandSide, string> = {
    top: 'var(--sopw-ivory)',
    right: 'var(--sopw-gold-bright)',
    bottom: 'var(--sopw-bronze)',
    left: 'var(--sopw-gold-mid)',
}

type Beat = 'pre' | 'anticipation' | 'impact' | 'hold' | 'split' | 'fan' | 'travel'
type AnimPhase = 'idle' | 'entrance' | 'orbit' | 'exit'
type ExitBeat = 'gather' | 'merge' | 'collapse' | null

function timeline(holdMs: number) {
    const impactEnd = ANTICIPATION_MS + IMPACT_MS // 220
    const holdEnd = impactEnd + holdMs * TIME_SCALE // 440 by default
    const fanStart = holdEnd + SPLIT_SPAWN_MS
    const splitEnd = holdEnd + SPLIT_MS // 560 by default — travel starts here
    const travelStart = splitEnd
    const arrivals = BAND_ORDER.map((_, i) => travelStart + TRAVEL_MS + i * STAGGER_MS)
    const absorptions = arrivals.map((t) => t + ABSORB_MS)
    return { impactEnd, holdEnd, fanStart, splitEnd, travelStart, arrivals, absorptions }
}

function bandRect(box: Box, pad: number, t: number, side: BandSide): Box {
    switch (side) {
        case 'top':
            return { x: box.x - pad - t, y: box.y - pad - t, w: box.w + 2 * pad + 2 * t, h: t }
        case 'bottom':
            return { x: box.x - pad - t, y: box.y + box.h + pad, w: box.w + 2 * pad + 2 * t, h: t }
        case 'left':
            return { x: box.x - pad - t, y: box.y - pad, w: t, h: box.h + 2 * pad }
        case 'right':
            return { x: box.x + box.w + pad, y: box.y - pad, w: t, h: box.h + 2 * pad }
    }
}

// The corner each band's copy lands on, and the next band's pulse starts from — see the module
// doc comment's "four-corner circuit".
/** Midpoint of a band — where its copy lands (mid-lane), and where its pulse starts. */
/**
 * Where copy `index` sits during the `fan` beat, relative to the CENTRE OF THE WRAPPED BOX. One
 * diagonal per copy — the word has already blinked out by this point, so no corner has to be kept
 * clear for it and all four are free. Ordered to match BAND_ORDER (top/right/bottom/left maps to
 * UL/UR/DR/DL), so each copy drifts toward the side it is about to fly to. Distance is a fraction
 * of the box's own half-size, so the fan scales with whatever is being wrapped.
 */
function stackOffset(index: number, box: Box): { x: number; y: number } {
    const dir = RECOIL_DIRS[index % RECOIL_DIRS.length]
    return { x: dir[0] * (box.w / 2) * CORNER_FRACTION, y: dir[1] * (box.h / 2) * CORNER_FRACTION }
}

function bandCenter(box: Box, pad: number, t: number, side: BandSide): { x: number; y: number } {
    const r = bandRect(box, pad, t, side)
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

function leadingCorner(box: Box, pad: number, t: number, side: BandSide): { x: number; y: number } {
    const left = box.x - pad - t
    const right = box.x + box.w + pad + t
    const top = box.y - pad - t
    const bottom = box.y + box.h + pad + t
    switch (side) {
        case 'top':
            return { x: right, y: top }
        case 'right':
            return { x: right, y: bottom }
        case 'bottom':
            return { x: left, y: bottom }
        case 'left':
            return { x: left, y: top }
    }
}

export function StashOrPassWrap(props: ElementProps) {
    const { elementKey, element } = props
    const anim = element.kind === 'animation' ? element : null

    // No explicit target -> the first board in the config (registry.ts / obs-layout-plan.md
    // §1.9: "Target element … default the board"). Recomputed from config rather than cached, so
    // adding/removing boards is picked up without a config rewrite for every wrap instance.
    const { config } = useLayoutData()
    const firstBoardKey = useMemo(
        () => Object.entries(config.elements).find(([, el]) => el.kind === 'board')?.[0],
        [config]
    )
    const targetKey = anim?.target ?? firstBoardKey
    // useResolvedBox requires a string key; '' never matches a real element key, so this safely
    // resolves to undefined when there is no target and no board to fall back to.
    const box = useResolvedBox(targetKey ?? '')

    const pad = anim?.pad ?? DEFAULT_PAD
    const laneFontSize = anim?.laneFontSize ?? DEFAULT_LANE_FONT
    const speed = anim?.speed ?? DEFAULT_SPEED
    const holdMs = anim?.holdMs ?? DEFAULT_HOLD_MS

    // Band thickness is DERIVED: the marquee text is measured at its real font size and the band is
    // that plus LANE_TEXT_PAD on each side. `offsetHeight` is layout px, unaffected by the stage's
    // transform scale, so this is canvas-space and matches every other coordinate here. Until the
    // first measurement lands (and if the webfont is still loading) a conservative estimate keeps
    // the geometry sane rather than collapsing the bands to nothing.
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

    const [animPhase, setAnimPhase] = useState<AnimPhase>('idle')
    // Which diagonal the word kicks toward this play; copies fan into the corners.
    const [recoilDir, setRecoilDir] = useState<[number, number]>(RECOIL_DIRS[0])
    // The six tones this play's distortion flickers through, in this play's order.
    const [glitchColors, setGlitchColors] = useState<string[]>(GLITCH_POOL)
    const [beat, setBeat] = useState<Beat>('pre')
    const [absorbed, setAbsorbed] = useState<boolean[]>([false, false, false, false])
    const [exitBeat, setExitBeat] = useState<ExitBeat>(null)

    const genRef = useRef(0)
    const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
    const hadBoxRef = useRef(false)
    const prevActiveRef = useRef(active)

    function cancelAll() {
        genRef.current++
        timersRef.current.forEach(clearTimeout)
        timersRef.current = []
    }

    function schedule(myGen: number, ms: number, fn: () => void) {
        const id = setTimeout(() => {
            if (genRef.current === myGen) fn()
        }, ms)
        timersRef.current.push(id)
    }

    function startEntrance() {
        cancelAll()
        const myGen = genRef.current
        setRecoilDir(RECOIL_DIRS[Math.floor(Math.random() * RECOIL_DIRS.length)])
        setGlitchColors(shuffled(GLITCH_POOL))
        setAnimPhase('entrance')
        setBeat('anticipation')
        setAbsorbed([false, false, false, false])
        setExitBeat(null)

        const tl = timeline(holdMs)
        schedule(myGen, ANTICIPATION_MS, () => setBeat('impact'))
        schedule(myGen, tl.impactEnd, () => setBeat('hold'))
        schedule(myGen, tl.holdEnd, () => setBeat('split'))
        schedule(myGen, tl.fanStart, () => setBeat('fan'))
        schedule(myGen, tl.splitEnd, () => setBeat('travel'))
        BAND_ORDER.forEach((side, i) => {
            schedule(myGen, tl.arrivals[i], () => {
                setAbsorbed((prev) => {
                    const next = [...prev]
                    next[i] = true
                    return next
                })
            })
        })
        // Every copy is in its lane and every lane is showing and scrolling — orbit takes over.
        schedule(myGen, tl.absorptions[tl.absorptions.length - 1], () => {
            setAnimPhase('orbit')
            setBeat('pre')
        })
    }

    function startExit() {
        cancelAll()
        const myGen = genRef.current
        setAnimPhase('exit')
        setExitBeat('gather')
        schedule(myGen, EXIT_GATHER_MS, () => setExitBeat('merge'))
        schedule(myGen, EXIT_GATHER_MS + EXIT_MERGE_MS, () => setExitBeat('collapse'))
        schedule(myGen, EXIT_GATHER_MS + EXIT_MERGE_MS + EXIT_COLLAPSE_MS, () => {
            setAnimPhase('idle')
            setBeat('pre')
            setExitBeat(null)
            setAbsorbed([false, false, false, false])
        })
    }

    // The cue always (re)starts the entrance — see the module doc comment.
    useSceneEvent(elementKey, 'stash_or_pass', () => {
        if (box) startEntrance()
    })

    // `active` flipping false is the only thing that starts the exit (turning the toggle off
    // never sends a cue — see the module doc comment).
    useEffect(() => {
        const prev = prevActiveRef.current
        prevActiveRef.current = active
        if (prev && !active && animPhase !== 'idle') {
            startExit()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active])

    // Mount (or the target box reappearing after having disappeared) with `active` already true
    // and no cue in flight -> resume directly in orbit (obs-layout-plan.md §2.2 resolution #2).
    // Keyed on box-defined-ness, not on `box` itself, so the target's box merely MOVING (an
    // override in another stage) never re-triggers this.
    useEffect(() => {
        if (!box) {
            hadBoxRef.current = false
            cancelAll()
            setAnimPhase('idle')
            setBeat('pre')
            setExitBeat(null)
            return
        }
        if (!hadBoxRef.current) {
            hadBoxRef.current = true
            if (active) {
                setAnimPhase('orbit')
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [box === undefined])

    // Unmount — cancel every timer, nothing left to clean up beyond that (no rAF, no imperative
    // DOM state).
    useEffect(() => {
        return () => cancelAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (!anim) return null

    // The probe renders whatever the phase, so the band geometry is already correct on the first
    // frame of an entrance rather than being measured after it starts.
    const probe = (
        <span ref={measureRef} className="sopw-measure" style={{ fontSize: laneFontSize }}>
            {PHRASE}
        </span>
    )

    if (!box || animPhase === 'idle') return probe

    return (
        <>
            {probe}
            <Visual
            box={box}
            pad={pad}
            thickness={thickness}
            laneFontSize={laneFontSize}
            speed={speed}
            animPhase={animPhase}
            beat={beat}
            absorbed={absorbed}
            exitBeat={exitBeat}
            recoilDir={recoilDir}
            glitchColors={glitchColors}
            />
        </>
    )
}

function Visual({
    box,
    pad,
    thickness,
    laneFontSize,
    speed,
    animPhase,
    beat,
    absorbed,
    exitBeat,
    recoilDir,
    glitchColors,
}: {
    box: Box
    pad: number
    thickness: number
    laneFontSize: number
    speed: number
    animPhase: AnimPhase
    beat: Beat
    absorbed: boolean[]
    exitBeat: ExitBeat
    recoilDir: [number, number]
    glitchColors: string[]
}) {
    const showEntranceRig = animPhase === 'entrance' || animPhase === 'exit'

    // Ground dim: on through anticipation/impact/hold, released from split onward, and during
    // exit's gather beat (mirrors anticipation) before collapsing away.
    const washDim =
        (animPhase === 'entrance' && (beat === 'anticipation' || beat === 'impact' || beat === 'hold')) ||
        (animPhase === 'exit' && exitBeat === 'gather')

    return (
        <div
            className="sopw-root"
            // The impact word and the copies split from it must read across the whole board, so
            // the headline is sized from the target box rather than inheriting the page default.
            // Set HERE, not on the panel: the copies are the panel's siblings, so a var on the
            // panel would never reach them. PHRASE is 13 characters — ~0.085 of the box width
            // keeps it clear of the edges, capped by height so a short wide box can't overflow.
            style={{ '--sopw-headline': `${Math.round(Math.min(box.w * 0.085, box.h * 0.22))}px` } as Style}
        >
            {showEntranceRig && <div className={`sopw-wash${washDim ? ' sopw-wash--dim' : ''}`} />}
            {showEntranceRig && (
                <Panel box={box} animPhase={animPhase} beat={beat} exitBeat={exitBeat} allArrived={absorbed.every(Boolean)} />
            )}
            {showEntranceRig &&
                BAND_ORDER.map((side, i) => (
                    <Copy
                        key={side}
                        side={side}
                        box={box}
                        pad={pad}
                        thickness={thickness}
                        index={i}
                        animPhase={animPhase}
                        beat={beat}
                        absorbed={absorbed[i]}
                        exitBeat={exitBeat}
                    />
                ))}
            {showEntranceRig && (
                <Word box={box} animPhase={animPhase} beat={beat} exitBeat={exitBeat} recoilDir={recoilDir} glitchColors={glitchColors} />
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
                    // Show + start scrolling the moment this lane's own copy lands in it — that is
                    // the phase the arrival hands over to. Deliberately NOT live during 'exit':
                    // the marquee stops the instant the toggle comes off; see the exit's Copy
                    // handling for the "release" beat this pairs with.
                    live={animPhase === 'orbit' || (animPhase === 'entrance' && absorbed[i])}
                />
            ))}
        </div>
    )
}

function Panel({
    box,
    animPhase,
    beat,
    exitBeat,
    allArrived,
}: {
    box: Box
    animPhase: AnimPhase
    beat: Beat
    exitBeat: ExitBeat
    allArrived: boolean
}) {
    // Ring: only the anticipation beat shows it contracting in; every other beat/exit keeps it
    // hidden (spec has no further use for it once the impact fill takes over).
    const ringClass = animPhase === 'entrance' && beat === 'anticipation' ? 'sopw-ring--contracted' : 'sopw-ring--gone'

    // The gold fill is the ground the copies read against, so it holds all the way through the
    // flight and only drains once every copy has reached its line (spec §6 has it draining during
    // travel; held longer on the user's direction). `allArrived` is the last arrival, which leaves
    // exactly ABSORB_MS before the panel unmounts for the orbit — so the drain is timed to that
    // window rather than the CSS default, which would otherwise be cut off mid-fade.
    const flying =
        beat === 'impact' || beat === 'hold' || beat === 'split' || beat === 'fan' || beat === 'travel'
    const fillLit =
        (animPhase === 'entrance' && flying && !allArrived) || (animPhase === 'exit' && exitBeat === 'merge')
    const fillDrain =
        (animPhase === 'entrance' && allArrived) || (animPhase === 'exit' && exitBeat === 'collapse')
    const fillClass = fillDrain ? 'sopw-fill--drain' : fillLit ? 'sopw-fill--lit' : ''
    const fillStyle: Style = {
        '--sopw-drain-ms': `${animPhase === 'exit' ? EXIT_COLLAPSE_MS : ABSORB_MS}ms`,
    }

    const blowoutFlash = (animPhase === 'entrance' && beat === 'impact') || (animPhase === 'exit' && exitBeat === 'merge')

    return (
        <div
            className="sopw-panel"
            style={{
                left: box.x,
                top: box.y,
                width: box.w,
                height: box.h,
            } as Style}
        >
            <div className={`sopw-ring ${ringClass}`} />
            <div className={`sopw-fill ${fillClass}`} style={fillStyle} />
            <div className={`sopw-blowout${blowoutFlash ? ' sopw-blowout--flash' : ''}`} />
        </div>
    )
}

/**
 * The original word. A sibling of the copies rather than a child of the panel, and rendered AFTER
 * them, so the paint order is fill < copies < word: the stack the copies form at the split reads
 * as sitting UNDER the original, which is what makes them read as split off it. (Inside the panel
 * it would either be buried by the copies or, if the panel were lifted, drag the opaque gold fill
 * up over them.) Positioned on the box centre in canvas coordinates for the same reason the
 * copies are — `left/top: 50%` here would resolve against the whole canvas.
 */
function Word({
    box,
    animPhase,
    beat,
    exitBeat,
    recoilDir,
    glitchColors,
}: {
    box: Box
    animPhase: AnimPhase
    beat: Beat
    exitBeat: ExitBeat
    recoilDir: [number, number]
    glitchColors: string[]
}) {
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }

    // Lands at impact, holds, recoils+fades at the split (spec §3 — the original "kicks up-left"
    // as the copies take over), stays hidden through travel/exit's gather+collapse, and reappears
    // briefly at exit's merge beat (the derived reverse of "lands at impact").
    let wordClass = 'sopw-word--gone'
    const style: Style = { left: center.x, top: center.y }
    if (animPhase === 'entrance' && (beat === 'impact' || beat === 'hold')) {
        wordClass = 'sopw-word--landed'
    } else if (animPhase === 'entrance' && beat === 'split') {
        // Distort and blink out fast, while the copies appear on this exact spot. No inline
        // transform here — the keyframes own `transform` for the whole beat.
        wordClass = 'sopw-word--distort'
        style['--sopw-distort-ms'] = `${SPLIT_SPAWN_MS}ms`
        style['--sopw-distort-kick'] = `${recoilDir[0] * RECOIL_PX}px`
        glitchColors.forEach((c, i) => {
            style[`--sopw-glitch-${i + 1}`] = c
        })
    } else if (animPhase === 'entrance' && (beat === 'fan' || beat === 'travel')) {
        wordClass = 'sopw-word--gone'
    } else if (animPhase === 'exit' && exitBeat === 'merge') {
        wordClass = 'sopw-word--landed'
    }

    return (
        <div className={`sopw-word ${wordClass}`} style={style}>
            {PHRASE}
        </div>
    )
}

function Copy({
    side,
    box,
    pad,
    thickness,
    index,
    animPhase,
    beat,
    absorbed,
    exitBeat,
}: {
    side: BandSide
    box: Box
    pad: number
    thickness: number
    index: number
    animPhase: AnimPhase
    beat: Beat
    absorbed: boolean
    exitBeat: ExitBeat
}) {
    const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 }
    // Land in the MIDDLE of the band, not at its corner — the copy becomes that lane's stream, so
    // it should arrive where the lane reads, not where two lanes meet.
    const landing = bandCenter(box, pad, thickness, side)
    const rot = BAND_ROTATION[side]
    const dx = landing.x - center.x
    const dy = landing.y - center.y
    const cornerTransform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rot}deg)`

    let className = 'sopw-copy'
    // Anchor the copy on the TARGET BOX's centre, in canvas coordinates. The copies are siblings
    // of .sopw-panel (not children), so the CSS `left/top: 50%` they'd otherwise use resolves
    // against .sopw-root — the whole 1080x1920 canvas — while every offset below (`dx`/`dy`, and
    // the band centres it flies to) is measured from the box centre. Whenever the board
    // isn't dead centre of the canvas those two disagree and the copies fly to nowhere.
    const style: Style = { color: COPY_COLORS[side], left: center.x, top: center.y }

    if (animPhase === 'entrance') {
        if (beat === 'split') {
            // Spawn exactly ON the word's position — no offset yet.
            className += ' sopw-copy--stacked'
            style.transform = 'translate(-50%, -50%) rotate(0deg)'
        } else if (beat === 'fan') {
            className += ' sopw-copy--stacked'
            const off = stackOffset(index, box)
            style.transform = `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px)) rotate(0deg)`
        } else if (beat === 'travel' && !absorbed) {
            className += ' sopw-copy--traveling'
            style.transform = cornerTransform
            // Per-copy travel duration — this is HOW four copies land 70ms apart despite all
            // starting their travel transition at the same instant (see the module doc comment
            // and `timeline()`): a longer transition for later copies, not a later start.
            style['--sopw-copy-dur'] = `${TRAVEL_MS + index * STAGGER_MS}ms`
        } else if (absorbed) {
            className += ' sopw-copy--absorbed'
            style['--sopw-copy-transform'] = cornerTransform
            style['--sopw-settle-ms'] = `${ABSORB_MS}ms`
        }
    } else if (animPhase === 'exit' && exitBeat === 'gather') {
        // Exit mounts the four copies fresh, already positioned/rotated at the band corner they
        // were absorbed into, then plays a real `animation` (not a `transition` — see
        // .sopw-copy--exit-release's CSS comment) drifting them back to centre and fading out —
        // the derived reverse of split+travel+absorption, compressed into one beat (spec §7.4 /
        // obs-layout-plan.md §2.2 resolution #3).
        className += ' sopw-copy--exit-release'
        style['--sopw-copy-from'] = cornerTransform
        style['--sopw-copy-to'] = 'translate(-50%, -50%) rotate(0deg)'
        style['--sopw-copy-release-ms'] = `${EXIT_GATHER_MS + EXIT_MERGE_MS}ms`
    }
    // exitBeat 'merge'/'collapse': no extra class — falls back to the base `.sopw-copy` (opacity
    // 0), which is already where the release animation left it.

    // The copies ARE the word, duplicated — spec §3: "The split duplicates, it does not dissolve."
    // Each carries the phrase in its own tint (COPY_COLORS above), which is what makes the
    // chromatic separation visible during split and travel.
    return (
        <div className={className} style={style}>
            {PHRASE}
        </div>
    )
}

function Band({
    side,
    box,
    pad,
    thickness,
    laneFontSize,
    speed,
    live,
}: {
    side: BandSide
    box: Box
    pad: number
    thickness: number
    laneFontSize: number
    speed: number
    live: boolean
}) {
    const rect = bandRect(box, pad, thickness, side)
    const vertical = side === 'left' || side === 'right'
    const rot = BAND_ROTATION[side]
    const trackRef = useRef<HTMLDivElement>(null)
    // How many times PHRASE is repeated inside ONE strip. The track holds two identical strips
    // and scrolls by exactly one strip length, so the wrap is only seamless while a single strip
    // is at least as long as the band it fills — a fixed count leaves a visible gap on long bands
    // (or after the type size changes). Measured and grown below.
    const [reps, setReps] = useState(STRIP_REPS_MIN)
    // The band's own long axis: the rotator turns a w×h box into h×w for the vertical bands.
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
        // Grechka SHA loads async (font-display: block) and can change the strip's rendered
        // width after first paint — re-measure once it's ready rather than guessing.
        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(measure).catch(() => {})
        }
    }, [rect.w, rect.h, speed, reps, bandLength, thickness])

    const rotatorSize = vertical ? { width: rect.h, height: rect.w } : { width: rect.w, height: rect.h }

    return (
        <div
            className="sopw-band"
            style={{
                left: rect.x,
                top: rect.y,
                width: rect.w,
                height: rect.h,
                '--sopw-band-font': `${laneFontSize}px`,
            } as Style}
        >
            <div className={`sopw-band-inner${live ? ' sopw-band-inner--live' : ''}`}>
                <div
                    className="sopw-band-rotator"
                    style={{
                        ...rotatorSize,
                        transform: `translate(-50%, -50%) rotate(${rot}deg)`,
                    }}
                >
                    {/* Behind the text, and running the OTHER way: the track's own direction is
                        flipped for every side except `bottom`, so the stripes take the opposite
                        flip and the two always oppose each other whichever lane this is. */}
                    <div
                        className={`sopw-band-stripes${live ? ' sopw-band-stripes--live' : ''}${BAND_REVERSE[side] ? '' : ' sopw-band-stripes--reverse'}`}
                        style={{
                            '--sopw-stripe-ms': `${Math.round((STRIPE_SHIFT_PX / Math.max(1, speed * STRIPE_SPEED_RATIO)) * 1000)}ms`,
                        } as Style}
                    />
                    <div
                        ref={trackRef}
                        className={`sopw-band-track${live ? ' sopw-band-track--live' : ''}${BAND_REVERSE[side] ? ' sopw-band-track--reverse' : ''}`}
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
        <div className="sopw-band-strip">
            {Array.from({ length: reps }, (_, i) => (
                <span key={i}>{PHRASE}</span>
            ))}
        </div>
    )
}

export default StashOrPassWrap
