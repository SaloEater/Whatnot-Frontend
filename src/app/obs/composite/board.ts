/**
 * Board route and slot assignment for the Mount Olympus composite overlay.
 *
 * THE CENTRAL IDEA
 * ----------------
 * The board is not a grid that happens to hold tiles. It is a PATH — an ordered
 * list of cells — and tiles are placed along it by price rank. That single
 * decision gives three behaviours for free:
 *
 *   1. The most expensive slots sit closest to the camera, price falling
 *      outward symmetrically in both directions.
 *   2. Sold slots migrate to the far ends of the chains, because they sort
 *      last. The tarnished ring grows inward as the live cluster contracts.
 *   3. A sale can be animated as a Zuma-style advance — every tile behind the
 *      gap slides forward exactly one cell — because consecutive cells in the
 *      route are always physically adjacent.
 *
 * That last property is a HARD REQUIREMENT, not a nicety. If cell N and N+1
 * are not orthogonally adjacent, a tile advancing between them cuts diagonally
 * across other tiles and reads as a bug rather than a chain closing a gap.
 * `validateRoute` enforces it.
 *
 * There is no camera portal anymore — the route covers the FULL grid.
 */

/** [row, col], both 1-indexed. Row 1 is the top of the board. */
export type Cell = readonly [row: number, col: number]

export const GRID = { rows: 5, cols: 8 } as const

/** Inclusive straight run of cells from (r1,c1) to (r2,c2) along a row or column. */
function run(r1: number, c1: number, r2: number, c2: number): Cell[] {
  const cells: Cell[] = []
  const dr = Math.sign(r2 - r1)
  const dc = Math.sign(c2 - c1)
  let r = r1
  let c = c1
  for (;;) {
    cells.push([r, c])
    if (r === r2 && c === c2) return cells
    r += dr
    c += dc
  }
}

/**
 * The Zuma ROUTE — 30 cells through columns 2-7, in the authored order
 * (row-col segments):
 *
 *   3,4 -> 3,6 · 2,6 -> 2,3 · 3,3 -> 4,3 · 4,4 -> 4,6 ·
 *   5,6 -> 5,2 · 4,2 -> 1,2 · 1,3 -> 1,7 · 2,7 -> 5,7
 *
 *        c1   c2   c3   c4   c5   c6   c7   c8
 *  row1   ·   21   22   23   24   25   26    ·      · = static zone
 *  row2   ·   20    7    6    5    4   27    ·
 *  row3   ·   19    8    1    2    3   28    ·
 *  row4   ·   18    9   10   11   12   29    ·
 *  row5   ·   17   16   15   14   13   30    ·
 *
 * FULLY CONTIGUOUS — every consecutive pair is orthogonally adjacent
 * (the prefix ends at 4,3, exactly where the 4,4 -> 4,6 continuation
 * begins), so every Zuma advance slides.
 */
export const ORDER: readonly Cell[] = [
  ...run(3, 4, 3, 6),
  ...run(2, 6, 2, 3),
  ...run(3, 3, 4, 3),
  ...run(4, 4, 4, 6),
  ...run(5, 6, 5, 2),
  ...run(4, 2, 1, 2),
  ...run(1, 3, 1, 7),
  ...run(2, 7, 5, 7),
]

/** The route is fully contiguous — a single run for adjacency validation. */
export const ROUTE_RUNS: readonly (readonly Cell[])[] = [ORDER]

/**
 * The STATIC zone — columns 1 and 8, which the route never visits: 10 cells
 * filling the grid to its 40-card maximum. Queue positions beyond the route
 * land here ALTERNATING left/right, top-down (1,1 -> 1,8 -> 2,1 -> 2,8 ...),
 * so the two columns fill evenly — 4 static cards means 2 on each side.
 * Cards on these cells are EXCLUDED from the Zuma — they appear/move
 * instantly, never animated.
 */
export const STATIC_CELLS: readonly Cell[] = run(1, 1, 5, 1).flatMap((leftCell) => [
  leftCell,
  [leftCell[0], GRID.cols] as Cell,
])

/** Every cell a card can occupy: the animated route first, then the static zone. */
export const ALL_CELLS: readonly Cell[] = [...ORDER, ...STATIC_CELLS]

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export type Tier = 'gold' | 'silver' | 'bronze' | 'grey'

