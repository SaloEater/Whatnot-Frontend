/**
 * Hardcoded mock roster for the composite overlay, used two ways:
 *   - stage-1 static shell development, and
 *   - the `?mock=1` escape hatch documented in useCompositeData.ts, which
 *     stage 2 keeps around for testing/demoing without a live break.
 *
 * TEAM PRICING mirrors `/obs/prices/[id]` (see pricing.ts): the mock
 * SeriesTeamTotal[]/PriceRange[]/default-price below stand in for the three
 * real data sources and are deliberately built to exercise every branch of
 * `assignTiers`:
 *   - 4 teams over the mock best threshold (bestCount = max(3, 4) = 4)
 *   - 5 teams over the mock good threshold, one of which (Miami Dolphins)
 *     has price_left = 0 and must render as regular/default despite a
 *     good-range total — the "always regular when unsold is 0" rule
 *   - 3 teams in the mid band
 *   - several teams with price data too low for any tier (regular, but with
 *     a real price_left so they still rank/place above the no-data teams)
 *   - 6 teams entirely absent from the mock prices array (no series data at
 *     all -> regular/default, priceLeft 0)
 *   - Buffalo Bills' price_left (86) is the visible $25 round-up case:
 *     ceil(86/25)*25 = 100 -> "$100"
 *
 * Placement, tiering, and the "specials are pinned to grey" rule all go
 * through composeRoster.ts — the same function useCompositeData.ts uses for
 * live data — so the mock and the real board can never quietly diverge.
 */
import { composeRoster, type SpecialRef, type TeamRef } from './composeRoster'
import { resolveThresholds } from './pricing'
import type { PriceRange, SeriesTeamTotal } from '@/app/entity/entities'
import type { PricedChecklistItem } from './types'

export type { RosterSlot, PlacedRosterSlot, ChecklistCardView, PricedChecklistItem } from './types'

let nextId = 1

const SPECIALS: SpecialRef[] = [
  { id: nextId++, label: 'ZEUS', price: 130, sold: false },
  { id: nextId++, label: 'MEGA', price: 110, sold: false },
  { id: nextId++, label: 'HERA', price: 95, sold: false },
  { id: nextId++, label: 'ARES', price: 80, sold: false },
  { id: nextId++, label: 'NIKE', price: 65, sold: false },
]

const TEAM_NAMES: readonly string[] = [
  'Dallas Cowboys',
  'Kansas City Chiefs',
  'Philadelphia Eagles',
  'San Francisco 49ers',
  'Buffalo Bills',
  'Cincinnati Bengals',
  'Miami Dolphins',
  'Baltimore Ravens',
  'Green Bay Packers',
  'Detroit Lions',
  'Houston Texans',
  'Los Angeles Chargers',
  'Minnesota Vikings',
  'Pittsburgh Steelers',
  'Cleveland Browns',
  'Indianapolis Colts',
  'Tampa Bay Buccaneers',
  'New Orleans Saints',
  'Arizona Cardinals',
  'Carolina Panthers',
  'Jacksonville Jaguars',
  'Los Angeles Rams',
  'New York Giants',
  'New York Jets',
  'Tennessee Titans',
  'Washington Commanders',
  // Absent from MOCK_TEAM_TOTALS entirely -> no series data -> regular/default.
  'Seattle Seahawks',
  'Denver Broncos',
  'Las Vegas Raiders',
  'Chicago Bears',
  'Atlanta Falcons',
  'New England Patriots',
]

/** Stand-in for `widget_board_price_ranges_list`. Deliberately not the fallback constants, so resolveThresholds is exercised for real. */
const MOCK_PRICE_RANGES: PriceRange[] = [
  { id: 1, channel_id: 1, tier_id: 'best', price_from: 650 },
  { id: 2, channel_id: 1, tier_id: 'good', price_from: 400 },
  { id: 3, channel_id: 1, tier_id: 'mid', price_from: 75 },
]

/** Stand-in for `Series.default_price`. */
const MOCK_DEFAULT_PRICE = '$120-$349'

