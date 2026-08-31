// THE EDIT SURFACE (stash-or-pass-timeline-plan.md §4). This is the only file to touch for a
// normal timing change, a new stage, or a warm-up. Nothing here is an absolute time: every track
// is anchored to a stage label, so retiming a stage moves everything downstream of it — and
// everything anchored to it — automatically.
//
// Choreography follows overlay-stash-or-pass-spec.md §2/§3. Where the original element departed
// from the spec on the user's direction (halved travel and settle, a corner fan instead of a 12px
// stack) the rebuild keeps the departure, so old and new can be compared like for like.

import type { Box } from '../../../schema'
import type { Stage, Track } from './timeline'
import { BAND_ORDER, BAND_ROTATION, bandCenter, boxCenter, fanOffset } from './geometry'

/* ── The numbers ────────────────────────────────────────────────────────────────────────────
 * Production milliseconds, played at rate 1. There is no TIME_SCALE here and no `--soptl-ts` in
 * the CSS: temporarily slowing the whole thing down for tuning is `controller.setRate()`, live,
 * and leaves nothing in the source.
 *
 * These are 5x overlay-stash-or-pass-spec.md §2's figures, and each is annotated with the spec
 * value it came from. The spec's own pace reads far too fast on stream — the element this one
 * replaces shipped a committed `TIME_SCALE = 5` for exactly that reason. Rather than carry that
 * multiplier (a debug knob that quietly became production) or ship a default playback rate of 0.2
 * (a "wrong" number that has to be corrected everywhere it is read), the decision is baked into
 * the timings themselves: what is written here is what plays.
 */

/** spec §4's hard constraint: pulse corner-travel time === arrival stagger. (Spec: 70.) */
export const STAGGER = 350
/** One copy's own flight. Spec §2 allots 240; halved on the user's direction, then paced. */
export const TRAVEL = 600
/** Settle after the overshoot at the end of a flight. Spec §2 says +120; halved likewise. */
export const ABSORB = 300
/** How far the copies' warm-up reaches back BEHIND the split label — the overlap this whole
 *  rebuild exists to make expressible. At the default hold this lands inside `hold`. */
export const WARMUP_LEAD = 300
/** Recoil kick of the original word during its distortion, in px. */
export const RECOIL_PX = 14

/**
 * Stages, in order. `hold` comes from config (`element.holdMs`) because spec §7.1 calls it the
 * single most likely timing to need retuning without a redeploy.
 *
 * `absorb` covers the three later arrivals plus the last copy's settle, so the timeline ends
 * exactly when the fourth band is lit and the orbit can take over.
 */
export function buildStages(holdMs: number): Stage[] {
    return [
        { id: 'anticipation', dur: 700 }, // spec 140
        { id: 'impact', dur: 400 }, // spec 80
        { id: 'hold', dur: holdMs },
        { id: 'split', dur: 600 }, // spec 120
        { id: 'travel', dur: TRAVEL },
        { id: 'absorb', dur: (BAND_ORDER.length - 1) * STAGGER + ABSORB },
    ]
}

/* ── Transform helper ───────────────────────────────────────────────────────────────────────
 * Every animated node sits inside a static anchor that already carries `translate(-50%, -50%)`,
 * so the keyframes below are plain px/deg with an identical function list on every keyframe.
 * (The original element interpolated `translate(calc(-50% + Npx), …)` strings instead, which is
 * both harder to read and fragile to interpolate.)
 */
function xf(x: number, y: number, rot = 0, sx = 1, sy = 1, skew = 0): string {
    // Every keyframe emits the SAME function list — translate/rotate/scale/skewX — because
    // transforms only interpolate componentwise when the lists match. Anything that needs a shear
    // (the word's distortion) therefore pays for a `skewX(0deg)` on every other keyframe too.
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
    pad: number
    thickness: number
    /** Which diagonal the word kicks toward this play (seeded — see StashOrPassTl.tsx). */
    recoil: [number, number]
    /** This play's six distortion tones, already shuffled. */
    glitch: string[]
}

/**
 * The choreography. Read it as: WHO moves, WHEN relative to a stage, for HOW LONG, and BETWEEN
 * WHAT VALUES. Tracks may overlap freely — several tracks driving the same property on the same
 * element form a chain of segments in clock order (see buildTimeline's sort note).
 */
