// Geometry for `animation:stashOrPassSportStyle` — the fourth stash-or-pass build.
//
// Copied from `ring/ringGeometry.ts` (not imported): `buildRing`, `ringTextPath`, `phraseSlots`,
// `slotOffsets`, `boxCenter`, `SIDE_ORDER`, `Ring`, `RingSide`, and — since Revision 2 re-added a
// fan-in entrance — `DIAGONALS`, `CORNER_FRACTION`, `fanOffset`, `headlineSize` are duplicated
// verbatim here so this build stays deletable on its own — every stash-or-pass experiment must be
// removable without breaking its siblings (see ring/ringGeometry.ts's header). Only `../timeline/*`
// is shared. Still dropped: `COPY_COLORS` (Revision 2's copies are all white, no per-side colours),
// all `STRIPE_*`, `stripeTilePath` (no undertow stripes here).
//
// Revision 2, R1 additionally drops `CORNER_RADIUS_RATIO`: the lane's stroked centreline is gone,
// replaced by a FILLED ring shape (`ringShape`/`laneShapes`) whose outer/inner corner radii are the
// new `cornerWidth`/`cornerRoundness` config fields (see StashOrPassQuarters.tsx). `buildRing` keeps
// producing the CENTRELINE the text rides and the quarter paths trace — it now takes that radius as
// an explicit argument instead of deriving it from a fixed ratio, so the caller can pick a radius
// that sits between the outer and inner shape radii (`rc = max(1, (Ro + Ri) / 2)`).

import type { Box } from '../../../schema'

export type RingSide = 'top' | 'right' | 'bottom' | 'left'

/** Orbit order = the direction the text stream travels = clockwise. */
export const SIDE_ORDER: RingSide[] = ['top', 'right', 'bottom', 'left']

export type Ring = {
    /** Top-left of the centreline rect, in canvas coordinates. */
    x: number
    y: number
    w: number
    h: number
    r: number
    /** Closed centreline path, clockwise from the top edge just after the top-left corner. Used
     *  for measurement (getTotalLength via the hidden defs path) and as the basis for the drawn
     *  quarter paths below. */
    d: string
    /** The `M` that opens the path, and one lap's worth of commands that begins and ends on that
     *  same point — so the lap can be concatenated with itself. See `ringTextPath`. */
    start: string
    lap: string
    /** Analytic perimeter. The component prefers getTotalLength() at runtime; this seeds it. */
    perimeter: number
    /** Path distance of each side's midpoint, in SIDE_ORDER. */
    sideMid: number[]
    /** Canvas-space point of each side's midpoint. */
    sidePoint: Array<{ x: number; y: number }>
    /**
     * Tangent rotation at each side's midpoint: 0/90/180/270. A copy has to arrive already aligned
     * with the stream it is about to become, and on this single clockwise loop the bottom of that
     * stream genuinely is upside-down (copied verbatim from ring/ringGeometry.ts's `Ring.sideRot`
     * — see its header for why that is a deliberate, known trade rather than a bug).
     */
    sideRot: number[]
}

function n(v: number): number {
    return Math.round(v * 100) / 100
}

/**
 * The ring's centreline sits `pad + thickness/2` outside the target box, so a lane of `thickness`
 * stroked on it leaves exactly `pad` of clear space against the box.
 *
 * `cornerRadius` is the CENTRELINE's own corner radius, in canvas px — the caller derives it from
 * the fill shape's outer/inner radii (see this file's header). Clamped here to fit the centreline
 * rect, same as every other rounded-rect helper in this file clamps to the rect it draws.
 */
