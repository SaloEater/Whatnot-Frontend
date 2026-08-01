/**
 * Pure pricing/tier logic for the composite board's team tiles.
 *
 * MIRRORS `assignTiers` in `src/app/obs/prices/[id]/page.tsx` (lines 38-81)
 * byte-for-byte. That page is LIVE and must not be modified, so this is a
 * deliberate duplication rather than a shared import — if `assignTiers`
 * changes there, this file must be updated to match, and vice versa.
 *
 * Stage 1 (now): pure functions only, fed the hardcoded mock data in
 * roster.ts. No fetches happen here.
 *
 * Stage 2 wires these three real data sources — the same three
 * `/obs/prices/[id]` already fetches:
 *   - `series_get`                        -> `Series.default_price`   (the `defaultPrice` arg below)
 *   - `widget_board_price_ranges_list`    -> `PriceRange[]`           (resolveThresholds' input)
 *   - `GET /api/series/{seriesId}/prices` -> `SeriesTeamTotal[]`      (the `prices` arg below)
 */
import type { PriceRange, SeriesTeamTotal } from '@/app/entity/entities'

/** Fallback thresholds — used when a tier is missing from `widget_board_price_ranges_list`. */
export const BEST_THRESHOLD = 700
export const GOOD_THRESHOLD = 450
export const MID_THRESHOLD = 50
const BEST_MIN = 3
const GOOD_MIN = 4
/** Fallback default price — used when `Series.default_price` is empty. */
export const DEFAULT_PRICE = '$100-$299'

export type PricingTier = 'best' | 'good' | 'mid' | 'regular'

export interface TeamCell {
  team: string
  displayPrice: string
  priceLeft: number
  tier: PricingTier
}

export interface TierThresholds {
  bestThreshold: number
  goodThreshold: number
  midThreshold: number
}

/** Same fallback resolution as page.tsx lines 221-223. */
export function resolveThresholds(priceRanges: readonly PriceRange[]): TierThresholds {
  return {
    bestThreshold: priceRanges.find((r) => r.tier_id === 'best')?.price_from ?? BEST_THRESHOLD,
    goodThreshold: priceRanges.find((r) => r.tier_id === 'good')?.price_from ?? GOOD_THRESHOLD,
    midThreshold: priceRanges.find((r) => r.tier_id === 'mid')?.price_from ?? MID_THRESHOLD,
  }
}

/**
 * Byte-for-byte port of `assignTiers()` in `/obs/prices/[id]/page.tsx`
 * (lines 38-81). Keep in sync with that file.
 */
export function assignTiers(
  teamNames: readonly string[],
  prices: readonly SeriesTeamTotal[],
  defaultPrice: string,
  thresholds: TierThresholds,
): TeamCell[] {
  const { bestThreshold, goodThreshold, midThreshold } = thresholds
  const totalMap = new Map(prices.map((p) => [p.team, p.total_price]))
  const unsoldMap = new Map(prices.map((p) => [p.team, p.price_left]))

  const withPrice: { team: string; total: number; unsold: number }[] = []
  const noPrice: string[] = []

  for (const team of teamNames) {
    const total = totalMap.get(team) ?? 0
    if (total > 0) withPrice.push({ team, total, unsold: unsoldMap.get(team) ?? 0 })
    else noPrice.push(team)
  }

  withPrice.sort((a, b) => b.total - a.total)

  const bestCount = Math.max(BEST_MIN, withPrice.filter((t) => t.total >= bestThreshold).length)
  const goodCount = Math.max(
    GOOD_MIN,
    withPrice.slice(bestCount).filter((t) => t.total >= goodThreshold).length,
  )

  const cells: TeamCell[] = []

  withPrice.forEach(({ team, total, unsold }, idx) => {
    let tier: PricingTier
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
    const displayPrice = unsold > 0 && tier !== 'regular' ? `$${Math.ceil(unsold / 25) * 25}` : defaultPrice
    cells.push({ team, displayPrice, priceLeft: unsold, tier })
  })

  noPrice.forEach((team) => {
    cells.push({ team, displayPrice: defaultPrice, priceLeft: 0, tier: 'regular' })
  })

  return cells
}

/**
 * Medal-frame mapping for team tiles. SUPERSEDES board.ts's rank-cut
 * `tierForRank()`/`TIER_CUTS` — see roster.ts, where each placed team slot's
 * `.tier` is overridden with this mapping after `placeSlots()` runs.
 */
export const PRICING_TIER_TO_FRAME: Record<PricingTier, 'gold' | 'silver' | 'bronze' | 'grey'> = {
  best: 'gold',
  good: 'silver',
  mid: 'bronze',
  regular: 'grey',
}

/**
 * Board tiles only: how to lay out a display price inside a 79px-wide tile.
 *
 * A full range string ("$100-$299") can't fit one line at 36px/600
 * ("$120+" alone measured 73px of the 75px content box), so ranges are shown
 * in FULL per the requirement, by (a) normalising the second "$" away
 * ("$100-299"), (b) splitting after the "-" onto two lines, and (c) dropping
 * to a reduced size. Short strings — tiered prices like "$100", or a range
 * that fits — stay on one line at full size.
 *
 * The 5-char cutoff comes from the measured fit: 5 glyphs of Barlow
 * Condensed 600 at 36px ≈ 73px. The reduced two-line size (28px) keeps the
 * widest realistic line ("$1000-") inside the tile and the price block
 * (2 × 28px) plus the 44px logo inside the 116px tile height.
 *
 * pricing.ts's own output (assignTiers) always keeps the full string; call
 * this at the render site (BoardTile) so other surfaces — the checklist,
 * future widgets — can still show the plain range.
 */
export interface BoardPriceLayout {
  lines: string[]
  fontSize: number
}

const ONE_LINE_MAX_CHARS = 5
const RANGE_FONT_SIZE = 28

export function boardPriceLayout(displayPrice: string, fullFontSize: number): BoardPriceLayout {
  // "$100-$299" -> "$100-299"
  const normalized = displayPrice.replace(/-\$/, '-')
  if (normalized.length <= ONE_LINE_MAX_CHARS || !normalized.includes('-')) {
    return { lines: [normalized], fontSize: fullFontSize }
  }
  const dash = normalized.indexOf('-')
  return {
    lines: [normalized.slice(0, dash + 1), normalized.slice(dash + 1)],
    fontSize: RANGE_FONT_SIZE,
  }
}
