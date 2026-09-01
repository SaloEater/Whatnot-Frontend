// THE EDIT SURFACE for the single-lane (ring) build. Same engine and same anchor grammar as
// tl/choreography.ts; two things differ, both of them the point of this experiment:
//
//   1. STAGGER = 0. The four copies arrive at the SAME instant, so the lane forms as one uniform
//      ring rather than assembling in four steps. Because nothing here is written as an absolute
//      time, this is a single constant: the flights, the absorptions, the lane lighting and the
//      `absorb` stage's own length all re-resolve around it.
//   2. A `form` stage after the absorption — the ring exists, whole and STILL, before anything
//      starts moving. The marquee only begins when the orbit takes over at the end of it.
//
// WHAT DIES WITH THE STAGGER. overlay-stash-or-pass-spec.md §4's constraint ("pulse corner-travel
// time = arrival stagger = 70ms") existed to turn four absorptions into one wave energising a
// circuit. With simultaneous arrival there is no wave to chase and the constraint is meaningless.
// What replaces it is better suited to this build and still unimplemented in all three: on a
// single continuous lane a pulse is one element riding the same path, so a full lap is one
// animation rather than four hand-tied segments.

import type { Box } from '../../../schema'
import type { Stage, Track } from '../timeline/timeline'
import { SIDE_ORDER, boxCenter, fanOffset } from './ringGeometry'
import type { Ring } from './ringGeometry'

/** The animatable parts of this build. `copy` has four instances; `lane` is a single ring. */
export type RingElId = 'wash' | 'ring' | 'fill' | 'blowout' | 'word' | 'copy' | 'lane'

/* PACING. Like tl/choreography.ts, these are 5x overlay-stash-or-pass-spec.md §2's figures, each
 * annotated with the spec value it came from — the spec's own pace reads far too fast on stream.
 * The two builds MUST stay at the same pace or placing them side by side compares nothing. */

/**
 * Zero, and that is the whole change: the copies land together, so the lane forms as one uniform
 * ring instead of assembling in four steps. Kept as a named constant rather than deleted so the
 * simultaneous arrival stays a legible DECISION, and so raising it back above zero is still a
 * one-number experiment.
 */
export const STAGGER = 0
/** One copy's own flight. Spec §2 allots 240; halved on the user's direction, then paced. */
export const TRAVEL = 600
/** Settle after the overshoot at the end of a flight. Spec §2 says +120; halved likewise. */
export const ABSORB = 300
/** How far the copies' warm-up reaches back BEHIND the split label. (Spec-scale: 60.) */
export const WARMUP_LEAD = 300
/** Recoil kick of the original word during its distortion, in px. */
export const RECOIL_PX = 14
/** How long the finished ring holds still, whole and uniform, before the text starts running. */
export const FORM_MS = 700

export function buildStages(holdMs: number): Stage[] {
    return [
        { id: 'anticipation', dur: 700 }, // spec 140
        { id: 'impact', dur: 400 }, // spec 80
        { id: 'hold', dur: holdMs },
        { id: 'split', dur: 600 }, // spec 120
        { id: 'travel', dur: TRAVEL },
        { id: 'absorb', dur: (SIDE_ORDER.length - 1) * STAGGER + ABSORB },
        { id: 'form', dur: FORM_MS },
    ]
}

function xf(x: number, y: number, rot = 0, sx = 1, sy = 1, skew = 0): string {
    // Every keyframe emits the SAME function list — transforms only interpolate componentwise
    // when the lists match.
    return (
        `translate(${round(x)}px, ${round(y)}px) rotate(${round(rot)}deg)` +
        ` scale(${round(sx, 3)}, ${round(sy, 3)}) skewX(${round(skew)}deg)`
    )
}
function round(n: number, dp = 2): number {
    const f = 10 ** dp
    return Math.round(n * f) / f
}

export type Geometry = {
    box: Box
    ring: Ring
    recoil: [number, number]
    glitch: string[]
}

