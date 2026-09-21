// Pure layout maths for the football-field lines overlay, tuned on /obs/setup/sport_style/board
// (football-field-board-plan.md §3, §5.1/§5.2). Everything here is a pure function of its
// arguments, touches neither `window` nor React. Shared module (sport-style-board-plan.md §1):
// moved out of the board playground's own directory into src/app/obs/sport_style/ so the
// board:sport_style layout element renders from the SAME code the playground shows — that page
// still imports this unchanged.
//
// The model (v2): the grid's column AND row seams are white "yard lines" — column strips span
// from the top edge of the top hash-tick row to the bottom edge of the bottom hash-tick row (not
// the full box height), row strips span the grid's width (plus the outer column strips) — painted
// UNDER the opaque cells so the cells themselves cut the strips down to the visible seam width on
// both axes; short white "hash" ticks sit only in the gap above the first row and the gap below
// the last row (never between interior rows), painted OVER the cells. A fixed `edgeGap` reserves
// room between the box edge and the grid on all four sides. Within that reserved band, a separate
// `ticksAreaHeight` knob is exactly how far the column strips extend beyond the outer row strips
// (above the first row, below the last row), clamped down to whatever room `edgeGap` actually
// leaves on that side; the hash ticks sit flush with that band's outer edge — the top row's top
// edge and the bottom row's bottom edge are the column strips' own ends, rather than centred
// inside the band. A separate `turfMargin` knob then lets the painted turf (`field`, see below)
// extend past that same band by an extra, independently-tunable amount on every side. Nothing here
// reads the DOM — `cellPx` and the grid's origin are derived from the same numbers the caller
// already has (box size, cols, rows), so cells and lines can never drift apart.
//
// Whole-pixel discipline (plan §1.6): every field below is an integer except where the header
// comment on `cellBox` explains otherwise. A fractional edge rasterises as a blurry double line
// in OBS's CEF (the same reason FlatBoard.tsx floors its cell size), so every Rect below lands on
// an integer px boundary.
//
// Seam ticks: a further set of short vertical ticks, one per INTERIOR row seam × column (never the
// outer two row seams, which already get the `ticks` above/below the grid) — centred on both the
// seam and the column, the same way hash marks sit between yard lines on a football field. Painted
// in the same top layer as `ticks` (above the cells). Unlike every other knob above, whether this
// layer renders at all is NOT a `FieldInput` field: `fieldGeometry` always computes the full
// `seamTicks` array (empty when `rows < 2`) and the caller (the board playground / the
// board:sport_style element) decides whether to draw it, from its own `seamTicks` boolean recipe
// knob (fieldConstants.ts `FIELD.seamTicks`/`DEFAULT_TURF.seamTicks`, default true).

/** Inputs the caller already has (on /obs/setup/sport_style/board: the chosen preview size and the
 *  knobs); the board:sport_style element derives the same inputs from its box width and `cols`
 *  (sport-style-board-plan.md §4.2). */
export interface FieldInput {
    /** Element/box width, px. */
    boxW: number
    /** Element/box height, px. */
    boxH: number
    /** Columns in the (widest) row. 10 on the target 4×10 shape. */
    cols: number
    /** Row count. 4 on the target shape. */
    rows: number
    /** Gap reserved between the box edge and the cell grid on all four sides, px — knob (0–120,
     *  default 60). Replaces the old `pad` input: `cellPx` is now floored from
     *  `(boxW - 2*edgeGap)/cols` and `(boxH - 2*edgeGap)/rows`, and the grid is still centred in
     *  the box, so the actual on-screen gap is >= `edgeGap`. The `ticksAreaHeight` band (see below)
     *  — where the hash ticks (see `ticks` below) live — sits inside this reserved band, above and
     *  below the grid. */
    edgeGap: number
    /** Seam width (both axes) as a fraction of `cellPx` — knob, plan §3 default 0.035. */
    lineWFactor: number
    /** Hash-tick height as a fraction of `cellPx` — knob, plan §3 default 0.14. Clamped down if it
     *  does not fit in the `ticksAreaHeight` band (see `tickH` below). */
    tickHFactor: number
    /** Seam-tick height as a fraction of `cellPx` — knob, default 0.14. Independent of
     *  `tickHFactor`: the seam ticks (`seamTicks` below) live inside the grid, on interior row
     *  seams, so they are NOT clamped by the `ticksAreaHeight` band the way `tickH` is — see
     *  `seamTickH` below. */
    seamTickHFactor: number
    /** Hash-tick width, px — knob (plan §3 defaults this to `lineW`, but it is a free knob on the
     *  test page via the "same as line" checkbox, so it is taken as a plain input here rather than
     *  derived). */
    tickW: number
    /** Ticks painted between each pair of adjacent column lines — knob, plan §3 default 4. */
    ticksPerColumn: number
    /** How far the column strips extend beyond the outer row strips, above the first row and below
     *  the last row, px — knob (0–120, default 36), clamped down to whatever room `edgeGap`
     *  actually leaves on that side. The hash ticks sit flush with the outer edge of THIS band (top
     *  tick row's top = column strips' top, bottom tick row's bottom = column strips' bottom), not
     *  centred within it, and not within the whole `edgeGap` band the way they used to be. */
    ticksAreaHeight: number
    /** Extra turf beyond the ticks-area band, on every side, px — knob (0–120, default 0). The
     *  painted `field` (see below) is the cell grid expanded by `ticksAreaHeight` (so the turf
     *  reaches the column strips' own top/bottom edge) plus this extra margin, then clamped to the
     *  box. */
    turfMargin: number
}

