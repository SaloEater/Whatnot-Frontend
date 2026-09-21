'use client'

// `animation:stashOrPassSportStyle` — fourth stash-or-pass build (stash-or-pass-quarters-plan.md,
// Revision 2). Reacts to the same `stash_or_pass` cue as `ring/StashOrPassRing.tsx`, same config
// surface (`target`/`pad`/`laneFontSize`/`speed`/`holdMs`, plus this build's own `cornerWidth`/
// `cornerRoundness`), so it can sit beside the other builds and be compared from one keypress.
// Shares only `../timeline/*` with `ring/`.
//
// WHAT IS DIFFERENT FROM ring/. The lane is FOUR quarter shapes, not one — each is a filled
// evenodd ring segment (white edge under a blue body, geometry.ts's `laneShapes`) revealed through
// a `<mask>` of four animated quarter strokes, rather than ring/'s single stroked centreline. The
// entrance is ring/'s word-lands/hold/word-distorts/copies-fan-fly-absorb sequence verbatim (see
// choreography.ts), with the four quarters growing alongside it so they finish exactly when the
// copies land — there is no separate board-COVER beat any more (Revision 1 had one; Revision 2
// removed it), but there is a `fill`: a blue wash over the target box, lit as the word lands and
// drained as the copies fan out, rendered/mounted only alongside the rest of the entrance rig.
// Exit is its OWN forward timeline (`builtExit`), not a reverse of the entrance: reversing the
// fan-in would fly the copies back into the board and un-glitch the word. `ctl.reverse` is
// therefore never called from this component's own state machine (the tuner's manual "reverse"
// button is a separate, dev-only path into the shared Controller).

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ElementProps } from '../../../registry'
import { useTargetShape } from '../../../anchors'
import { useSceneEvent } from '../../../sceneEventBus'
import { useEventActive } from '../../../eventActive'
import { useLayoutData } from '../../../useLayoutData'
import { CANVAS } from '../../../schema'
import { buildTimeline } from '../timeline/timeline'
import { useNodes, useTimeline } from '../timeline/useTimeline'
import type { NodeStore } from '../timeline/useTimeline'
import { Tuner } from '../timeline/Tuner'
import { buildExitStages, buildExitTracks, buildStages, buildTracks } from './choreography'
import type { QElId } from './choreography'
import {
    DIAGONALS,
    SIDE_ORDER,
    boxCenter,
    buildRing,
    headlineSize,
    laneShapes,
    phraseSlots,
    quarterPaths,
    ringTextPath,
    slotOffsets,
    starOffsets,
} from './geometry'
import './StashOrPassQuarters.css'

type Style = CSSProperties & Record<string, string | number>

export const DEFAULT_PAD = 24
export const DEFAULT_LANE_FONT = 43
export const DEFAULT_SPEED = 37 // canvas px/s the text travels along the ring
export const DEFAULT_HOLD_MS = 1100 // paced to match ring/ — see its choreography header
/** 0..1, inner corner radius as a fraction of the outer (`cornerWidth`). 0 = sharp inner corner
 *  (Revision 1's look), 1 = inner corner as round as the outer. */
export const DEFAULT_CORNER_ROUNDNESS = 0.5

const PHRASE = 'STASH OR PASS'
const STAR = '★'
/** Starting point for the gap between repeated phrases, in ems — the actual gap is whatever makes
 *  a whole number of phrases fit the ring exactly (see geometry.ts's `phraseSlots`). Widened from
 *  1.2 (Revision 1) to 2.0 in Revision 2 so the gap comfortably fits the star centred inside it. */
const PHRASE_GAP_EM = 2.0
const LANE_TEXT_PAD = 5
/** Extra half-width, each side, of the white edge painted under the blue lane fill. */
const EDGE_PX = 3
const STAR_FONT_RATIO = 0.7
/** The blue fill covers this fraction of the target box, centred, rather than the whole box. */
const FILL_FRACTION = 0.75

/**
 * Fallback thickness before the lane text has been measured — same formula the component falls
 * back to below (`thickness`). Used only as the settings panel's displayed default for
 * `cornerWidth`, whose REAL default is the live `thickness` (see R1: "cornerWidth defaults to
 * thickness"), which is not a fixed number and isn't knowable outside this component. This constant
 * is deliberately just an approximation for the UI; the component itself always uses the live
 * value.
 */
