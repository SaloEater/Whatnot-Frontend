// Ring geometry for `animation:stashOrPassWrapRing` — the single-lane build.
//
// WHAT CHANGED FROM THE FOUR-LANE BUILDS. There is no `bandRect`, no per-side rotation table and
// no scroll-direction table. There is ONE rounded-rectangle path — the ring's CENTRELINE — and it
// does both jobs: stroked at `thickness` it is the gold lane, and used as a `<textPath>` it is the
// line the text runs along. The corner radius is not decoration: with sharp 90° corners a glyph
// straddling a corner has its tangent flip in one step, which reads as a glitch.
//
// THE TRADE THIS BUILD MAKES. One continuous loop and "text stays upright on all four sides"
// (overlay-stash-or-pass-spec.md §5) are geometrically incompatible — a stream running clockwise
// is travelling right-to-left along the bottom, so its glyphs are either upside-down (tangent) or
// spatially reversed (forced upright). This build takes the tangent, deliberately reversing §5.
// At ~15 copies of the phrase around the ring there is always an upright, readable one on top.
//
// Helpers duplicated from tl/geometry.ts rather than imported: these are competing experiments and
// exactly one will survive, so each must be deletable without breaking the others. Only the
// timeline engine itself is shared (see timeline/timeline.ts's scope note).

import type { Box } from '../../../schema'

export type RingSide = 'top' | 'right' | 'bottom' | 'left'

/** Orbit order = the direction the single stream travels = clockwise. */
export const SIDE_ORDER: RingSide[] = ['top', 'right', 'bottom', 'left']

/** spec §6 Register: ivory/gold/bronze/mid-gold stand in for an RGB chromatic split. */
export const COPY_COLORS: Record<RingSide, string> = {
    top: 'var(--soptlr-ivory)',
    right: 'var(--soptlr-gold-bright)',
    bottom: 'var(--soptlr-bronze)',
    left: 'var(--soptlr-gold-mid)',
}

export type Ring = {
    /** Top-left of the centreline rect, in canvas coordinates. */
    x: number
    y: number
    w: number
    h: number
    r: number
    /** Closed centreline path, clockwise from the top edge just after the top-left corner. Used
     *  for the stroked lane (the `Z` is what gives the corners proper joins) and for measurement. */
    d: string
    /** The `M` that opens the path, and one lap's worth of commands that begins and ends on that
     *  same point — so the lap can be concatenated with itself. See `ringTextPath`. */
    start: string
    lap: string
    /** Analytic perimeter. The component prefers getTotalLength() at runtime; this seeds it. */
    perimeter: number
    /** Path distance of each side's midpoint, in SIDE_ORDER. */
    sideMid: number[]
    /** Canvas-space point of each side's midpoint — where that side's copy lands. */
    sidePoint: Array<{ x: number; y: number }>
    /**
     * Tangent rotation at each side's midpoint. 0/90/180/270, NOT the four-lane build's
     * 0/90/0/-90: a copy has to arrive already aligned with the stream it is about to become, and
     * on a single clockwise loop the bottom of that stream genuinely is upside-down.
     */
    sideRot: number[]
}

function n(v: number): number {
    return Math.round(v * 100) / 100
}

/**
 * Corner radius of the ring CENTRELINE, as a fraction of the lane thickness.
 *
 * 0.5 is the sharpest value the lane can take. The stroke is centred on this radius, so the
 * INNER edge of the lane has radius `r - thickness/2` — which at 0.5 is exactly zero: a crisp
 * right angle inside, a `thickness`-radius round outside. Below 0.5 the inner radius goes
 * negative and the stroke self-intersects at each corner, which shows as a notch.
 *
 * The cost of going sharper is paid by the text, not the lane: the corner arc is
 * `(pi/2) * r` long, so at 0.5 a glyph occupies about half the arc and pivots ~45 degrees across
 * its own width, against ~21 degrees at 1.0. Corner glyphs fan noticeably more. That is the
 * trade — the corners read as corners rather than as curves.
 */
export const CORNER_RADIUS_RATIO = 0.5

/**
 * The ring's centreline sits `pad + thickness/2` outside the target box, so a lane of `thickness`
 * stroked on it leaves exactly `pad` of clear space against the box.
 */
