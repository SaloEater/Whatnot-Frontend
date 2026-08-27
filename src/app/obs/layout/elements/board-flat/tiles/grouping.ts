// Grouping: turn the set of flipped cells into rectangular groups.
//
// Strict rectangle merge (design doc draft rule), replayed in SALE ORDER:
// cells are added one by one as 1×1 groups following Event.index, and after
// each addition two groups merge ONLY when they share a full edge of equal
// extent (so the union is again a filled rectangle). A group is never broken
// up to feed a different merge — e.g. a formed 3×3 keeps its cells even when
// a new cell lands next to its first row; that cell waits as 1×1 until a
// matching 3×1 column completes beside the 3×3.
//
// Because the replay is a pure function of the sold data (positions + sale
// order), the partition is deterministic across re-renders AND page reloads —
// no runtime history needed.

import {Group, GroupingStrategy, OrderedPos, Pos} from "./types"

interface Rect {
    r0: number
    c0: number
    r1: number
    c1: number
}

/** Board index (position in the sorted events array) → grid position. */
export function posFromIndex(i: number, cols: number): Pos {
    return {row: Math.floor(i / cols), col: i % cols}
}

function tierOf(cells: number): 1 | 2 | 3 {
    return cells <= 3 ? 1 : cells <= 8 ? 2 : 3
}

function toGroup(r: Rect): Group {
    const cells = (r.r1 - r.r0 + 1) * (r.c1 - r.c0 + 1)
    return {...r, cells, tier: tierOf(cells), key: `${r.r0},${r.c0},${r.r1},${r.c1}`}
}

// Two rects merge only if they share a full edge with equal extent on the shared
// axis, so the union is again a fully-filled rectangle.
function mergeableHoriz(a: Rect, b: Rect): boolean {
    return a.r0 === b.r0 && a.r1 === b.r1 && (a.c1 + 1 === b.c0 || b.c1 + 1 === a.c0)
}
function mergeableVert(a: Rect, b: Rect): boolean {
    return a.c0 === b.c0 && a.c1 === b.c1 && (a.r1 + 1 === b.r0 || b.r1 + 1 === a.r0)
}
function union(a: Rect, b: Rect): Rect {
    return {
        r0: Math.min(a.r0, b.r0), c0: Math.min(a.c0, b.c0),
        r1: Math.max(a.r1, b.r1), c1: Math.max(a.c1, b.c1),
    }
}

// Canonical order → deterministic merge order and stable output.
function canonical(rects: Rect[]): Rect[] {
    return rects.slice().sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0)
}

// Repeatedly merge the first eligible pair in canonical order, preferring
// horizontal merges, until no merge is possible (fixpoint).
function mergeFixpoint(input: Rect[]): Rect[] {
    let rects = input
    for (;;) {
        rects = canonical(rects)
        let merged = false
        outer:
        for (const horizontalPass of [true, false]) {
            for (let i = 0; i < rects.length; i++) {
                for (let j = i + 1; j < rects.length; j++) {
                    const ok = horizontalPass
                        ? mergeableHoriz(rects[i], rects[j])
                        : mergeableVert(rects[i], rects[j])
                    if (ok) {
                        const u = union(rects[i], rects[j])
                        rects.splice(j, 1)
                        rects.splice(i, 1)
                        rects.push(u)
                        merged = true
                        break outer
                    }
                }
            }
        }
        if (!merged) break
    }
    return canonical(rects)
}

export const strictRectangleMerge: GroupingStrategy = (cells) => {
    // Replay the sale sequence: earliest sold first (row/col as a deterministic
    // tie-break in case of duplicate sale indexes).
    const sorted = cells.slice().sort((a, b) => a.order - b.order || a.row - b.row || a.col - b.col)

    let rects: Rect[] = []
    for (const c of sorted) {
        rects.push({r0: c.row, c0: c.col, r1: c.row, c1: c.col})
        // The partition is a fixpoint before each addition, so re-running the
        // fixpoint only performs merges enabled by the new cell (and chains).
        rects = mergeFixpoint(rects)
    }
    return rects.map(toGroup)
}

/** A single rectangular group from explicit bounds (e.g. the full board). */
export function rectGroup(r0: number, c0: number, r1: number, c1: number): Group {
    return toGroup({r0, c0, r1, c1})
}

export function computeGroups(
    cells: OrderedPos[],
    strategy: GroupingStrategy = strictRectangleMerge,
): Group[] {
    return strategy(cells)
}