export const DEFAULT_CORNER_WIDTH = Math.round(DEFAULT_LANE_FONT * 1.2) + 2 * LANE_TEXT_PAD

const GLITCH_POOL = ['var(--sopq-white)', 'var(--sopq-blue)', '#9db8ff', '#fff', 'var(--sopq-blue)', 'var(--sopq-white)']

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

export function StashOrPassQuarters(props: ElementProps) {
    const { elementKey, element } = props
    const anim = element.kind === 'animation' ? element : null

    const { config } = useLayoutData()
    const firstBoardKey = useMemo(
        () => Object.entries(config.elements).find(([, el]) => el.kind === 'board')?.[0],
        [config]
    )
    const targetKey = anim?.target ?? firstBoardKey
    // board-anchors-plan.md §3.7: `shape` is a Shape (superset of Box — see anchors.tsx), so every
    // Box-typed signature below (buildRing, laneShapes, boxCenter, headlineSize, fanOffset via
    // choreography.ts's `Geometry.box`) keeps working unchanged when handed this value.
    const shape = useTargetShape(targetKey ?? '', anim?.targetAnchor)

    const pad = anim?.pad ?? DEFAULT_PAD
    const laneFontSize = anim?.laneFontSize ?? DEFAULT_LANE_FONT
    const speed = anim?.speed ?? DEFAULT_SPEED
    const holdMs = anim?.holdMs ?? DEFAULT_HOLD_MS

    // Lane thickness is derived from the rendered text, same as ring/.
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

    // R1: the fill shape's own outer/inner corner radii. `cornerWidth` defaults to the live
    // `thickness` (Revision 1's stroked look had the corner radius tied to the lane thickness);
    // `cornerRoundness` defaults to DEFAULT_CORNER_ROUNDNESS. Both are clamped to fit their rect
    // only where that rect is actually drawn (geometry.ts's `roundedRectPath`) — nothing here needs
    // to duplicate that bound-checking against box/pad/thickness.
    //
    // board-anchors-plan.md §3.7: when the target published an anchor with its own corner radius
    // (`shape.rx`/`shape.ry` > 0 — e.g. board:sport_style's oval `field`), the defaults follow it
    // instead, so the ring reads as concentric with the anchor out of the box. With the lane's inner
    // edge sitting `pad` outside the shape and its outer edge `pad + thickness` outside it, the
    // concentric radii are `anchorR + pad` (inner) and `anchorR + pad + thickness` (outer) —
    // `cornerWidth` IS that outer radius, `cornerRoundness` the inner one as a fraction of it. A
    // target with no anchor (or `rx`/`ry` = 0, e.g. a plain box promoted by `useTargetShape`) keeps
    // the pre-existing fixed defaults. The two manual settings-panel fields still override either
    // way; the panel's own corner-width placeholder stays the fixed approximation it always was — it
    // cannot see the anchor.
    const anchorR = shape ? Math.min(shape.rx, shape.ry) : 0
    const defaultCornerWidth = anchorR > 0 ? anchorR + pad + thickness : thickness
    const defaultCornerRoundness = anchorR > 0 ? (anchorR + pad) / (anchorR + pad + thickness) : DEFAULT_CORNER_ROUNDNESS
    const cornerWidth = Math.max(0, anim?.cornerWidth ?? defaultCornerWidth)
    const cornerRoundness = Math.min(1, Math.max(0, anim?.cornerRoundness ?? defaultCornerRoundness))
    const cornerRadiusInner = cornerRoundness * cornerWidth
    // The ring CENTRELINE's own radius sits between the two fill radii — see geometry.ts's header.
    const centrelineRadius = Math.max(1, (cornerWidth + cornerRadiusInner) / 2)

    // Keyed on the shape's VALUES, not its identity — see ring/StashOrPassRing.tsx's note: the
    // layout page's reconcile poll hands back a structurally identical but freshly allocated Box
    // (and anchors.tsx's AnchorStore keeps its Shape identity stable the same way), and keying on
    // the object would rebuild the ring every minute for no reason.
    const ring = useMemo(
        () => (shape ? buildRing(shape, pad, thickness, centrelineRadius) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [shape?.x, shape?.y, shape?.w, shape?.h, pad, thickness, centrelineRadius]
    )

    const active = useEventActive('stash_or_pass')

    const [phase, setPhase] = useState<Phase>('idle')
    const phaseRef = useRef(phase)
    phaseRef.current = phase
    const [playToken, setPlayToken] = useState(0)
    const pendingRef = useRef<'play' | null>(null)
    const hadBoxRef = useRef(false)
    const prevActiveRef = useRef(active)
    const [rate, setRate] = useState(1)

    // Two SEPARATE timelines — entrance (word/copies/quarters/text) and exit (text/quarters only,
    // its own forward pass, not a reverse of the entrance). See this file's header and R2.
    const builtEntrance = useMemo(() => {
        if (!shape || !ring) return null
        const rand = rng(playToken + 1)
        return buildTimeline(
            buildStages(holdMs),
            buildTracks({
                box: shape, // choreography.ts's `Geometry.box` stays typed `Box` — `shape` satisfies it.
                ring,
                recoil: DIAGONALS[Math.floor(rand() * DIAGONALS.length)],
                glitch: shuffled(GLITCH_POOL, rand),
            })
        )
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shape, ring, holdMs, playToken])
    const builtExit = useMemo(() => buildTimeline(buildExitStages(), buildExitTracks()), [])
    const built = phase === 'exit' ? builtExit : builtEntrance

    const nodes = useNodes<QElId>()
    const ctl = useTimeline(built, nodes, {
        rate,
        onDone: (direction) => {
            // Read through a ref: this callback closes over the `phase` from whenever `useTimeline`
            // last rebuilt its stable object, which is stale by the time a pass actually completes.
            if (phaseRef.current === 'exit') {
                ctl.cancel()
                setPhase('idle')
                return
            }
            if (direction === 'forward') {
                setPhase('orbit')
            } else {
                ctl.cancel()
                setPhase('idle')
            }
        },
    })

    useSceneEvent(elementKey, 'stash_or_pass', () => {
        if (!shape) return
        pendingRef.current = 'play'
        setPhase('entrance')
        setPlayToken((t) => t + 1)
    })

    useEffect(() => {
        const prev = prevActiveRef.current
        prevActiveRef.current = active
        if (prev && !active && phase !== 'idle') {
            // R2: the exit is a forward play of its OWN timeline, not `ctl.reverse` — see the file
            // header.
            pendingRef.current = 'play'
            setPhase('exit')
            setPlayToken((t) => t + 1)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active])

    useIsomorphicLayoutEffect(() => {
        const pending = pendingRef.current
        pendingRef.current = null
        if (!pending || !built) return
        ctl.play()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playToken])

    useEffect(() => {
        if (!shape) {
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
    }, [shape === undefined])

    if (!anim) return null

    const probe = (
        <span ref={measureRef} className="sopq-measure" style={{ fontSize: laneFontSize }}>
            {PHRASE}
        </span>
    )

    if (!shape || !ring) return probe

    // The rig (word + 4 copy anchors) is mounted only during `entrance` — the exit timeline never
    // touches it, so it does not need to exist while exiting.
    const showRig = phase === 'entrance'
    const centre = boxCenter(shape)

    return (
        <>
            {probe}
            <div className="sopq-root" style={{ '--sopq-headline': `${headlineSize(shape)}px` } as Style}>
                {/* The blue wash under the word — mounted only alongside the rest of the entrance
                    rig, rendered BEFORE <Lane/> and the word/copy rig so both paint over it. */}
                {showRig && (
                    <div
                        ref={nodes.ref('fill')}
                        className="sopq-fill"
                        style={{
                            left: shape.x + (shape.w * (1 - FILL_FRACTION)) / 2,
                            top: shape.y + (shape.h * (1 - FILL_FRACTION)) / 2,
                            width: shape.w * FILL_FRACTION,
                            height: shape.h * FILL_FRACTION,
                        }}
                    />
                )}
                <Lane
                    ring={ring}
                    laneFontSize={laneFontSize}
                    thickness={thickness}
                    speed={speed}
                    nodes={nodes}
                    phase={phase}
                    shape={shape}
                    pad={pad}
                    cornerRadiusOuter={cornerWidth}
                    cornerRadiusInner={cornerRadiusInner}
                />
                {/* Rendered AFTER <Lane/> (plus the z-index pair in the CSS) so the word/copies
                    always paint in front of the masked lane shapes as they land/arrive — see the
                    coordinator follow-up: DOM order alone used to let the lane paint over them. */}
                {showRig && (
                    <>
                        {SIDE_ORDER.map((side, i) => (
                            <div key={side} className="sopq-anchor" style={{ left: centre.x, top: centre.y }}>
                                <div ref={nodes.ref('copy', i)} className="sopq-copy">
                                    {PHRASE}
                                </div>
                            </div>
                        ))}
                        <div className="sopq-anchor" style={{ left: centre.x, top: centre.y }}>
                            <div ref={nodes.ref('word')} className="sopq-word">
                                {PHRASE}
                            </div>
                        </div>
                    </>
                )}
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
                title="stash or pass — sport style"
            />
        </>
    )
}

/**
 * The four quarter-lane fill shapes, revealed through a mask of four animated quarter strokes,
 * plus the scrolling text (phrases and, per R3, one white star centred in every gap between them).
 */
function Lane({
    ring,
    laneFontSize,
    thickness,
    speed,
    nodes,
    phase,
    shape,
    pad,
    cornerRadiusOuter,
    cornerRadiusInner,
}: {
    ring: ReturnType<typeof buildRing>
    laneFontSize: number
    thickness: number
    speed: number
    nodes: NodeStore<QElId>
    phase: Phase
    shape: { x: number; y: number; w: number; h: number }
    pad: number
    cornerRadiusOuter: number
    cornerRadiusInner: number
}) {
    // useId is unique per component instance, so two quarters elements on one canvas cannot
    // collide over their <defs>. The colons React puts in the id are stripped — legal in an id
    // attribute but awkward inside url(#…)/href(#…) references.
    const uid = useId().replace(/:/g, '')
    const pathId = `sopq-path-${uid}`
    const textPathId = `sopq-textpath-${uid}`
    const maskId = `sopq-mask-${uid}`

    const pathRef = useRef<SVGPathElement>(null)
    const phraseRef = useRef<SVGTextElement>(null)
    const starRef = useRef<SVGTextElement>(null)
    const slotRefs = useRef<Array<SVGTextPathElement | null>>([])
    const starRefs = useRef<Array<SVGTextPathElement | null>>([])

    const [metrics, setMetrics] = useState<{ perimeter: number; phrase: number; star: number } | null>(null)

    useEffect(() => {
        function measure() {
            const path = pathRef.current
            const phrase = phraseRef.current
            const star = starRef.current
            if (!path || !phrase || !star) return
            const perimeter = path.getTotalLength()
            const phraseWidth = phrase.getComputedTextLength()
            const starWidth = star.getComputedTextLength()
            if (perimeter > 0 && phraseWidth > 0 && starWidth > 0) {
                setMetrics({ perimeter, phrase: phraseWidth, star: starWidth })
            }
        }
        measure()
        // Grechka SHA loads async (font-display: block) and changes the phrase width once it swaps
        // in; the star's own font stack (see StashOrPassQuarters.css) does not depend on it, but
        // re-measuring both together is simplest and costs nothing extra.
        if (typeof document !== 'undefined' && 'fonts' in document) {
            document.fonts.ready.then(measure).catch(() => {})
        }
    }, [ring.d, laneFontSize])

    const slots = useMemo(
        () =>
            metrics
                ? phraseSlots(metrics.perimeter, metrics.phrase, metrics.star, PHRASE_GAP_EM * laneFontSize, ring.sideMid[0])
                : null,
        // ring.sideMid[0], not ring.sideMid: an array dep is identity-compared and would rebuild
        // `slots` on every re-render, restarting the scroll loop below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [metrics, laneFontSize, ring.sideMid[0]]
    )

    // Scroll position, held across effect restarts — see ring/'s note: anything that changes this
    // effect's deps tears it down and rebuilds it, and re-seeding the phase there snaps the text
    // backwards by up to a whole slot.
    const scrollRef = useRef<{ base: number } | null>(null)

    // `running` covers orbit AND exit — the text keeps scrolling while it fades out.
    const running = phase === 'orbit' || phase === 'exit'

    useEffect(() => {
        if (!running) {
            scrollRef.current = null
            return
        }
        if (!slots || !metrics) return

        const held = scrollRef.current
        const pos =
            held && held.base >= slots.origin && held.base < slots.wrapAt ? held : { base: slots.base0 }
        scrollRef.current = pos

        let raf = 0
        // Seeded on the first tick from the rAF clock itself — see ring/'s note on why priming
        // from performance.now() beforehand can yield a negative first delta.
        let prev: number | null = null
        const tick = (now: number) => {
            const dt = prev === null ? 0 : Math.max(0, Math.min(0.1, (now - prev) / 1000))
            prev = now
            pos.base += speed * dt
            if (pos.base >= slots.wrapAt) pos.base -= slots.slot
            const offsets = slotOffsets(pos.base, slots.slot, slots.count)
            const starOffs = starOffsets(pos.base, slots.slot, slots.count, metrics.phrase, metrics.star)
            for (let i = 0; i < offsets.length; i++) {
                slotRefs.current[i]?.setAttribute('startOffset', String(offsets[i]))
                starRefs.current[i]?.setAttribute('startOffset', String(starOffs[i]))
            }
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [running, slots, speed, metrics])

    const initialOffsets = slots ? slotOffsets(slots.base0, slots.slot, slots.count) : []
    const initialStarOffsets =
        slots && metrics ? starOffsets(slots.base0, slots.slot, slots.count, metrics.phrase, metrics.star) : []
    const textD = slots ? ringTextPath(ring, slots.laps) : null
    const paths = quarterPaths(ring)
    const shapes = laneShapes(shape, pad, thickness, cornerRadiusOuter, cornerRadiusInner, EDGE_PX)

    return (
        <svg
            className="sopq-svg"
            width={CANVAS.w}
            height={CANVAS.h}
            viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
        >
            <defs>
                {/* Measured only — getTotalLength() seeds the perimeter the seam maths needs. Never
                    painted: the visible lane is the two filled shapes below, revealed by the mask. */}
                <path id={pathId} ref={pathRef} d={ring.d} fill="none" />
                {/* Ridden by the text: several open laps, so no glyph is ever near an end. */}
                {textD && <path id={textPathId} d={textD} fill="none" />}
                {/* Off-path probes: ONE phrase's width and the star's, what the ring is divided by
                    (R3). Hidden, but they must be laid out, so `visibility` rather than `display`. */}
                <text
                    ref={phraseRef}
                    className="sopq-lane-text"
                    style={{ fontSize: laneFontSize, visibility: 'hidden' }}
                >
                    {PHRASE}
                </text>
                <text
                    ref={starRef}
                    className="sopq-lane-star"
                    style={{ fontSize: laneFontSize * STAR_FONT_RATIO, visibility: 'hidden' }}
                >
                    {STAR}
                </text>
                {/* R1: the reveal. Four animated strokes, one per quarter, mask the two filled ring
                    shapes below into existence as they draw. A mask stroke three lanes wide
                    comfortably covers the white edge and the fatter rounded corners. */}
                <mask id={maskId} maskUnits="userSpaceOnUse">
                    {SIDE_ORDER.map((side, i) => (
                        <path
                            key={side}
                            ref={nodes.ref('quarter', i)}
                            d={paths[i]}
                            pathLength={1}
                            stroke="#fff"
                            fill="none"
                            strokeLinecap="butt"
                            strokeLinejoin="round"
                            strokeWidth={thickness * 3}
                            className={`sopq-quarter${phase === 'orbit' ? ' sopq-quarter--on' : ''}`}
                        />
                    ))}
                </mask>
            </defs>

            <g mask={`url(#${maskId})`}>
                <path d={shapes.white} className="sopq-lane-white" fillRule="evenodd" />
                <path d={shapes.blue} className="sopq-lane-blue" fillRule="evenodd" />
            </g>

            {/* --on applies in `orbit` ONLY — during `exit` the reversed-in-spirit `text fades in`
                counterpart (the exit timeline's own `text fades out` track) owns opacity instead.
                `running` above covers both. */}
            <g
                ref={nodes.ref('text')}
                className={`sopq-text${phase === 'orbit' ? ' sopq-text--on' : ''}`}
            >
                {initialOffsets.map((offset, i) => (
                    <text key={`phrase-${i}`} className="sopq-lane-text" style={{ fontSize: laneFontSize }}>
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
                {initialStarOffsets.map((offset, i) => (
                    <text
                        key={`star-${i}`}
                        className="sopq-lane-star"
                        style={{ fontSize: laneFontSize * STAR_FONT_RATIO }}
                    >
                        <textPath
                            ref={(el) => {
                                starRefs.current[i] = el
                            }}
                            href={`#${textPathId}`}
                            startOffset={offset}
                            dominantBaseline="central"
                        >
                            {STAR}
                        </textPath>
                    </text>
                ))}
            </g>
        </svg>
    )
}

export default StashOrPassQuarters