export function buildTracks(g: Geometry): Track<RingElId>[] {
    const { box, ring, recoil, glitch } = g
    const centre = boxCenter(box)
    const tracks: Track<RingElId>[] = []
    const ground = 'var(--soptlr-ground)'

    /* ── ground wash ── */
    tracks.push(
        {
            el: 'wash',
            at: 'anticipation',
            dur: { until: 'anticipation:end' },
            keys: [{ opacity: 0 }, { opacity: 0.35 }],
            easing: 'ease-in',
            label: 'wash dims',
        },
        {
            el: 'wash',
            at: 'split',
            dur: 1000, // spec 200
            keys: [{ opacity: 0.35 }, { opacity: 0 }],
            easing: 'ease-out',
            label: 'wash releases',
        }
    )

    /* ── anticipation ring + impact fill + blowout ── */
    tracks.push(
        {
            el: 'ring',
            at: 'anticipation',
            dur: { until: 'anticipation:end' },
            keys: [
                { transform: 'scale(1.08)', opacity: 0.5 },
                { transform: 'scale(1)', opacity: 1 },
            ],
            easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
            label: 'ring contracts',
        },
        {
            el: 'ring',
            at: 'impact',
            dur: 600, // spec 120
            keys: [
                { transform: 'scale(1)', opacity: 1 },
                { transform: 'scale(1)', opacity: 0 },
            ],
            easing: 'ease-out',
            label: 'ring out',
        },
        {
            el: 'fill',
            at: 'impact',
            dur: { until: 'impact:end' },
            keys: [{ opacity: 0 }, { opacity: 1 }],
            easing: 'ease-out',
            label: 'fill lights',
        },
        {
            // Starts clearing on the arrival — which is now a single instant for all four copies —
            // and runs to the handoff, so the board is showing through again by the time the text
            // starts moving (spec §6: the orbit's job is to FRAME the board).
            el: 'fill',
            at: ['travel', TRAVEL],
            dur: { until: 'end' },
            keys: [{ opacity: 1 }, { opacity: 0 }],
            easing: 'linear',
            label: 'fill drains',
        },
        {
            el: 'blowout',
            at: 'impact',
            dur: { until: 'impact:end' },
            keys: [{ opacity: 0 }, { offset: 0.35, opacity: 0.9 }, { opacity: 0 }],
            easing: 'ease-out',
            label: 'frame blows out',
        }
    )

    /* ── the original word ── */
    tracks.push({
        el: 'word',
        at: 'impact',
        dur: { until: 'impact:end' },
        keys: [
            { transform: xf(0, 0, 0, 0.92, 0.92), opacity: 0, color: ground },
            { offset: 0.6, transform: xf(0, 0, 0, 1.03, 1.03), opacity: 1, color: ground },
            { transform: xf(0, 0, 0, 1, 1), opacity: 1, color: ground },
        ],
        easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
        label: 'word lands',
    })

    const kick = recoil[0] * RECOIL_PX
    // [x, scaleX, scaleY, skewX] per held colour stop.
    const shear: Array<[number, number, number, number]> = [
        [0, 1, 1, 0],
        [kick, 1.1, 0.86, -6],
        [-kick, 0.9, 1.16, 6],
        [kick, 1.14, 0.82, -8],
        [-kick, 0.86, 1.2, 7],
        [0, 1.3, 0.6, 0],
    ]
    tracks.push({
        el: 'word',
        at: 'split',
        dur: { until: 'split:end' },
        keys: shear.map(([x, sx, sy, sk], i) => ({
            offset: i / (shear.length - 1),
            transform: xf(x, 0, 0, sx, sy, sk),
            opacity: i >= shear.length - 2 ? (i === shear.length - 1 ? 0 : 0.9) : 1,
            color: glitch[i] ?? ground,
            easing: 'steps(1)',
        })),
        label: 'word distorts out',
    })

    /* ── the four copies ── identical warm-up/spawn/fan to the four-lane build, but every flight
     * starts on the same anchor and lands on the same instant, and each copy arrives already
     * rotated to the TANGENT of the stream it is becoming (0/90/180/270). ── */
    SIDE_ORDER.forEach((side, i) => {
        const fan = fanOffset(i, box)
        const lx = ring.sidePoint[i].x - centre.x
        const ly = ring.sidePoint[i].y - centre.y
        const rot = ring.sideRot[i]

        tracks.push(
            {
                // The warm-up: reaches WARMUP_LEAD ms back behind the `split` label, into the tail
                // of `hold`. Move `split` and it follows; lengthen `hold` and it stays glued.
                el: 'copy',
                index: i,
                at: ['split', -WARMUP_LEAD],
                dur: WARMUP_LEAD,
                keys: [
                    { transform: xf(0, 0, 0, 0.8, 0.8), opacity: 0 },
                    { transform: xf(0, 0, 0, 0.92, 0.92), opacity: 0.35 },
                ],
                easing: 'ease-out',
                label: `copy ${side} warms up`,
            },
            {
                el: 'copy',
                index: i,
                at: 'split',
                dur: 240, // spec 48
                keys: [
                    { transform: xf(0, 0, 0, 0.92, 0.92), opacity: 0.35 },
                    { transform: xf(0, 0, 0, 1, 1), opacity: 1 },
                ],
                easing: 'ease-out',
                label: `copy ${side} spawns`,
            },
            {
                el: 'copy',
                index: i,
                at: ['split', 240],
                dur: { until: 'split:end' },
                keys: [
                    { transform: xf(0, 0, 0, 1, 1), opacity: 1 },
                    { transform: xf(fan.x, fan.y, 0, 1, 1), opacity: 1 },
                ],
                easing: 'ease-out',
                label: `copy ${side} fans`,
            },
            {
                el: 'copy',
                index: i,
                at: ['travel', i * STAGGER],
                dur: TRAVEL,
                keys: [
                    { transform: xf(fan.x, fan.y, 0, 1, 1), opacity: 1 },
                    {
                        // Rotation completes at ~80% of the flight (spec §3): the last stretch is
                        // pure translation, so the copy arrives already square to its line.
                        offset: 0.8,
                        transform: xf(fan.x + (lx - fan.x) * 0.8, fan.y + (ly - fan.y) * 0.8, rot, 1, 1),
                        opacity: 1,
                    },
                    { transform: xf(lx, ly, rot, 1, 1), opacity: 1 },
                ],
                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
                label: `copy ${side} flies`,
            },
            {
                el: 'copy',
                index: i,
                at: ['travel', i * STAGGER + TRAVEL],
                dur: ABSORB,
                keys: [
                    { transform: xf(lx, ly, rot, 1, 1), opacity: 1 },
                    { transform: xf(lx, ly, rot, 1, 0.12), opacity: 0 },
                ],
                easing: 'ease-in',
                label: `copy ${side} absorbs`,
            }
        )
    })

    /* ── the lane ── ONE track, not four: the ring is a single object and it lights in one go as
     * the four copies squash into it. It then holds, whole and still, for the `form` stage before
     * the orbit starts the text running. ── */
    tracks.push({
        el: 'lane',
        at: ['travel', TRAVEL],
        dur: ABSORB,
        keys: [{ opacity: 0 }, { opacity: 1 }],
        easing: 'ease-out',
        label: 'lane forms',
    })

    return tracks
}
