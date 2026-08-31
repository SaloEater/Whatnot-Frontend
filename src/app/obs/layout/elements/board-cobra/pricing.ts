// Pure tiering/row-layout logic for the `board:cobra` element (obs-layout-plan.md §2.9), lifted
// out of obs/prices/[id]/cobra/page.tsx (the old route — left byte-identical, copy not move).
//
// Every function here takes its inputs as arguments and touches neither `window` nor React state:
// `assignTiers`/`buildRows`/`rowWeights` (the three the plan names explicitly) plus the row-layout
// helpers they chain into for rendering (`rowSizes` — a `buildRows` internal; `rowTierOf`/
// `rowShares` — consumed by the component together with `rowWeights` to turn rows into flex
// weights/max-heights). The one thing genuinely specific to a call site — the tier price
// thresholds — was already a parameter (`TierThresholds`) in the old file, not a module constant;
// that convention carries over unchanged. The old route's sibling (obs/prices/[id]/page.tsx, the
// non-cobra board) reads `window.innerWidth` inside ITS OWN `buildRows` for a `MIN_CELL_WIDTH_PX`
// branch — cobra's `buildRows` has no such branch and never reads `window` to begin with, so there
// is nothing to remove here; see the CobraBoard.tsx file header for how box-relative sizing is
// handled instead (that concern lives entirely in the component, not in this pure module).
//
// The sheen-lottery's pure picker (`pickSheenTargets`) deliberately stays OUT of this file — the
// plan's split is "sheen lottery stays inside the component with proper cleanup on unmount", and
// keeping its selection logic next to the `setTimeout` scheduling it drives (in CobraBoard.tsx)
// means the whole lottery — timer, ref, and roll — reads as one unit instead of being split across
// two files for no benefit (nothing else calls it).

import type {SeriesTeamTotal} from '@/app/entity/entities'

export const BEST_THRESHOLD = 700
export const GOOD_THRESHOLD = 450
export const BEST_MIN = 3
export const GOOD_MIN = 4
export const MID_THRESHOLD = 50
export const MAX_ROW_CELLS = 7
export const TOTAL_ROWS = 6
export const DEFAULT_PRICE = '$100-$299'

/*
 * How many fewer teams the top rows carry than a standard row: the first holds
 * two fewer, the second one fewer, everything below is full. Fewer cells means
 * wider cells, so the high tiers read bigger without a hard cap on how many
 * teams the top row may contain.
 */
export const ROW_DEFICITS: readonly number[] = [2, 1]
const DEFICIT_TOTAL = ROW_DEFICITS.reduce((sum, d) => sum + d, 0)

/* Each row is either the same height as the row above it or 10% shorter — never taller. */
export const ROW_STEP = 0.9

/* No row may occupy more than this share of the board. Without it, a board that only fills two
   rows hands each one half the box. */
export const MAX_ROW_SHARE = 0.20

export type Tier = 'best' | 'good' | 'mid' | 'regular'

/** Highest tier first — the order cells are laid onto the board. */
export const TIER_ORDER = ['best', 'good', 'mid', 'regular'] as const

export const TIER_RANK: Record<Tier, number> = {best: 0, good: 1, mid: 2, regular: 3}

export const TIER_LABEL: Record<Tier, string> = {
    best:    'God Team',
    good:    'Giant Team',
    mid:     'Chaser Team',
    regular: 'Side Card Team',
}

export interface TeamCell {
    team: string
    displayPrice: string
    priceLeft: number
    tier: Tier
}

export interface TierThresholds {
    bestThreshold: number
    goodThreshold: number
    midThreshold: number
}

export function assignTiers(teamNames: string[], prices: SeriesTeamTotal[], defaultPrice: string, thresholds: TierThresholds): TeamCell[] {
    const {bestThreshold, goodThreshold, midThreshold} = thresholds
    const totalMap  = new Map(prices.map((p) => [p.team, p.total_price]))
    const unsoldMap = new Map(prices.map((p) => [p.team, p.price_left]))

    const withPrice: {team: string; total: number; unsold: number}[] = []
    const noPrice: string[] = []

    for (const team of teamNames) {
        const total = totalMap.get(team) ?? 0
        if (total > 0) withPrice.push({team, total, unsold: unsoldMap.get(team) ?? 0})
        else noPrice.push(team)
    }

    withPrice.sort((a, b) => b.total - a.total)

    const bestCount = Math.max(BEST_MIN, withPrice.filter((t) => t.total >= bestThreshold).length)
    const goodCount = Math.max(GOOD_MIN, withPrice.slice(bestCount).filter((t) => t.total >= goodThreshold).length)

    const cells: TeamCell[] = []

    withPrice.forEach(({team, total, unsold}, idx) => {
        let tier: Tier
        if (unsold === 0) {
            tier = 'regular'
        } else if (idx < bestCount) {
            tier = 'best'
        } else if (idx < bestCount + goodCount) {
            tier = 'good'
        } else if (total >= midThreshold) {
            tier = 'mid'
        } else {
            tier = 'regular'
        }
        const displayPrice = (unsold > 0 && tier !== 'regular') ? `$${Math.ceil(unsold / 25) * 25}` : defaultPrice
        cells.push({team, displayPrice, priceLeft: unsold, tier})
    })

    noPrice.forEach((team) => {
        cells.push({team, displayPrice: defaultPrice, priceLeft: 0, tier: 'regular'})
    })

    return cells
}