/** An absolutely-positioned, whole-pixel box. */
export interface Rect {
    x: number
    y: number
    w: number
    h: number
}

/** Output of {@link fieldGeometry}. Everything is an integer except `cellBox.mx`/`cellBox.my`,
 *  which are also integers here (see that field's own comment) — called out because the plan's
 *  §3 prose defines them as `lineW/2`, which is fractional whenever `lineW` is odd. */
export interface FieldGeometry {
    /** Cell footprint (box + seam), floored to a whole px so `cols*cellPx`/`rows*cellPx` never
     *  exceeds the box less `2*edgeGap`. */
    cellPx: number
    /** Integer origin of the `cols*cellPx` × `rows*cellPx` grid inside the box, shared by the
     *  strips, the cells and the ticks so none of the three can drift apart. */
    gridLeft: number
    gridTop: number
    /** Seam width, both axes. */
    lineW: number
    /** Hash-tick height, after clamping to whatever room the `ticksAreaHeight` band actually has
     *  (see the `ticks` field below) — may be smaller than `round(cellPx * tickHFactor)`. */
    tickH: number
    /** Seam-tick height: `max(0, round(cellPx * seamTickHFactor))` — unlike `tickH` above, NOT
     *  clamped against `ticksAreaHeight`, since the seam ticks (see `seamTicks` below) live inside
     *  the grid rather than in the edge-gap band. */
    seamTickH: number
    /** `cols + 1` white divs, one per column seam (the outer two are the grid's left/right edges —
     *  the "goal lines"), each spanning from the top edge of the top hash-tick row to the bottom
     *  edge of the bottom hash-tick row (`y = tickY.top`, `h = (tickY.bottom + tickH) - tickY.top`
     *  — see `ticks` below) rather than the full box height. Bottom layer, under the cells. */
    vStrips: Rect[]
    /** `rows + 1` white divs, one per row seam (the outer two are the grid's top/bottom edges),
     *  each spanning the grid's width plus the outer column strips
     *  (`x = gridLeft - floor(lineW/2)`, `w = gridW + lineW`). Bottom layer, under the cells. */
    hStrips: Rect[]
    /** `2 * cols * ticksPerColumn` white divs, `ticksPerColumn` per column, on exactly two seams:
     *  above the first row and below the last row (never on an interior row seam). Each tick is
     *  flush with the column strips' own end on its side — the top row's top edge is the column
     *  strips' top, the bottom row's bottom edge is the column strips' bottom — rather than centred
     *  inside the `ticksAreaHeight` band; it does not straddle the cell edge the way a v1 tick did.
     *  Top layer, over the cells. */
    ticks: Rect[]
    /** `(rows - 1) * cols` white divs — one per interior row seam × column (`r = 1..rows-1`, never
     *  the outer two row seams), each a `tickW × seamTickH` tick centred on that seam and on that
     *  column: `x = gridLeft + c*cellPx + floor(cellPx/2) - floor(tickW/2)`,
     *  `y = (gridTop + r*cellPx) - floor(seamTickH/2)`. Empty when `rows < 2`. Same top layer as
     *  `ticks` (over the cells); see the file header for why this layer's visibility is a
     *  caller-side boolean rather than a `FieldInput` field. */
    seamTicks: Rect[]
    /** How much smaller than `cellPx` a cell's own box is drawn, so the opaque cells leave exactly
     *  the seam (`lineW`, both axes — the split is symmetric now) uncovered for the strips to show
     *  through. See the field-level comment below for the odd-width rounding rule. */
    cellBox: {
        w: number
        h: number
        /** Left/right margin inside the `cellPx` footprint. */
        mx: number
        /** Top/bottom margin inside the `cellPx` footprint. Same convention as `mx` now that both
         *  axes share one seam width. */
        my: number
    }
    /** The painted turf region: the cell GRID rect (`gridLeft, gridTop, gridW, gridH`) expanded on
     *  all four sides by `extH + turfMargin` (`extH` is the actual ticks-area extension, `tickY`/
     *  `vStrips` above — clamped down from the `ticksAreaHeight` knob), then clamped to the box.
     *  Vertically the turf therefore ends exactly where the column strips end (plus `turfMargin`);
     *  horizontally it extends past the outer column strips by that same amount, so the turf reads
     *  as a touch wider than the line-work on every side. All four members are integers because
     *  `gridLeft`/`gridTop`/`gridW`/`gridH`, `extH`, `turfMargin` (rounded) and `boxW`/`boxH`
     *  already are. */
    field: Rect
}