/** Stand-in for `GET /api/series/{id}/prices`. */
const MOCK_TEAM_TOTALS: SeriesTeamTotal[] = [
  // Best (total >= 650): 4 teams, so bestCount = max(3, 4) = 4.
  { team: 'Dallas Cowboys', total_price: 920, price_left: 310 },
  { team: 'Kansas City Chiefs', total_price: 840, price_left: 275 },
  { team: 'Philadelphia Eagles', total_price: 760, price_left: 150 },
  { team: 'San Francisco 49ers', total_price: 680, price_left: 95 },
  // Good (total >= 400, ranked 5th-9th): 5 teams, so goodCount = max(4, 5) = 5.
  { team: 'Buffalo Bills', total_price: 600, price_left: 86 }, // -> $100 (25-round-up case)
  { team: 'Cincinnati Bengals', total_price: 560, price_left: 220 },
  { team: 'Miami Dolphins', total_price: 520, price_left: 0 }, // -> forced regular/default
  { team: 'Baltimore Ravens', total_price: 480, price_left: 140 },
  { team: 'Green Bay Packers', total_price: 410, price_left: 95 },
  // Mid (total >= 75, ranked 10th+): 3 teams.
  { team: 'Detroit Lions', total_price: 200, price_left: 90 },
  { team: 'Houston Texans', total_price: 150, price_left: 60 },
  { team: 'Los Angeles Chargers', total_price: 90, price_left: 40 },
  // Has price data, but total < mid threshold -> regular/default (still ranks by price_left).
  { team: 'Minnesota Vikings', total_price: 60, price_left: 30 },
  { team: 'Pittsburgh Steelers', total_price: 40, price_left: 15 },
  { team: 'Cleveland Browns', total_price: 50, price_left: 25 },
  { team: 'Indianapolis Colts', total_price: 45, price_left: 20 },
  { team: 'Tampa Bay Buccaneers', total_price: 35, price_left: 18 },
  { team: 'New Orleans Saints', total_price: 30, price_left: 12 },
  { team: 'Arizona Cardinals', total_price: 25, price_left: 10 },
  { team: 'Carolina Panthers', total_price: 20, price_left: 8 },
  { team: 'Jacksonville Jaguars', total_price: 15, price_left: 6 },
  { team: 'Los Angeles Rams', total_price: 10, price_left: 5 },
  { team: 'New York Giants', total_price: 8, price_left: 4 },
  { team: 'New York Jets', total_price: 5, price_left: 2 },
  { team: 'Tennessee Titans', total_price: 3, price_left: 1 },
  { team: 'Washington Commanders', total_price: 1, price_left: 1 },
]

/** 6 sold slots, spread across tiers (good/mid/regular-with-data/no-data) for visual variety. */
const SOLD_TEAMS = new Set([
  'Cincinnati Bengals',
  'Detroit Lions',
  'Los Angeles Chargers',
  'Cleveland Browns',
  'Arizona Cardinals',
  'Seattle Seahawks',
])

const TEAMS: TeamRef[] = TEAM_NAMES.map((team) => ({
  id: nextId++,
  team,
  sold: SOLD_TEAMS.has(team),
}))

/**
 * Also reused for the mock checklist's row-bucketing (useCompositeData.ts) —
 * "one tier system across the overlay" applies in mock mode too, so the
 * checklist buckets against the exact same best/good thresholds (650/400)
 * the board mock uses, not a separate invented pair.
 */
export const CHECKLIST_THRESHOLDS = resolveThresholds(MOCK_PRICE_RANGES)

/** 32 NFL teams + 5 special spots = 37, matching board.ts's 38-cell route (1 spare). */
export const PLACED_ROSTER = composeRoster(
  SPECIALS,
  TEAMS,
  MOCK_TEAM_TOTALS,
  MOCK_DEFAULT_PRICE,
  CHECKLIST_THRESHOLDS,
)

// ---------------------------------------------------------------------------
// Mock widget / divider / checklist data — the `?mock=1` bundle. See
// useCompositeData.ts for the real fetches these stand in for.
// ---------------------------------------------------------------------------

export const STASH_OR_PASS_VALUE = '$15'
export const SPIN2_CHOOSE1_VALUE = '$25'
export const SERIES_LABEL = 'SERIES #1'
export const BOXES_LABEL = '3 BOXES'
export const COUNT_LABEL = '12 OF 148'

/**
 * 11 placeholder checklist cards (no url -> BoardTile-style placeholder box,
 * per stage 1), priced to exercise all three row buckets against
 * CHECKLIST_THRESHOLDS (best 650 / good 400):
 *   - 2 cards >= 650  -> row 1, a SHORT row (only 2 of 3 slots filled)
 *   - 4 cards 400-649 -> row 2, pages 2 windows (ceil(4/3) = 2)
 *   - 5 cards < 400    -> row 3, also pages 2 windows (ceil(5/3) = 2)
 * 11 total keeps auto-paging visibly active (max row page count = 2).
 */
export const CHECKLIST_ITEMS: PricedChecklistItem[] = [
  { id: 1, price: 900 },
  { id: 2, price: 750 },
  { id: 3, price: 620 },
  { id: 4, price: 550 },
  { id: 5, price: 480 },
  { id: 6, price: 410 },
  { id: 7, price: 300 },
  { id: 8, price: 250 },
  { id: 9, price: 180 },
  { id: 10, price: 120 },
  { id: 11, price: 60 },
]