/** Counts are cumulative thresholds on price rank (0-indexed). */
export const TIER_CUTS = { gold: 3, silver: 10, bronze: 20 } as const

export function tierForRank(rank: number): Tier {
  if (rank < TIER_CUTS.gold) return 'gold'
  if (rank < TIER_CUTS.silver) return 'silver'
  if (rank < TIER_CUTS.bronze) return 'bronze'
  return 'grey'
}

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------

export interface Slot {
  /** Stable identity across re-sorts. Required for FLIP to work. */
  id: number
  price: number
  sold: boolean
  /** Special spots (ZEUS/HERA/ARES/NIKE/MEGA) render with a hatched fill. */
  special: boolean
}

export interface PlacedSlot extends Slot {
  cell: Cell
  /** Price rank across the WHOLE roster, live and sold alike. Drives the frame. */
  rank: number
  tier: Tier
  /** Index into ORDER. Zuma stagger is computed from this, not from geometry. */
  routeIndex: number
}

/**
 * ONE global queue: live slots take the best cells in descending price
 * order, sold slots fill the tail. Tier is assigned from rank across the
 * whole roster BEFORE the split, so a team does not change medal colour
 * just because something else sold. Queue positions 0..ORDER.length-1 sit
 * on the animated Zuma route; positions beyond spill into STATIC_CELLS
 * (columns 1/8), which never animate.
 *
 * Pure and deterministic — same input, same output. Call it on every data
 * tick; FLIP diffs the result against the previous render.
 */
export function placeSlots(slots: readonly Slot[]): PlacedSlot[] {
  const ranked = [...slots]
    .sort((a, b) => b.price - a.price)
    .map((s, rank) => ({ ...s, rank, tier: tierForRank(rank) }))

  const live = ranked.filter((s) => !s.sold)
  const dead = ranked.filter((s) => s.sold)

  return [...live, ...dead].map((s, routeIndex) => ({
    ...s,
    routeIndex,
    cell: ALL_CELLS[routeIndex],
  }))
}

/** True when a queue position sits in the static zone (no Zuma animation). */
export const isStaticIndex = (routeIndex: number) => routeIndex >= ORDER.length

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface RouteProblem {
  kind: 'duplicate' | 'not-adjacent' | 'out-of-bounds' | 'capacity'
  detail: string
}

/**
 * Run this in a test, and in dev on mount. A broken route fails silently at
 * runtime — tiles land in odd places or animate across the board — and the
 * cause is very hard to see from the rendered output.
 */
export function validateRoute(
  chains: readonly (readonly Cell[])[],
  rosterSize: number,
): RouteProblem[] {
  const problems: RouteProblem[] = []
  const seen = new Set<string>()
  let total = 0

  for (const chain of chains) {
    for (let i = 0; i < chain.length; i++) {
      const [row, col] = chain[i]
      const key = `${row},${col}`
      total++

      if (row < 1 || row > GRID.rows || col < 1 || col > GRID.cols) {
        problems.push({ kind: 'out-of-bounds', detail: key })
      }
      if (seen.has(key)) {
        problems.push({ kind: 'duplicate', detail: key })
      }
      seen.add(key)

      if (i > 0) {
        const [pr, pc] = chain[i - 1]
        const step = Math.abs(row - pr) + Math.abs(col - pc)
        if (step !== 1) {
          problems.push({
            kind: 'not-adjacent',
            detail: `${pr},${pc} -> ${key} (manhattan ${step}, must be 1)`,
          })
        }
      }
    }
  }

  if (total < rosterSize) {
    problems.push({ kind: 'capacity', detail: `${total} cells for ${rosterSize} tiles` })
  }
  return problems
}

/** Convenience: validate the shipped route. Expect []. */
/**
 * Validates the route PLUS the static zone (as its own runs — adjacency
 * there is irrelevant for animation but duplicate/bounds/capacity matter).
 */
export const validateDefault = (rosterSize = 37) =>
  validateRoute([...ROUTE_RUNS, run(1, 1, 5, 1), run(1, 8, 5, 8)], rosterSize)
