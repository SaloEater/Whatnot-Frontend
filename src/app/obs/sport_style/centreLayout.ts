// Pure layout maths for `board:sport_style`'s 'centered' sort mode (sport-style-board-plan.md
// §4.2, reworked; zone model added by a later task spec). Unlike `board:cobra_flat`'s
// `layoutCells` (board-cobra-flat/layout.ts), which deals round-robin by per-row centre-out step
// and therefore piles value into a single centre COLUMN, this module ranks every slot in the whole
// grid — zone first, then by 2-D distance from the board's centre — and deals the value-ordered
// cells into that ranking, so value radiates outward from the board's middle on BOTH axes, not just
// left-to-right within each row.
//
// Reuses `sortCells` from board-cobra-flat/layout.ts verbatim (same value order) but NOT
// `splitRows` — that balances cells across rows (fuller rows on top), which would make the ranked
// centre slot land in different ROWS as `n` changes. Instead rows are always FULL from the top
// (`cols` cells each) and only the LAST row is short: `rows = ceil(n / cols)`,
// `rowSizes = [cols, cols, …, n - (rows - 1) * cols]`. The 2-D ranking then treats each row's own
// length as that row's width (`layoutCells`/the render's `colShift` still centres a short last row
// cell-wise, so nothing else changes).
//
// Fix 2 (revised): `sortCells`'s value order is followed by a STABLE four-way grouping, in this
// order: unsold teams (real logo art — `hasLogo`, teamPalette.ts), unsold custom spots, sold teams,
// sold custom spots. Each group keeps its `sortCells` order. Unsold always beats sold: an unsold
// custom spot, even with no price, is still for sale and outranks every sold cell, so sold imprints
// are the ones pushed to the board's edges/corners. Within the unsold (and the sold) cells, teams
// still come before custom spots.
//
// Zone model (task spec part 3): slots are ranked ZONE FIRST, then by the 2-D distance key (`d2`
// asc, `dy` asc, `row` asc, `col` asc) within a zone — so the whole of zone A fills before zone B
// starts, and so on.
//   - A slot's BOARD column is `col + floor((cols - rowLen) / 2)` — the same shift the render
//     applies to cell-wise-centre a short last row onto the board's column formation — so a short
//     row's cells are tested against the same middle-column band as every other row. `dx`/`d2` are
//     computed from this board column against the board's own centre column, exactly as before.
//   - Middle columns: `midCount = round(cols / 3)`, bumped to `midCount + 1` if `cols - midCount`
//     is odd (keeps the band symmetric); the band is board columns
//     `[midStart, midStart + midCount)` where `midStart = (cols - midCount) / 2`. Examples: 6 cols
//     → 2 middle columns (0-based 2,3); 10 cols → 4 (0-based 3..6); 9 cols → 3 (0-based 3..5).
//   - Interior rows are every row except the first and the last (`0 < row < rows - 1`). With
//     `rows <= 2` there are no interior rows: zone A then covers the middle columns on EVERY row
//     and zone B is empty.
//   - Zone A (priority 0) — interior rows × middle columns.
//     Zone B (priority 1) — edge rows (first and last) × middle columns.
//     Zone C (priority 2) — everything else.
//   Worked example, 6 cols × 4 rows, 1-indexed (row, col): A = rows 2–3 × cols 3–4; B = rows 1 and
//   4 × cols 3–4; C = every other cell.
//
// No FLIP/move-animation bookkeeping here either (mirrors layout.ts's own note) — this produces one
// snapshot grid for whatever `cells` it's given "now".

import {sortCells, type FlatCell, type PlacedCell} from '../layout/elements/board-cobra-flat/layout'
import {hasLogo} from './teamPalette'

/**
 * Lays `cells` out into `PlacedCell[][]` render rows, value radiating from the board's centre in
 * three zones (header above): `sortCells` gives the value order, then cells are stably grouped
 * unsold teams, unsold custom spots, sold teams, sold custom spots (fix 2, header above); rows are full-width from the top with
 * only the last row short (`ceil(n / cols)` rows); every slot across the whole grid is ranked zone
 * first, then by squared distance from the board's centre (`dy` from the board's row centre, `dx`
 * from the board's own centre column, using each slot's BOARD column — see header), ties broken by
 * `dy` then `row` then `col` for determinism. The most valuable cell goes to the closest-ranked slot
 * within the highest-priority zone, and so on outward/through the zones. Each returned row is
 * sorted left-to-right by column so the caller can render it directly.
 */
export function layoutCentred(cells: readonly FlatCell[], cols: number): PlacedCell[][] {
    const bySortOrder = sortCells(cells)
    const group = (c: FlatCell) => (c.sold ? 2 : 0) + (hasLogo(c.team) ? 0 : 1)
    const ordered = [0, 1, 2, 3].flatMap((g) => bySortOrder.filter((c) => group(c) === g))

    const n = ordered.length
    if (n === 0 || cols <= 0) return []

    const rows = Math.ceil(n / cols)
    const rowSizes = Array.from({length: rows}, (_, row) =>
        row < rows - 1 ? cols : n - (rows - 1) * cols
    )

    // Middle-column band (header above): a symmetric run of board columns, centred on the board.
    let midCount = Math.round(cols / 3)
    if ((cols - midCount) % 2 !== 0) midCount += 1
    const midStart = (cols - midCount) / 2
    const midEnd = midStart + midCount // exclusive
    const isMiddleCol = (boardCol: number) => boardCol >= midStart && boardCol < midEnd
    // Interior rows only exist once there's a row strictly between the first and last one.
    const hasInteriorRows = rows > 2
    const isInteriorRow = (row: number) => row > 0 && row < rows - 1

    type Slot = {row: number; col: number; dx: number; dy: number; d2: number; zone: number}
    const slots: Slot[] = []
    const rowCentre = (rows - 1) / 2
    const boardColCentre = (cols - 1) / 2
    rowSizes.forEach((rowLen, row) => {
        const dy = Math.abs(row - rowCentre)
        const colShift = Math.floor((cols - rowLen) / 2)
        for (let col = 0; col < rowLen; col++) {
            const boardCol = col + colShift
            const dx = Math.abs(boardCol - boardColCentre)
            const middle = isMiddleCol(boardCol)
            let zone: number
            if (!middle) {
                zone = 2
            } else if (!hasInteriorRows) {
                // rows <= 2: no interior rows, so zone A claims the middle columns on every row.
                zone = 0
            } else {
                zone = isInteriorRow(row) ? 0 : 1
            }
            slots.push({row, col, dx, dy, d2: dx * dx + dy * dy, zone})
        }
    })
    slots.sort((a, b) => {
        if (a.zone !== b.zone) return a.zone - b.zone
        if (a.d2 !== b.d2) return a.d2 - b.d2
        if (a.dy !== b.dy) return a.dy - b.dy
        if (a.row !== b.row) return a.row - b.row
        return a.col - b.col
    })

    const grid: PlacedCell[][] = rowSizes.map(() => [])
    ordered.forEach((cell, rank) => {
        const slot = slots[rank]
        if (!slot) return // defensive only: slots.length === ordered.length by construction above
        grid[slot.row][slot.col] = {cell, row: slot.row, col: slot.col, rank}
    })

    // Every row above is sparse-assigned by column index; `filter` drops the holes (there are
    // none once every slot is filled, but stays defensive) and the explicit sort makes the
    // left-to-right render order independent of assignment order.
    return grid.map((row) =>
        row.filter((c): c is PlacedCell => c !== undefined).sort((a, b) => a.col - b.col)
    )
}