/**
 * Plan §3's white-fill geometry (v2: seams on both axes, edge-gap-bound ticks), in one pure
 * function.
 *
 * Rounding note on `cellBox` (the one place the plan's prose and this implementation diverge):
 * §3 defines the cell box as `cellPx - lineW` per axis with margin `lineW/2` each side, which is
 * only a whole-px split when `lineW` is even. To keep every output integer, `mx`/`my` are BOTH
 * rounded DOWN from the same `floor(lineW/2)` and `w`/`h` are then derived from that already-
 * integer margin (`cellPx - 2*mx`, `cellPx - 2*my`), not from `lineW` directly — so
 * `w + 2*mx === cellPx` holds exactly in whole px, same identity for `h`/`my`. The visible cost,
 * only when `lineW` is odd, is one extra px of margin that isn't split symmetrically: the cell box
 * sits up to 1px off-centre within its `cellPx` footprint on each axis. That extra px is harmless
 * — the column/row strips are centred on their seams using the SAME `floor(lineW/2)` offset (see
 * `vStrips`/`hStrips` below), so a strip always covers at least the gap the cell boxes leave
 * uncovered; it may cover 1px more than the visible gap, which is simply hidden under the
 * neighbouring cell's opaque edge.
 */
export function fieldGeometry(input: FieldInput): FieldGeometry {
    const {boxW, boxH, cols, rows, edgeGap, lineWFactor, tickHFactor, seamTickHFactor, tickW, ticksPerColumn, ticksAreaHeight, turfMargin} = input

    const cellPx = Math.floor(Math.min((boxW - 2 * edgeGap) / cols, (boxH - 2 * edgeGap) / rows))
    const gridLeft = Math.floor((boxW - cols * cellPx) / 2)
    const gridTop = Math.floor((boxH - rows * cellPx) / 2)
    const gridW = cols * cellPx
    const gridH = rows * cellPx

    const lineW = Math.max(2, Math.round(cellPx * lineWFactor))

    // Layer 3 geometry, computed first because Layer 1a (column strips, below) now ends where the
    // `ticksAreaHeight` band ends: only the two seams OUTSIDE the grid (above row 0, below the
    // last row) get ticks. `extH` is how far that band actually extends past the outer hStrips
    // entry on each side — the `ticksAreaHeight` knob clamped down to whichever room (top/bottom)
    // the `edgeGap` band actually leaves, so both sides share one extension. `tickH` is clamped to
    // `extH` itself rather than to the whole edge-gap band. This placement is computed
    // unconditionally — even when `ticksPerColumn` is 0 and the `ticks` array below ends up empty,
    // `tickY`/`tickH`/`extH` still hold the y-range the ticks WOULD occupy, and the column strips
    // still end there.
    const topStripTop = gridTop - Math.floor(lineW / 2)
    const bottomStripBottom = gridTop + gridH - Math.floor(lineW / 2) + lineW
    const topGap = Math.max(0, topStripTop)
    const bottomGap = Math.max(0, boxH - bottomStripBottom)
    const extH = Math.max(0, Math.min(Math.round(ticksAreaHeight), topGap, bottomGap))
    const tickH = Math.max(0, Math.min(Math.round(cellPx * tickHFactor), extH))

    // Ticks sit flush with the column strips' own ends rather than centred inside the `extH` band:
    // the top row's top edge IS the column strips' top (`topStripTop - extH`), the bottom row's
    // bottom edge IS the column strips' bottom (`bottomStripBottom + extH`, i.e. `y + tickH` lands
    // there).
    const tickY: Record<'top' | 'bottom', number> = {
        top: topStripTop - extH,
        bottom: bottomStripBottom + extH - tickH,
    }

    // Field: the painted turf region, the cell GRID rect expanded on all four sides by
    // `extH + turfMargin` then clamped to the box — vertically the turf ends exactly where the
    // column strips end (plus the extra margin); horizontally it extends past the outer column
    // strips by that same amount. `gridLeft`/`gridTop` are already centred in the box, so `field`
    // stays centred too (subject to the box-edge clamp).
    const inset = extH + Math.max(0, Math.round(turfMargin))
    const fx0 = Math.max(0, gridLeft - inset)
    const fy0 = Math.max(0, gridTop - inset)
    const fx1 = Math.min(boxW, gridLeft + gridW + inset)
    const fy1 = Math.min(boxH, gridTop + gridH + inset)
    const field: Rect = {x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0}

    // Layer 1a — column strips: cols + 1 seams, under the cells. Each strip spans from
    // `topStripTop - extH` to `bottomStripBottom + extH` (i.e. `extH` px beyond the outer row
    // strips on each side) rather than the full box height, so the lines stop `ticksAreaHeight` px
    // past the grid instead of running into the box's own top/bottom padding.
    const vStrips: Rect[] = []
    const vStripY = topStripTop - extH
    const vStripH = (bottomStripBottom + extH) - (topStripTop - extH)
    for (let i = 0; i <= cols; i++) {
        vStrips.push({
            x: gridLeft + i * cellPx - Math.floor(lineW / 2),
            y: vStripY,
            w: lineW,
            h: vStripH,
        })
    }

    // Layer 1b — row strips: rows + 1 seams, spanning the grid's width plus the outer column
    // strips so the corners close up, under the cells.
    const hStrips: Rect[] = []
    for (let r = 0; r <= rows; r++) {
        hStrips.push({
            x: gridLeft - Math.floor(lineW / 2),
            y: gridTop + r * cellPx - Math.floor(lineW / 2),
            w: gridW + lineW,
            h: lineW,
        })
    }

    // Layer 3 — hash ticks: only the two seams OUTSIDE the grid, ticksPerColumn per column, using
    // the `tickY` placement computed above.
    const ticks: Rect[] = []
    for (const edge of ['top', 'bottom'] as const) {
        const y = tickY[edge]
        for (let i = 0; i < cols; i++) {
            for (let k = 1; k <= ticksPerColumn; k++) {
                ticks.push({
                    x: gridLeft + i * cellPx + Math.round((k * cellPx) / (ticksPerColumn + 1)) - Math.floor(tickW / 2),
                    y,
                    w: tickW,
                    h: tickH,
                })
            }
        }
    }

    // Layer 3b — seam ticks: one per interior row seam × column, centred on the seam and on the
    // column (never the two outer row seams, which already get `ticks` above/below the grid).
    // Empty when rows < 2, since there is then no interior seam at all. `seamTickH` is independent
    // of `tickH` — it is NOT clamped against `ticksAreaHeight`/`extH` since these ticks live inside
    // the grid rather than in the edge-gap band.
    const seamTickH = Math.max(0, Math.round(cellPx * seamTickHFactor))
    const seamTicks: Rect[] = []
    for (let r = 1; r <= rows - 1; r++) {
        const seamY = gridTop + r * cellPx
        for (let c = 0; c < cols; c++) {
            seamTicks.push({
                x: gridLeft + c * cellPx + Math.floor(cellPx / 2) - Math.floor(tickW / 2),
                y: seamY - Math.floor(seamTickH / 2),
                w: tickW,
                h: seamTickH,
            })
        }
    }

    // Layer 2 — cell box margins, derived so w + 2*mx === cellPx and h + 2*my === cellPx exactly
    // (see the function-level comment above for why this isn't simply `cellPx - lineW`/`lineW/2`).
    // Both margins now use the same `floor(lineW/2)` split — the seam is `lineW` on both axes.
    const mx = Math.floor(lineW / 2)
    const my = Math.floor(lineW / 2)
    const cellBox = {
        w: cellPx - 2 * mx,
        h: cellPx - 2 * my,
        mx,
        my,
    }

    return {cellPx, gridLeft, gridTop, lineW, tickH, seamTickH, vStrips, hStrips, ticks, seamTicks, cellBox, field}
}
