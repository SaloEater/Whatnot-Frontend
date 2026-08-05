/**
 * Builds the placed, priced roster for the board — the one function shared
 * between roster.ts's stage-1 mock data and useCompositeData.ts's stage-2
 * live path, so the two can never quietly drift apart.
 *
 * Mirrors /obs/prices/[id]'s use of assignTiers for teams (see pricing.ts),
 * then places everything via board.ts's placeSlots() UNCHANGED, then
 * overrides each placed team slot's `.tier` with the pricing-derived medal
 * (best/good/mid/regular -> gold/silver/bronze/grey) — see pricing.ts's
 * PRICING_TIER_TO_FRAME comment for why this supersedes board.ts's
 * rank-cut tierForRank()/TIER_CUTS for team tiles.
 *
 * Specials go through the same pricing pass as teams — /obs/prices/[id]
 * feeds assignTiers every event team including custom spots, and a spot like
 * "Miscellaneous" can have real series data (total_price/price_left). A
 * special WITH data prices and tiers exactly like a team; a special WITHOUT
 * data keeps its event price and is pinned to grey (a coincidental medal
 * would fake price-tier meaning — see PRICING_TIER_TO_FRAME).
 */
import { ALL_CELLS, placeSlots, type PlacedSlot } from './board'
import { assignTiers, PRICING_TIER_TO_FRAME, type TeamCell, type TierThresholds } from './pricing'
import type { SeriesTeamTotal } from '@/app/entity/entities'
import type { PlacedRosterSlot, RosterSlot } from './types'

export interface TeamRef {
  id: number
  team: string
  sold: boolean
}

export interface SpecialRef {
  id: number
  label: string
  price: number
  sold: boolean
}

export function composeRoster(
  specials: readonly SpecialRef[],
  teams: readonly TeamRef[],
  prices: readonly SeriesTeamTotal[],
  defaultPrice: string,
  thresholds: TierThresholds,
): PlacedRosterSlot[] {
  // Specials are priced too — /obs/prices/[id] passes every event team,
  // custom spots included, so the tier pool (bestCount/goodCount indices)
  // matches that page only if the pool matches.
  const allNames = [...teams.map((t) => t.team), ...specials.map((s) => s.label)]
  const cells = assignTiers(allNames, prices, defaultPrice, thresholds)
  const cellByTeam = new Map<string, TeamCell>(cells.map((c) => [c.team, c]))
  /** Labels that have REAL series price data (total > 0) — only these give a special a priced cell. */
  const pricedNames = new Set(prices.filter((p) => p.total_price > 0).map((p) => p.team))

  const specialSlots: RosterSlot[] = specials.map((s) => {
    const cell = pricedNames.has(s.label) ? cellByTeam.get(s.label) : undefined
    return {
      id: s.id,
      label: s.label,
      price: cell ? cell.priceLeft : s.price,
      sold: s.sold,
      special: true,
      displayPrice: cell?.displayPrice,
    }
  })

  const teamSlots: RosterSlot[] = teams.map((t) => {
    // assignTiers always returns one cell per input name, so this should
    // never miss — but this now runs on live data, so fall back defensively
    // (default price, unranked) instead of crashing the overlay.
    const cell: TeamCell = cellByTeam.get(t.team) ?? {
      team: t.team,
      displayPrice: defaultPrice,
      priceLeft: 0,
      tier: 'regular',
    }
    return {
      id: t.id,
      label: t.team,
      // Ranking/placement price is price_left (remaining series value), not
      // the pricing tier's total_price — proximity to the camera tracks
      // what's actually still available.
      price: cell.priceLeft,
      sold: t.sold,
      special: false,
      displayPrice: cell.displayPrice,
    }
  })

  let roster: RosterSlot[] = [...specialSlots, ...teamSlots]

  // The board (route + static zone) holds ALL_CELLS.length cards. A break
  // can in principle return more events than that — render the first
  // boardful in input order and flag it instead of indexing past the grid.
  if (roster.length > ALL_CELLS.length) {
    console.error(
      `[composite roster] ${roster.length} slots exceed the board's ${ALL_CELLS.length}-cell capacity; rendering the first ${ALL_CELLS.length}.`,
    )
    roster = roster.slice(0, ALL_CELLS.length)
  }

  const rawPlaced = placeSlots(roster) as (PlacedSlot & { label: string; displayPrice?: string })[]

  return rawPlaced.map((s) => ({
    ...s,
    // A special with real price data wears its earned medal; one without is
    // pinned grey. Teams always take the pricing tier.
    tier:
      s.special && !pricedNames.has(s.label)
        ? 'grey'
        : PRICING_TIER_TO_FRAME[cellByTeam.get(s.label)?.tier ?? 'regular'],
  }))
}
