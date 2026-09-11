// Pure layout maths for the `board:cobra_flat` element (cobra-flat-board-plan.md §3). Mirrors the
// split between this file and CobraFlatBoard.tsx the way board-cobra/pricing.ts mirrors
// CobraBoard.tsx: everything here is a pure function of its arguments, touches neither `window`
// nor React, and can be reasoned about without mounting anything.
//
// Three responsibilities, matching the plan's three subsections:
//   §3.1 value order — sortCells(): unsold before sold, then tier rank ascending, then price left
//                       descending, then team name / event id as a stable tie-break.
//   §3.2 row split   — splitRows(): balances N cells across ceil(N/MAX_COLS) rows (MAX_COLS at
//                       most per row), with the fuller (`base + 1`-cell) rows on TOP — a row left
//                       with only `base` cells is always one of the bottom rows.
//   §3.3 slot order  — centreOutOrder() + layoutCells(): each row fills from its centre outward,
//                       and the GLOBAL order across rows is round-robin by that per-row centre-out
//                       step (every row's step-0/centre slot first top to bottom, then every row's
//                       step-1 slot, and so on), so the highest-value cells land in the centre
//                       column and value falls off toward both edges as the steps run out.
//
// No FLIP/move-animation bookkeeping lives here (plan §7.1, explicitly deferred to a later task) —
// this module only ever produces one snapshot grid for whatever `cells` it's given "now"; if a
// move animation is added later it hooks in around the component's render of this output, not
// inside it (see the comment at CobraFlatBoard's render call site).

import type {Tier} from '../board-cobra/pricing'
import {TIER_RANK} from '../board-cobra/pricing'

/** At most this many cells per row (plan §1.4/§3.2/§4). */
export const MAX_COLS = 11

/** One team-slot event, reduced to what the layout maths needs (plan §2/§3.1). */
export interface FlatCell {
    eventId: number
    team: string
    tier: Tier
    /** `event.customer !== ''` — flat's rule, not cobra's `price_left === 0` (plan §2). */
    sold: boolean
    priceLeft: number
}

/** §3.1 — unsold before sold, then tier rank ascending, then price left descending, then team
 *  name (locale-aware), then event id as the final stable tie-break. Sold cells keep this same
 *  ordering among themselves so the sold block (destined for the outer edges) is deterministic
 *  too, even though nothing about their render depends on it. */
export function sortCells(cells: readonly FlatCell[]): FlatCell[] {
    return [...cells].sort((a, b) => {
        if (a.sold !== b.sold) return a.sold ? 1 : -1
        if (a.tier !== b.tier) return TIER_RANK[a.tier] - TIER_RANK[b.tier]
        if (a.priceLeft !== b.priceLeft) return b.priceLeft - a.priceLeft
        const byName = a.team.localeCompare(b.team)
        return byName !== 0 ? byName : a.eventId - b.eventId
    })
}

/** §3.2 — how many cells each row holds. `extra` rows (the fuller ones, `base + 1` cells) are the
 *  TOP rows; whatever is left at plain `base` cells sits below them, so a short row — when the
 *  split isn't even — is always the bottom-most one. */
export function splitRows(total: number, maxCols: number = MAX_COLS): number[] {
    if (total <= 0) return []
    const rowCount = Math.ceil(total / maxCols)
    const base = Math.floor(total / rowCount)
    const extra = total % rowCount
    return Array.from({length: rowCount}, (_, i) => base + (i < extra ? 1 : 0))
}

/** §3.3 — one row's column positions (0-based), in centre-out order: for an odd-length row, the
 *  middle slot first, then alternating +1/-1 steps outward; for an even-length row, the two centre
 *  slots first (right-of-centre then left-of-centre), then alternating outward the same way. */
export function centreOutOrder(n: number): number[] {
    const order: number[] = []
    if (n <= 0) return order
    if (n % 2 === 1) {
        const mid = (n - 1) / 2
        order.push(mid)
        for (let step = 1; order.length < n; step++) {
            order.push(mid + step)
            if (order.length < n) order.push(mid - step)
        }
    } else {
        const mid = n / 2
        order.push(mid, mid - 1)
        for (let step = 1; order.length < n; step++) {
            order.push(mid + step)
            if (order.length < n) order.push(mid - 1 - step)
        }
    }
    return order
}

/** A cell placed at a row/column position, plus its rank in the value order (0 = most valuable).
 *  Rank isn't otherwise derivable from render position, since sold cells share the tail of the
 *  order regardless of which row they land on. */
export interface PlacedCell {
    cell: FlatCell
    row: number
    col: number
    rank: number
}

/**
 * Lays `cells` out into `PlacedCell[][]` render rows: §3.2's row sizes, §3.3's per-row centre-out
 * slots, dealt from the §3.1 value order via the GLOBAL round-robin-by-step sequence across rows
 * (every row's step-0/centre slot first top to bottom, then every row's step-1 slot, and so on).
 * Each returned row is sorted left-to-right by column so the caller can render it directly.
 */
export function layoutCells(cells: readonly FlatCell[], maxCols: number = MAX_COLS): PlacedCell[][] {
    const ordered = sortCells(cells)
    const rowSizes = splitRows(ordered.length, maxCols)
    const rowOrders = rowSizes.map(centreOutOrder)

    // Slot addresses in GLOBAL dealing order: step index outward, round-robin across rows.
    const maxSteps = rowSizes.length > 0 ? Math.max(...rowSizes) : 0
    const slots: Array<{ row: number; col: number }> = []
    for (let step = 0; step < maxSteps; step++) {
        for (let row = 0; row < rowSizes.length; row++) {
            if (step < rowOrders[row].length) slots.push({row, col: rowOrders[row][step]})
        }
    }

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
