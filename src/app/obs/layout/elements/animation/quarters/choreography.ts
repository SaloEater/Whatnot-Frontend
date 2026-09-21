// THE EDIT SURFACE for `animation:stashOrPassSportStyle` — the fourth stash-or-pass build (see
// stash-or-pass-quarters-plan.md). Same engine as ring/choreography.ts (timeline/timeline.ts).
//
// Revision 2, R2 rewires the entrance: there is no board COVER any more (the grey rectangle that
// used to sit over the whole entrance is gone) — but there IS a `fill`, a blue wash the same colour
// as the lane that lights under the word as it lands and drains away again once the copies start
// fanning, so the word reads as sitting on a lit panel rather than bare on the board. The word
// "STASH OR PASS" lands and distorts out, four copies fan out and fly to the ring's side midpoints —
// all copied verbatim from ring/choreography.ts (`xf`, the shear table, `TRAVEL`/`ABSORB`,
// `RECOIL_PX`) — while the four quarter-lanes grow in place alongside them, timed to finish exactly
// when the copies land (`quarter` is anchored `impact` -> `travel:end`, the one anchor that ties
// "arrival matches completion"; see the plan for why that must stay an anchor, not a fixed ms).
//
// A later follow-up re-sequenced the split: `split` (word distorts out, 600ms) and `fan` (copies
// spawn and fan to the diagonals, 600ms) are now separate, back-to-back stages, so the copies
// REPLACE the word rather than overlapping it — nothing of a copy is visible before `split:end`.
// There is deliberately no warm-up track any more (ring/'s `WARMUP_LEAD` is not copied here): the
// copies spawn from nothing at the first frame of `fan`, which is exactly the frame the word has
// just finished vanishing on, so the cut reads as a replacement rather than a cross-fade.
//
// The one thing NOT copied from ring/ is `STAGGER`/per-copy arrival offsets: this build already had
// simultaneous arrival as its whole premise (the four quarters, not one lane), so the copy tracks
// below use the plain `'travel'`/`'absorb'` labels rather than `['travel', i * STAGGER]` — that is
// exactly equivalent to ring/'s `STAGGER = 0`, just without carrying the now-pointless constant.
//
// Exit is a SEPARATE forward timeline (`buildExitStages`/`buildExitTracks`), not a reverse of the
// entrance: reversing the fan-in would fly the copies back into the board and un-glitch the word,
// which nobody asked for. See StashOrPassQuarters.tsx for how the component picks between the two
// built timelines by phase.

import type { Box } from '../../../schema'
import type { Stage, Track } from '../timeline/timeline'
import { SIDE_ORDER, boxCenter, fanOffset } from './geometry'
import type { Ring } from './geometry'

/** The animatable parts of the ENTRANCE timeline. `copy` and `quarter` have four instances each;
 *  `word`/`fill`/`text` are singletons. The exit timeline (see below) only ever drives `text` and
 *  `quarter` — the rig (`word`/`copy`/`fill`) is unmounted by then. */
export type QElId = 'word' | 'copy' | 'quarter' | 'fill' | 'text'

/** One copy's own flight. Copied from ring/choreography.ts verbatim — see its header for the
 *  spec-scale provenance of each of these numbers. */
export const TRAVEL = 600
export const ABSORB = 300
export const RECOIL_PX = 14

/** Ease matching the previous (Revision 1) quarter growth — no overshoot, since the quarters now
 *  arrive exactly as the copies land rather than settling on their own. */
const DRAW_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