export function buildTracks(g: Geometry): Track[] {
    const { box, pad, thickness, recoil, glitch } = g
    const centre = boxCenter(box)
    const tracks: Track[] = []

    /* ── ground wash ── dims for the anticipation, released once the word splits ── */
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

    /* ── ring ── spec §3: doing the inverse of the impact first is what makes the impact read
     * as a release. Gone as soon as the gold fill takes over. ── */
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
        }
    )

    /* ── gold fill + white blowout ── the fill is the ground the copies read against, so it holds
     * at full through the whole flight. It begins to clear on the FIRST arrival and keeps going
     * as the other three land, so the board is showing through again exactly as the orbit takes
     * over (spec §6: "the gold fill drains during travel so the board is clear before the orbit
     * settles" — the orbit's job is to FRAME the board, so the board has to be visible).
     *
     * `{ until: 'end' }` rather than a duration: retune the stagger or the settle and the drain
     * re-spans to match instead of finishing early and popping, or being clipped by the handoff.
     * Linear on purpose — ease-out would dump most of the gold before the later copies land and
     * take away the ground they are read against. ── */
    const firstArrival = TRAVEL
    tracks.push(
        {
            el: 'fill',
            at: 'impact',
            dur: { until: 'impact:end' },
            keys: [{ opacity: 0 }, { opacity: 1 }],
            easing: 'ease-out',
            label: 'fill lights',
        },
        {
            el: 'fill',
            at: ['travel', firstArrival],
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

    /* ── the original word ── lands on the impact, holds (the only moment anyone reads it,
     * spec §3), then distorts and blinks out while the copies take its position. ── */
    const ground = 'var(--soptl-ground)'
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

    // Six held colour stops on the same clock as the shear, so colour and shape break up
    // together. `steps(1)` per stop is what makes it read as a flicker rather than a fade.
    const kick = recoil[0] * RECOIL_PX
    // [x, scaleX, scaleY, skewX] per stop.
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
            // The word is fully opaque until the last two stops — it is still the thing being
            // read while the copies peel off it.
            opacity: i >= shear.length - 2 ? (i === shear.length - 1 ? 0 : 0.9) : 1,
            color: glitch[i] ?? ground,
            easing: 'steps(1)',
        })),
        label: 'word distorts out',
    })

    /* ── the four copies ────────────────────────────────────────────────────────────────────
     * THE WARM-UP. This is the track that the original architecture could not express: it starts
     * WARMUP_LEAD ms before the `split` label, i.e. inside the tail of `hold`, so the copies are
     * already faintly present under the word by the time it begins to break up. Move `split`
     * anywhere and the warm-up follows it; lengthen `hold` and the warm-up stays glued to the
     * split, not to a number.
     */
    BAND_ORDER.forEach((side, i) => {
        const fan = fanOffset(i, box)
        const landing = bandCenter(box, pad, thickness, side)
        const lx = landing.x - centre.x
        const ly = landing.y - centre.y
        const rot = BAND_ROTATION[side]

        tracks.push(
            {
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
                // Spawn exactly ON the word's position — the copies read as coming OUT of it.
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
                at: ['split', 48],
                dur: { until: 'split:end' },
                keys: [
                    { transform: xf(0, 0, 0, 1, 1), opacity: 1 },
                    { transform: xf(fan.x, fan.y, 0, 1, 1), opacity: 1 },
                ],
                easing: 'ease-out',
                label: `copy ${side} fans`,
            },
            {
                // The stagger is a DELAY, not four different durations — which is what it always
                // meant, and what the original could not say.
                // Rotation completes at ~80% of the flight (spec §3): the last stretch is pure
                // translation, so the copy arrives already square to its line.
                el: 'copy',
                index: i,
                at: ['travel', i * STAGGER],
                dur: TRAVEL,
                keys: [
                    { transform: xf(fan.x, fan.y, 0, 1, 1), opacity: 1 },
                    {
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
                // Absorption preserves rather than removes (spec §3): the text squashes toward
                // the band's own thickness. A fade would break "the word becomes the stream".
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
            },
            {
                // The band lights as its own copy lands in it — anchored to that arrival rather
                // than to a magic number, so retuning the stagger moves both together.
                el: 'band',
                index: i,
                at: ['travel', i * STAGGER + TRAVEL],
                dur: ABSORB,
                keys: [{ opacity: 0 }, { opacity: 1 }],
                easing: 'ease-out',
                label: `band ${side} lights`,
            }
        )
    })

    return tracks
}