export function buildRing(box: Box, pad: number, thickness: number): Ring {
    const x = box.x - pad - thickness / 2
    const y = box.y - pad - thickness / 2
    const w = box.w + 2 * pad + thickness
    const h = box.h + 2 * pad + thickness
    const r = Math.max(1, Math.min(thickness * CORNER_RADIUS_RATIO, w / 2, h / 2))

    const sT = w - 2 * r // top/bottom straight run
    const sR = h - 2 * r // left/right straight run
    const arc = (Math.PI / 2) * r
    const perimeter = 2 * (sT + sR) + 4 * arc

    const start = `M ${n(x + r)} ${n(y)}`
    // One lap, as commands that BEGIN and END on the start point — so concatenating it with itself
    // continues seamlessly, which is what makes the doubled text path below trivial to build.
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
 * The path the TEXT rides: the same centreline traced `laps` times, open (no `Z`). Never the same
 * path as the stroked lane.
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

/** The four diagonals, in SIDE_ORDER (top/right/bottom/left -> UL/UR/DR/DL). */
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
 * `base0` puts a phrase centred on the top-edge midpoint, which is where the top copy lands: the
 * copies then visibly BECOME the stream (spec §3) instead of squashing into a ring whose text
 * happens to sit somewhere else.
 *
 * Offsets are on `Ring.dText` (two laps), positioned so the whole run sits in the middle lap —
 * `origin = P/2`, everything within [P/2, 3P/2], half a perimeter clear of both path ends. That is
 * what removes the glyph-clipping dead band; see Ring.dText for the failure it replaced.
 */
export function phraseSlots(perimeter: number, phraseWidth: number, gap: number, topMid: number) {
    // The pitch we would use if the perimeter were free to be any length.
    const pitch = phraseWidth + gap
    let count = Math.max(1, Math.round(perimeter / pitch))
    // Small-ring guard: rounding UP the phrase count can make a slot narrower than the phrase it
    // has to hold, which would overlap the next one. Fall back to as many as actually fit.
    if (perimeter / count < phraseWidth) count = Math.max(1, Math.floor(perimeter / phraseWidth))
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

/* ── The diagonal undertow ──────────────────────────────────────────────────────────────────
 * Grey 45° lines drifting slowly through the lane behind the text, the counterpart of the
 * four-lane builds' `repeating-linear-gradient(45deg, … 0 6px, transparent 6px 18px)`.
 *
 * Perpendicular spacing between lines, and their width. A 45° line repeating in a SQUARE tile of
 * side T comes out spaced T/sqrt(2) apart, so the tile side is the period times sqrt(2).
 */
export const STRIPE_PERIOD_PX = 18
export const STRIPE_WIDTH_PX = 6
/** Square tile side. NOT rounded: the drift wraps at exactly this distance, so if the wrap and the
 *  tile disagree by even a fraction of a pixel the pattern visibly hitches once per cycle. */
export const STRIPE_TILE_PX = STRIPE_PERIOD_PX * Math.SQRT2
/** Drift speed as a fraction of the text's, so the two stay related if the speed is retuned. The
 *  undertow is meant to be barely-moving texture, not a second thing competing to be read: at the
 *  default 37px/s this works out to ~6.5px/s measured across the lines. */
export const STRIPE_SPEED_RATIO = 0.25

/**
 * One tile of the pattern: three parallel lines of slope +1 (top-left to bottom-right), each
 * extended well past the tile so no stroke CAP ever lands inside it — the tile clips them into
 * continuous diagonals.
 *
 * All three are needed. `y = x` crosses the tile corner to corner and is the line you actually
 * see; `y = x + T` and `y = x - T` only touch the corners (0,T) and (T,0), but their stroke spills
 * inward from there, and without them each line is nicked at every tile boundary.
 *
 * (The first attempt drew `y = -x` and `y = -x + 2T`, which touch the tile at ONE corner each and
 * are clipped away entirely otherwise — so it painted two small blobs per tile and no lines at
 * all.)
 */
export function stripeTilePath(t: number): string {
    return [
        `M ${-t} ${-t} L ${2 * t} ${2 * t}`,
        `M ${-2 * t} ${-t} L ${t} ${2 * t}`,
        `M ${-t} ${-2 * t} L ${2 * t} ${t}`,
    ].join(' ')
}