/*
 * How many cells land in each row. Every row would hold `base`, except the top
 * ones give up their ROW_DEFICITS share. Whatever the division leaves over goes
 * to the bottom rows, so the top-lighter ordering survives an uneven split.
 */
function rowSizes(total: number, rowCount: number): number[] {
    const deficits   = Array.from({length: rowCount}, (_, i) => ROW_DEFICITS[i] ?? 0)
    const deficitSum = deficits.reduce((sum, d) => sum + d, 0)
    const base       = Math.floor((total + deficitSum) / rowCount)

    const sizes = deficits.map((d) => Math.max(0, base - d))

    let left = total - sizes.reduce((sum, n) => sum + n, 0)
    for (let i = rowCount - 1; left > 0; i = i === 0 ? rowCount - 1 : i - 1) {
        sizes[i]++
        left--
    }
    return sizes
}

export function buildRows(cells: TeamCell[]): TeamCell[][] {
    const byPriceThenName = (a: TeamCell, b: TeamCell) => {
        const diff = b.priceLeft - a.priceLeft
        return diff !== 0 ? diff : a.team.localeCompare(b.team)
    }
    const ordered = ([...TIER_ORDER] as Tier[]).flatMap((tier) =>
        cells.filter((c) => c.tier === tier).sort(byPriceThenName)
    )
    if (ordered.length === 0) return []

    // Capacity per row is MAX_ROW_CELLS, less what the top rows give up.
    const rowCount = Math.min(
        TOTAL_ROWS,
        Math.max(1, Math.ceil((ordered.length + DEFICIT_TOTAL) / MAX_ROW_CELLS)),
    )

    const rows: TeamCell[][] = []
    let idx = 0
    for (const count of rowSizes(ordered.length, rowCount)) {
        if (count <= 0) continue
        rows.push(ordered.slice(idx, idx + count))
        idx += count
    }
    return rows
}

export function rowTierOf(row: TeamCell[]): Tier {
    return row.some((c) => c.tier === 'best') ? 'best'
         : row.some((c) => c.tier === 'good') ? 'good'
         : row.some((c) => c.tier === 'mid')  ? 'mid'
         : 'regular'
}

/*
 * Height weights for the rows. Dropping a tier costs 10% of the previous row's
 * height; staying on the same tier keeps it. The Math.min makes "never taller
 * than the row above" structural rather than a side effect of buildRows' order.
 * With flex-basis 0%, a row's share of the board is weight / sum(weights).
 */
export function rowWeights(tiers: Tier[]): number[] {
    return tiers.reduce<number[]>((acc, tier, i) => {
        if (i === 0) {
            acc.push(1)
            return acc
        }
        const stepped = TIER_RANK[tier] > TIER_RANK[tiers[i - 1]] ? acc[i - 1] * ROW_STEP : acc[i - 1]
        acc.push(Math.min(acc[i - 1], stepped))
        return acc
    }, [])
}

/*
 * Each row's share of the board. Normally that is just its weight over the
 * total, but when the tallest row would exceed MAX_ROW_SHARE every share is
 * scaled by the same factor — capping rows individually would let flexbox hand
 * the slack to the rows below and flatten the 10% steps. Any leftover height is
 * left empty at the bottom of the board.
 */
export function rowShares(weights: number[]): number[] {
    const total = weights.reduce((sum, w) => sum + w, 0)
    if (total === 0) return weights.map(() => 0)

    const shares  = weights.map((w) => w / total)
    const tallest = Math.max(...shares)
    const scale   = tallest > MAX_ROW_SHARE ? MAX_ROW_SHARE / tallest : 1
    return shares.map((s) => s * scale)
}
