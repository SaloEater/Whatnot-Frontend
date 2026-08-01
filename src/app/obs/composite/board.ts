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
 * The camera portal is not positioned by hand — it is exactly the rectangle of
 * cells the route never visits. Change the route and the window follows.
 */

/** [row, col], both 1-indexed. Row 1 is the top of the board. */
export type Cell = readonly [row: number, col: number]

export const GRID = { rows: 5, cols: 10 } as const

/**
 * Left-half chain, best cell first.
 *
 *        c1   c2   c3   c4   c5 | c6   c7   c8   c9  c10
 *  row1  15   14    ·    ·    · |  ·    ·    ·   14   15     · = camera portal
 *  row2  16   13    ·    ·    · |  ·    ·    ·   13   16
 *  row3  17   12    3    2    1 |  1    2    3   12   17
 *  row4  18   11    4    5    6 |  6    5    4   11   18
 *  row5  19   10    9    8    7 |  7    8    9   10   19
 *
 * Start directly under the camera, up-down-up through cols 3-5, sweep left
 * along row 5, climb col 2, over the top, then col 1 descending.
 */
export const ROUTE_LEFT: readonly Cell[] = [
  [3, 5], [3, 4], [3, 3],
  [4, 3], [4, 4], [4, 5],
  [5, 5], [5, 4], [5, 3], [5, 2],
  [4, 2], [3, 2], [2, 2], [1, 2],
  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1],
] as const

/** Right half is the mirror: col -> (cols + 1) - col. */
export const mirrorCell = ([row, col]: Cell): Cell => [row, GRID.cols + 1 - col] as const

export const ROUTE_RIGHT: readonly Cell[] = ROUTE_LEFT.map(mirrorCell)

/**
 * Interleaved assignment order: rank 1 -> left head, rank 2 -> right head,
 * rank 3 -> next left, and so on. 38 cells for a 37-tile roster (32 NFL teams
 * plus 5 special spots), leaving one spare at the tail.
 *
 * The two chains ripple INDEPENDENTLY — a sale on the left never disturbs the
 * right. That is deliberate: two short ripples read better than one board-wide
 * reshuffle.
 */
export const ORDER: readonly Cell[] = ROUTE_LEFT.flatMap((cell, i) => [
  cell,
  ROUTE_RIGHT[i],
])

/** The cells no chain visits — i.e. the camera portal. Derived, never authored. */
export const PORTAL = { rowStart: 1, rowEnd: 3, colStart: 3, colEnd: 9 } as const

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
 * Live slots take the best cells in descending price order; sold slots fill the
 * tail. Tier is assigned from rank across the whole roster BEFORE the split, so
 * a team does not change medal colour just because something else sold.
 *
 * HALF-STABILITY: a slot's chain (left/right) is decided by alternating over
 * the whole-roster price ranking (rank 0 -> left, 1 -> right, 2 -> left, ...)
 * and the live-first/sold-last migration then happens WITHIN each chain. A
 * team that sells therefore migrates to the tail of ITS OWN half and never
 * jumps across the camera to the other chain — which is also what makes the
 * chains genuinely independent (a left-side sale cannot move any right-side
 * tile), as the chain design always promised.
 *
 * Pure and deterministic — same input, same output. Call it on every data tick;
 * FLIP diffs the result against the previous render.
 */
export function placeSlots(slots: readonly Slot[]): PlacedSlot[] {
  const ranked = [...slots]
    .sort((a, b) => b.price - a.price)
    .map((s, rank) => ({ ...s, rank, tier: tierForRank(rank) }))

  // rank parity picks the chain; each chain then orders live first, sold last.
  const halves: [typeof ranked, typeof ranked] = [[], []]
  ranked.forEach((s, i) => halves[i % 2].push(s))
  const chains = [ROUTE_LEFT, ROUTE_RIGHT] as const

  return halves.flatMap((half, h) => {
    const live = half.filter((s) => !s.sold)
    const dead = half.filter((s) => s.sold)
    return [...live, ...dead].map((s, chainIndex) => ({
      ...s,
      // ORDER interleaves the chains (ORDER[2i] = left[i], ORDER[2i+1] = right[i]),
      // so this routeIndex keeps the invariant cell === ORDER[routeIndex].
      routeIndex: chainIndex * 2 + h,
      cell: chains[h][chainIndex],
    }))
  })
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface RouteProblem {
  kind: 'duplicate' | 'not-adjacent' | 'in-portal' | 'out-of-bounds' | 'capacity'
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

      const inPortal =
        row >= PORTAL.rowStart && row < PORTAL.rowEnd &&
        col >= PORTAL.colStart && col < PORTAL.colEnd
      if (inPortal) {
        problems.push({ kind: 'in-portal', detail: key })
      }

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
export const validateDefault = (rosterSize = 37) =>
  validateRoute([ROUTE_LEFT, ROUTE_RIGHT], rosterSize)
