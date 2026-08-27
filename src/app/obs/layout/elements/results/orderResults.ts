// Pure ordering logic shared by `results` (obs-layout-plan.md §2.3) and `resultsThin` (§2.4).
// Originally lifted out of obs/teams/[id]/page.tsx (~lines 44-59 for the filter/sort, ~64-85 for
// the two-column interleave); generalised in §2.4 to an N-column interleave with a pluggable sort
// so a second caller (ThinResults) doesn't need a copy of this logic — see `ResultsSort` in
// schema.ts for the two sort literals.

import type {Event} from '@/app/entity/entities'
import {IsTeam} from '@/app/common/teams'
import type {ResultsSort} from '../../schema'

/**
 * `flow` is how the CONSUMER's grid is meant to be read, and it must match how that grid actually
 * lays out:
 *  - 'column' — the caller's grid is read DOWN each column, so the list is pre-scrambled
 *    (column-major) to make a contiguous run land in one column. This is `results` (§2.3).
 *  - 'row' — the caller's grid is read left-to-right like text, so the sorted order is used AS IS.
 *    Anything that groups (notably `sort: 'customer'`) needs this: a column-major scramble in a
 *    row-major grid puts a customer's teams either side of unrelated rows, which reads as the same
 *    customer appearing twice with a gap between.
 */
export type ResultsFlow = 'column' | 'row'

export type OrderResultsOptions = {
    columns: number
    sort: ResultsSort
    flow?: ResultsFlow
}

export type OrderedResults = {
    // Read order for an N-column CSS grid (grid-auto-flow: row, one item per cell in DOM order).
    ordered: Event[]
    // Number of grid rows the interleave below produces. For `sort: 'alphabetical'` this is the
    // sum of the team-block and other-block row counts (each interleaved independently, stacked
    // team-block-first) rather than a simple ceil(total/columns); for `sort: 'customer'` the
    // whole list is one block, so it IS ceil(total/columns).
    rows: number
}

// Column-major interleave, generalised from a hardcoded 2 columns to N (obs-layout-plan.md
// §2.4). Column c gets items [c*rows, (c+1)*rows) of the input list; the returned `ordered`
// array is emitted ROW-major (row 0's N cells left-to-right, then row 1's, ...) since that is DOM
// order for a `grid-auto-flow: row` CSS grid with `columns` explicit columns. For columns === 2
// this produces byte-identical output to the original two-column version: index = c*rows + r is
// `r` for c=0 and `rows+r` for c=1, matching the old `list[i]` / `list[i + rows]` pair exactly.
function interleaveColumns(list: Event[], columns: number): {ordered: Event[]; rows: number} {
    const rows = Math.ceil(list.length / columns)
    const ordered: Event[] = []
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < columns; c++) {
            const index = c * rows + r
            if (index < list.length) {
                ordered.push(list[index])
            }
        }
    }
    return {ordered, rows}
}

function baseFilter(events: Event[]): Event[] {
    // Matches the old route's `refreshEvents()`: drop giveaways/notes.
    return events.filter((e) => !e.is_giveaway && !e.note)
}

// 'alphabetical' — the original `filterAndSort()` comparator, unchanged: team events sort before
// non-team events, and within either group the comparator orders by `team` name. This must stay
// byte-identical to the pre-§2.4 behaviour — ResultsElement (§2.3) keeps calling `orderResults`
// with `{columns: 2, sort: 'alphabetical'}` and must render identically to before.
function alphabeticalSort(events: Event[]): Event[] {
    return events.slice().sort((a, b) => {
        const aIsTeam = IsTeam(a.team)
        const bIsTeam = IsTeam(b.team)
        if (aIsTeam && !bIsTeam) return -1
        if (!aIsTeam && bIsTeam) return 1
        if (a.team > b.team) return 1
        if (a.team < b.team) return -1
        return 0
    })
}

function isUnsold(e: Event): boolean {
    return e.customer === ''
}

// 'customer' (new in §2.4) — group by customer so everything one buyer won sits together: sold
// events sort by customer name first, then by team name within a customer; unsold/empty spots
// (customer === '') have no customer to group by, so they form their own group sorted last.
function customerSort(events: Event[]): Event[] {
    return events.slice().sort((a, b) => {
        const aUnsold = isUnsold(a)
        const bUnsold = isUnsold(b)
        if (aUnsold && !bUnsold) return 1
        if (!aUnsold && bUnsold) return -1
        if (a.customer !== b.customer) return a.customer < b.customer ? -1 : 1
        if (a.team !== b.team) return a.team < b.team ? -1 : 1
        return 0
    })
}

export function orderResults(rawEvents: Event[], options: OrderResultsOptions): OrderedResults {
    const {columns, sort, flow = 'column'} = options
    const filtered = baseFilter(rawEvents)
    // A row-major consumer reads the sorted order directly; only a column-major one needs the
    // scramble. `rows` is still what the grid needs to reserve either way.
    const layOut = (list: Event[]): OrderedResults =>
        flow === 'row'
            ? {ordered: list, rows: Math.ceil(list.length / Math.max(1, columns))}
            : interleaveColumns(list, columns)

    if (sort === 'customer') {
        // One flat block — no team/other split: the whole point is that a customer's teams stay
        // together regardless of whether any given team name is a "real" team.
        return layOut(customerSort(filtered))
    }

    // 'alphabetical': preserve the original team-block / other-block split, each interleaved
    // independently and stacked team-block-first (see file header + interleaveColumns comment).
    const sorted = alphabeticalSort(filtered)
    const teamEvents = sorted.filter((e) => IsTeam(e.team))
    const otherEvents = sorted.filter((e) => !IsTeam(e.team))

    const team = layOut(teamEvents)
    const other = layOut(otherEvents)

    return {
        ordered: [...team.ordered, ...other.ordered],
        rows: team.rows + other.rows,
    }
}