export function buildRing(box: Box, pad: number, thickness: number, cornerRadius: number): Ring {
    const x = box.x - pad - thickness / 2
    const y = box.y - pad - thickness / 2
    const w = box.w + 2 * pad + thickness
    const h = box.h + 2 * pad + thickness
    const r = Math.max(1, Math.min(cornerRadius, w / 2, h / 2))

    const sT = w - 2 * r // top/bottom straight run
    const sR = h - 2 * r // left/right straight run
    const arc = (Math.PI / 2) * r
    const perimeter = 2 * (sT + sR) + 4 * arc

    const start = `M ${n(x + r)} ${n(y)}`
    const lap = [
        `L ${n(x + w - r)} ${n(y)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`,
        `L ${n(x + w)} ${n(y + h - r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`,
        `L ${n(x + r)} ${n(y + h)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`,
        `L ${n(x)} ${n(y + r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    ].join(' ')
    const d = `${start} ${lap} Z`

    // Cumulative distance: top, arc, right, arc, bottom, arc, left, arc.
    const sideMid = [
        sT / 2,
        sT + arc + sR / 2,
        sT + 2 * arc + sR + sT / 2,
        2 * sT + 3 * arc + sR + sR / 2,
    ]
    const sidePoint = [
        { x: x + w / 2, y },
        { x: x + w, y: y + h / 2 },
        { x: x + w / 2, y: y + h },
        { x, y: y + h / 2 },
    ]
    const sideRot = [0, 90, 180, 270]

    return { x, y, w, h, r, d, start, lap, perimeter, sideMid, sidePoint, sideRot }
}

/**
 * Four open paths, in SIDE_ORDER, each running clockwise from side i's midpoint to side i+1's
 * midpoint: half a straight, one corner arc, half the next straight. Concatenated in order they
 * retrace the same centreline as `buildRing`'s `d` (minus the closing `Z`).
 */
export function quarterPaths(ring: Ring): string[] {
    const { x, y, w, h, r } = ring
    return [
        // top-mid -> right-mid, via the top-right corner
        `M ${n(x + w / 2)} ${n(y)} L ${n(x + w - r)} ${n(y)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)} L ${n(x + w)} ${n(y + h / 2)}`,
        // right-mid -> bottom-mid, via the bottom-right corner
        `M ${n(x + w)} ${n(y + h / 2)} L ${n(x + w)} ${n(y + h - r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)} L ${n(x + w / 2)} ${n(y + h)}`,
        // bottom-mid -> left-mid, via the bottom-left corner
        `M ${n(x + w / 2)} ${n(y + h)} L ${n(x + r)} ${n(y + h)} A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)} L ${n(x)} ${n(y + h / 2)}`,
        // left-mid -> top-mid, via the top-left corner
        `M ${n(x)} ${n(y + h / 2)} L ${n(x)} ${n(y + r)} A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)} L ${n(x + w / 2)} ${n(y)}`,
    ]
}

/**
 * The path the TEXT rides: the same centreline traced `laps` times, open (no `Z`). Never the same
 * path as the drawn quarters.
 *
 * WHY IT IS NOT JUST THE RING. A `<textPath>` drops any glyph that does not fit within the path,
 * and a closed path does not wrap — so text near either end is clipped. The first attempt at the
 * seam paired a clipped tail with a wrapped duplicate whose head was clipped, assuming the two
 * tests were complementary. They are not: the browser drops a glyph that does not FULLY fit, while
 * the duplicate only renders glyphs starting at or after 0. That leaves a dead band exactly one
 * glyph wide — at 37px/s a ~20px letter went missing for over half a second, once per letter, at
 * the top-left corner.
 *
 * Extra laps remove the failure mode rather than negotiating with it: the text is centred in the
 * middle of a longer path, a comfortable margin clear of both ends, so the clipping rule never
 * fires and its exact definition stops mattering. `phraseSlots` picks `laps` and the offsets. The
 * extra laps are never painted — this path lives in <defs> and only positions glyphs.
 */
export function ringTextPath(ring: Pick<Ring, 'start' | 'lap'>, laps: number): string {
    return `${ring.start} ${Array.from({ length: Math.max(2, laps) }, () => ring.lap).join(' ')}`
}

export function boxCenter(box: Box): { x: number; y: number } {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

/** The four diagonals, in SIDE_ORDER (top/right/bottom/left -> UL/UR/DR/DL). Copied verbatim from
 *  ring/ringGeometry.ts for Revision 2's fan-in copies. */
export const DIAGONALS: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
]

/** How far into its corner a copy drifts during the fan, as a fraction of the box's half-size. */
export const CORNER_FRACTION = 0.25

export function fanOffset(index: number, box: Box): { x: number; y: number } {
    const dir = DIAGONALS[index % DIAGONALS.length]
    return { x: dir[0] * (box.w / 2) * CORNER_FRACTION, y: dir[1] * (box.h / 2) * CORNER_FRACTION }
}

export function headlineSize(box: Box): number {
    return Math.round(Math.min(box.w * 0.085, box.h * 0.22))
}

/**
 * Seamless-wrap maths for a closed path.
 *
 * THE RULE. For a ring to close, the glyph at path distance `d` and the one at `d + P` must be the
 * same character. Linear text has period `pitch`; the path has period `P`. Unless P is an exact
 * whole number of pitches the seam cannot join — which is the bug this replaced: laying one long
 * repeated run gave full coverage and a seamless SCROLL, but P/pitch was 15.28, and that leftover
 * 0.28 of a phrase was a ~4-character jump at the top-left corner.
 *
 * THE FIX. Pick a whole number of phrases and derive the slot from it: `slot = P / count`, exactly.
 * Each phrase is then placed ABSOLUTELY at `base + k·slot` as its own `<textPath>`, rather than
 * being one repeated string.
 *
 * Why placement rather than stretching one run (the alternatives were `textLength` and a computed
 * `letter-spacing`), given the ring is a different size every time:
 *
 *   - The seam is exact by construction: `count · slot === P` is the definition of `slot`.
 *   - Errors cannot accumulate. A predicted per-unit advance compounds over `count` units — a
 *     residual of 0.05px is invisible at count=15 and a visible 1.5px at count=30, i.e. it gets
 *     WORSE on bigger rings, which is the case that varies.
 *   - It barely depends on measuring the text. `pitch` only picks `count`; if the font metric is
 *     off enough to give 14 or 16 phrases instead of 15, the seam is still exact — only the gap
 *     changes. Both alternatives need the measurement right for the SEAM to be right.
 *   - All the slack lands in the gap BETWEEN phrases, never in letter tracking. That matters as
 *     the ring shrinks: worst-case slack is `slot/2` per phrase, so at count=15 it is 3% but at
 *     count=4 it is 12% — visible as loose lettering if spread across glyphs, unremarkable as a
 *     slightly wider gap.
 *   - It adds no new browser dependency: it rests on `startOffset`, which the scroll already
 *     proves works, rather than on `textLength` behaving on a `textPath`.
 *
 * `base0` puts a phrase centred on the top-edge midpoint, matching where a quarter build's stream
 * visually starts.
 *
 * Offsets are on the doubled text path (two-plus laps), positioned so the whole run sits in the
 * middle lap — `origin = P/2`, everything within [P/2, 3P/2], half a perimeter clear of both path
 * ends. That is what removes the glyph-clipping dead band; see `ringTextPath` for the failure it
 * replaced.
 *
 * Revision 2, R3: `starWidth` is the width of the `★` rendered once per gap (see `starOffsets`
 * below). The small-ring guard's minimum pitch is now `phraseWidth + starWidth`, not just
 * `phraseWidth` — a slot may never be narrower than the phrase AND its star combined.
 */
export function phraseSlots(
    perimeter: number,
    phraseWidth: number,
    starWidth: number,
    gap: number,
    topMid: number
) {
    // The pitch we would use if the perimeter were free to be any length.
    const pitch = phraseWidth + gap
    let count = Math.max(1, Math.round(perimeter / pitch))
    // Small-ring guard: rounding UP the phrase count can make a slot narrower than what it has to
    // hold (the phrase plus its trailing star), which would overlap the next one. Fall back to as
    // many as actually fit.
    const minPitch = phraseWidth + starWidth
    if (perimeter / count < minPitch) count = Math.max(1, Math.floor(perimeter / minPitch))
    const slot = perimeter / count

    // How many laps the TEXT path needs (see ringTextPath). Over a full scroll cycle the run and
    // its phase drift together span `perimeter + phraseWidth`; centring that in `laps` laps leaves
    // `((laps - 1) * perimeter - phraseWidth) / 2` clear at each end, and we want at least one
    // phrase width of clearance — far more than the one glyph the clipping rule can eat.
    //   ((laps - 1) * P - pw) / 2 >= pw   ->   laps >= 1 + 3 * pw / P
    // Two laps covers any ring with room for three phrases; only degenerate ones need more.
    const laps = Math.max(2, Math.ceil(1 + (3 * phraseWidth) / perimeter))

    // Start of the scroll window, centred so the clearance is equal at both ends — which is the
    // most either end can get out of `laps` laps.
    const origin = ((laps - 1) * perimeter - phraseWidth) / 2
    // Phase that lands a phrase's centre on the top-edge midpoint. `slot` divides `perimeter`
    // exactly, so working modulo `slot` is equivalent whether measured on the ring or on the
    // longer text path.
    const phase = (((topMid - phraseWidth / 2 - origin) % slot) + slot) % slot

    return {
        count,
        slot,
        laps,
        origin,
        base0: origin + phase,
        /** `base` wraps here, back by one slot. */
        wrapAt: origin + slot,
        gap: slot - phraseWidth,
        /** Guaranteed clear path at each end, in user units. */
        clearance: origin,
    }
}

/**
 * The offsets to render for a given scroll position — exactly `count`, one per slot.
 *
 * There is no wrapped duplicate and no seam instance any more. Because the phrases span
 * `P - gap` of path length, strictly less than one perimeter, no ring position is ever covered
 * twice, and the one position not covered is the ordinary gap between the last phrase and the
 * first. The seam simply stops being a special case.
 *
 * The wrap is invisible for the same reason it always was: advancing `base` by one slot moves
 * every phrase into its neighbour's place, and phrase `count` would sit exactly one perimeter on
 * from phrase 0 — the same point on the ring.
 */
export function slotOffsets(base: number, slot: number, count: number): number[] {
    return Array.from({ length: count }, (_, k) => base + k * slot)
}

/**
 * Revision 2, R3: one `★` centred in the gap AFTER each phrase — `base + k*slot` is the phrase's
 * start (see `slotOffsets`); this is that same point, advanced past the phrase, then centred in
 * whatever gap remains ahead of it before the next phrase starts.
 */
export function starOffsets(
    base: number,
    slot: number,
    count: number,
    phraseWidth: number,
    starWidth: number
): number[] {
    const intoGap = phraseWidth + (slot - phraseWidth - starWidth) / 2
    return Array.from({ length: count }, (_, k) => base + k * slot + intoGap)
}

/* ── R1: the filled ring shape ──────────────────────────────────────────────────────────────── */

export type Rect = { x: number; y: number; w: number; h: number }

/**
 * Clockwise rounded-rect path, closed. `radius` is clamped to `min(w, h) / 2` of THIS rect — every
 * caller below (the outer shape, the inner hole, the edge-adjusted blue shape) draws a different
 * rect, so clamping here is what satisfies R1's "clamped at render to min(W, H) / 2" for each of
 * them, without the component having to pre-compute rect bounds itself.
 */
function roundedRectPath(rect: Rect, radius: number): string {
    const { x, y, w, h } = rect
    const r = Math.max(0, Math.min(radius, w / 2, h / 2))
    if (r <= 0) {
        return `M ${n(x)} ${n(y)} L ${n(x + w)} ${n(y)} L ${n(x + w)} ${n(y + h)} L ${n(x)} ${n(y + h)} Z`
    }
    return [
        `M ${n(x + r)} ${n(y)}`,
        `L ${n(x + w - r)} ${n(y)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`,
        `L ${n(x + w)} ${n(y + h - r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`,
        `L ${n(x + r)} ${n(y + h)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`,
        `L ${n(x)} ${n(y + r)}`,
        `A ${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
        'Z',
    ].join(' ')
}

/** Grow (positive `by`) or shrink (negative `by`) a rect on all four sides. */
function expandRect(rect: Rect, by: number): Rect {
    return { x: rect.x - by, y: rect.y - by, w: rect.w + 2 * by, h: rect.h + 2 * by }
}

/**
 * The evenodd fill path for one rounded ring shape: an outer rounded rect with an inner rounded
 * rect cut out of it. Both sub-paths are wound the same direction (clockwise) — with
 * `fill-rule="evenodd"` that is enough to punch the hole; the two don't need opposite windings the
 * way `fill-rule="nonzero"` would require.
 */
export function ringShape(outer: Rect, ro: number, inner: Rect, ri: number): string {
    return `${roundedRectPath(outer, ro)} ${roundedRectPath(inner, ri)}`
}

/**
 * The two evenodd shapes that make up one lane, per R1: `white` painted first, `blue` painted on
 * top and inset by `edge` on the outer side / outset by `edge` on the inner side, so an `edge`-wide
 * strip of the white shows along BOTH lane edges. `ro`/`ri` are the OUTER shape's radii (the
 * config's `cornerWidth`/derived inner radius); the blue shape's own radii shrink/grow with the
 * inset so its corners keep following the outer shape's curve rather than going concentric with a
 * fixed offset.
 */
export function laneShapes(
    box: Box,
    pad: number,
    thickness: number,
    ro: number,
    ri: number,
    edge: number
): { white: string; blue: string } {
    const outer = expandRect(box, pad + thickness)
    const inner = expandRect(box, pad)
    const white = ringShape(outer, ro, inner, ri)
    const blue = ringShape(expandRect(outer, -edge), Math.max(0, ro - edge), expandRect(inner, edge), ri + edge)
    return { white, blue }
}