export function buildStages(holdMs: number): Stage[] {
    return [
        { id: 'impact', dur: 400 },
        { id: 'hold', dur: holdMs },
        { id: 'split', dur: 600 },
        { id: 'fan', dur: 600 },
        { id: 'travel', dur: TRAVEL },
        { id: 'absorb', dur: ABSORB },
        { id: 'form', dur: 700 },
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

export function buildTracks(g: Geometry): Track<QElId>[] {
    const { box, ring, recoil, glitch } = g
    const centre = boxCenter(box)
    const tracks: Track<QElId>[] = []
    const white = 'var(--sopq-white)'

    /* ── the four quarter-lanes — grow from `impact` until the copies land (`travel:end`) ── */
    SIDE_ORDER.forEach((side, i) => {
        tracks.push({
            el: 'quarter',
            index: i,
            at: 'impact',
            dur: { until: 'travel:end' },
            keys: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
            easing: DRAW_EASING,
            label: `quarter ${side} draws`,
        })
    })

    /* ── the fill — a blue wash under the word, lit as it lands and drained as the copies fan out.
     * Between `impact:end` and `fan` the `fill lights` track's `fill: 'forwards'` holds it at 1;
     * there is no exit-timeline counterpart — the rig (this included) is unmounted outside the
     * entrance, so there is nothing left to drain by the time `exit` could run. ── */
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
            at: 'fan',
            dur: { until: 'fan:end' },
            keys: [{ opacity: 1 }, { opacity: 0 }],
            easing: 'linear',
            label: 'fill drains',
        }
    )

    /* ── the original word — lands, holds, distorts out (ring's tracks, white in place of gold) ── */
    tracks.push({
        el: 'word',
        at: 'impact',
        dur: { until: 'impact:end' },
        keys: [
            { transform: xf(0, 0, 0, 0.92, 0.92), opacity: 0, color: white },
            { offset: 0.6, transform: xf(0, 0, 0, 1.03, 1.03), opacity: 1, color: white },
            { transform: xf(0, 0, 0, 1, 1), opacity: 1, color: white },
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
            color: glitch[i] ?? white,
            easing: 'steps(1)',
        })),
        label: 'word distorts out',
    })

    /* ── the four copies — spawn (replacing the vanished word), fan to the diagonals, fly to the
     * ring, absorb into it. No warm-up: the copies are invisible for the whole of `split` and only
     * appear at `fan`'s first frame, right as the word finishes vanishing (see this file's header).
     * Simultaneous arrival (ring/'s STAGGER = 0) — see this file's header. ── */
    SIDE_ORDER.forEach((side, i) => {
        const fan = fanOffset(i, box)
        const lx = ring.sidePoint[i].x - centre.x
        const ly = ring.sidePoint[i].y - centre.y
        const rot = ring.sideRot[i]

        tracks.push(
            {
                el: 'copy',
                index: i,
                at: 'fan',
                dur: 240,
                keys: [
                    { transform: xf(0, 0, 0, 0.92, 0.92), opacity: 0 },
                    { transform: xf(0, 0, 0, 1, 1), opacity: 1 },
                ],
                easing: 'ease-out',
                label: `copy ${side} spawns`,
            },
            {
                el: 'copy',
                index: i,
                at: ['fan', 240],
                dur: { until: 'fan:end' },
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
                at: 'travel',
                dur: TRAVEL,
                keys: [
                    { transform: xf(fan.x, fan.y, 0, 1, 1), opacity: 1 },
                    {
                        // Rotation completes at ~80% of the flight: the last stretch is pure
                        // translation, so the copy arrives already square to its line.
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
                at: 'absorb',
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

    /* ── lane text — fades in over the same 300ms the copies absorb ── */
    tracks.push({
        el: 'text',
        at: 'absorb',
        dur: { until: 'absorb:end' },
        keys: [{ opacity: 0 }, { opacity: 1 }],
        easing: 'ease-out',
        label: 'text fades in',
    })

    return tracks
}

/* ── Exit: its own forward timeline (R2) — NOT a reverse of the entrance. Only `text` and
 * `quarter` animate; the rig is unmounted during `exit` (see StashOrPassQuarters.tsx). ── */

export const EXIT_FADE_MS = 500
export const EXIT_RETRACT_MS = 700

export function buildExitStages(): Stage[] {
    return [
        { id: 'fade', dur: EXIT_FADE_MS },
        { id: 'retract', dur: EXIT_RETRACT_MS },
    ]
}

export function buildExitTracks(): Track<QElId>[] {
    const tracks: Track<QElId>[] = []

    tracks.push({
        el: 'text',
        at: 'fade',
        dur: { until: 'fade:end' },
        keys: [{ opacity: 1 }, { opacity: 0 }],
        easing: 'ease-in',
        label: 'text fades out',
    })

    // Anchored at `fade`, not `retract`: this holds every quarter at strokeDashoffset 0 from the
    // very first exit frame (the `--on` class is off during `exit`, so without this the quarters
    // would otherwise snap to the CSS base of 1 the instant the entrance's own track stops
    // applying). The first segment is a flat hold (linear, `until` the retract boundary), the
    // second is the actual retraction.
    const holdEnd = EXIT_FADE_MS / (EXIT_FADE_MS + EXIT_RETRACT_MS)
    SIDE_ORDER.forEach((side, i) => {
        tracks.push({
            el: 'quarter',
            index: i,
            at: 'fade',
            dur: { until: 'end' },
            keys: [
                { strokeDashoffset: 0, easing: 'linear' },
                { offset: holdEnd, strokeDashoffset: 0, easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
                { strokeDashoffset: 1 },
            ],
            label: `quarter ${side} retracts`,
        })
    })

    return tracks
}
