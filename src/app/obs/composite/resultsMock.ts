/**
 * Hardcoded mock for the results screen (figure 1f), used two ways:
 *   - stage-1 static shell development (must match figure 1f before any data
 *     is wired), and
 *   - the `?mock=1` escape hatch useResultsData.ts documents, kept around for
 *     testing/demoing this screen without a closed break to point it at.
 *
 * 37 entries — matching the LIVE roster shape (board.ts's LIVE_BOARD_SLOTS:
 * 32 NFL teams + 5 special spots), not the results grid's 40 *capacity*
 * (Decision D1 in overlay-1f-plan.md: trailing cells simply stay empty). 37
 * also exercises the centered-last-row behaviour: 9 full rows of 4 plus a
 * 1-tile last row that must center, not left-align.
 *
 * `team` on every entry is the raw `event.team` label ResultTile.tsx reads:
 *   - The 32 real teams are the EXACT strings `common/teams.ts`'s `Teams`
 *     array uses (verified 1:1 against the filenames under
 *     `public/images/teams/*.webp` — `IsTeam()` and the team-image `<img>`
 *     src must resolve the same string).
 *   - The 5 non-team spots use "Chaser 1".."Chaser 5" — getSpotAbbreviation()
 *     turns these into "C1".."C5", the same shape customSpotComponent.tsx
 *     produces for the live board's custom spots.
 *
 * Handles are realistic Whatnot-style buyer names (lowercase, no spaces). A
 * couple run well past the tile's ~12-character comfortable width (results.ts
 * itself notes "onecardaway" already needs the ellipsis) to keep exercising
 * ResultTile's `nowrap + overflow:hidden + text-overflow:ellipsis` —
 * "cardboardconnoisseur" (20 chars), "jerseynumbercollector" (21 chars).
 *
 * TIER ASSIGNMENT (see results.ts's composeResults()): tiers no longer come
 * from `Event.price` — there is no `price` field on `ResultEntry` at all
 * anymore. Instead this mock supplies the SAME price data shape
 * useCompositeData.ts feeds the live board's BoardTile, so `?mock=1` runs
 * through the identical composeResults()/assignTiers() pipeline as real data:
 *   - RESULTS_MOCK_PRICE_RANGES / RESULTS_MOCK_THRESHOLDS — stand in for
 *     `widget_board_price_ranges_list`.
 *   - RESULTS_MOCK_DEFAULT_PRICE — stands in for `Series.default_price`.
 *   - RESULTS_MOCK_TEAM_PRICES — stands in for `GET /api/series/{id}/prices`.
 *     26 of the 32 teams carry real total_price/price_left data (the
 *     remaining 6 are absent -> no series data -> regular/grey, same
 *     "6 teams entirely absent" case roster.ts's mock exercises); one priced
 *     team (Miami Dolphins) has price_left = 0, forcing 'regular' despite a
 *     good-range total — the same "always regular when unsold is 0" rule
 *     composeResults()'s doc comment calls out.
 *   - TWO of the five "Chaser N" specials (Chaser 1, Chaser 3) ALSO get real
 *     price data — high enough to land gold and mid/bronze respectively —
 *     specifically to exercise the "a special with real data wears its
 *     earned medal" path. The other three Chaser specials have no price
 *     entry at all, so composeResults() pins them 'grey' regardless of
 *     whatever assignTiers would have computed for them.
 *
 * Deliberately NOT pre-sorted by price OR by the alphabetical display order
 * composeResults() now produces — composeResults() does both the tier pass
 * and the sort pass, and the mock should exercise that exact pipeline rather
 * than arrive pre-arranged.
 */
import type { PriceRange, SeriesTeamTotal } from '@/app/entity/entities'
import { resolveThresholds, type TierThresholds } from './pricing'
import type { ResultEntry } from './results'

export const RESULTS_MOCK_SERIES_LABEL = 'SERIES #1'

export const RESULTS_MOCK: ResultEntry[] = [
  { id: 1, buyer: 'cardvault_josh', team: 'Dallas Cowboys' },
  { id: 2, buyer: 'onecardaway', team: 'Kansas City Chiefs' },
  { id: 3, buyer: 'slabnation', team: 'Philadelphia Eagles' },
  { id: 4, buyer: 'mikeybreaks', team: 'San Francisco 49ers' },
  { id: 5, buyer: 'gridironguy23', team: 'Buffalo Bills' },
  { id: 6, buyer: 'thehobbybox', team: 'Cincinnati Bengals' },
  { id: 7, buyer: 'dallas_collector', team: 'Miami Dolphins' },
  { id: 8, buyer: 'patchandrelic', team: 'Baltimore Ravens' },
  { id: 9, buyer: 'autographaddict', team: 'Green Bay Packers' },
  { id: 10, buyer: 'boxbreakbeast', team: 'Detroit Lions' },
  { id: 11, buyer: 'cardsharkdan', team: 'Houston Texans' },
  { id: 12, buyer: 'teejaysports', team: 'Los Angeles Chargers' },
  { id: 13, buyer: 'graderguy99', team: 'Minnesota Vikings' },
  { id: 14, buyer: 'psagem10', team: 'Pittsburgh Steelers' },
  { id: 15, buyer: 'hoopsandcards', team: 'Cleveland Browns' },
  { id: 16, buyer: 'thecardcave', team: 'Indianapolis Colts' },
  { id: 17, buyer: 'slabcityslim', team: 'Tampa Bay Buccaneers' },
  { id: 18, buyer: 'mvpcollectibles', team: 'New Orleans Saints' },
  { id: 19, buyer: 'breaknight', team: 'Arizona Cardinals' },
  { id: 20, buyer: 'wax_wrapper', team: 'Carolina Panthers' },
  { id: 21, buyer: 'rcpatchhunter', team: 'Jacksonville Jaguars' },
  { id: 22, buyer: 'topshelfslabs', team: 'Los Angeles Rams' },
  { id: 23, buyer: 'cardboardconnoisseur', team: 'New York Giants' },
  { id: 24, buyer: 'thegoldenslab', team: 'New York Jets' },
  { id: 25, buyer: 'numbereddie', team: 'Tennessee Titans' },
  { id: 26, buyer: 'shieldbreaker', team: 'Washington Commanders' },
  { id: 27, buyer: 'relicreaper', team: 'Seattle Seahawks' },
  { id: 28, buyer: 'onehitwondercards', team: 'Denver Broncos' },
  { id: 29, buyer: 'gridcollector', team: 'Las Vegas Raiders' },
  { id: 30, buyer: 'spinthebreak', team: 'Chicago Bears' },
  { id: 31, buyer: 'cardbreakqueen', team: 'Atlanta Falcons' },
  { id: 32, buyer: 'patchcollectorpro', team: 'New England Patriots' },
  { id: 33, buyer: 'jerseynumbercollector', team: 'Chaser 1', special: true },
  { id: 34, buyer: 'slabstacksam', team: 'Chaser 2', special: true },
  { id: 35, buyer: 'footballfanatic22', team: 'Chaser 3', special: true },
  { id: 36, buyer: 'autopatchace', team: 'Chaser 4', special: true },
  { id: 37, buyer: 'hobbyboxhero', team: 'Chaser 5', special: true },
]

/** Stand-in for `widget_board_price_ranges_list`. Mirrors roster.ts's mock thresholds. */
export const RESULTS_MOCK_PRICE_RANGES: PriceRange[] = [
  { id: 1, channel_id: 1, tier_id: 'best', price_from: 650 },
  { id: 2, channel_id: 1, tier_id: 'good', price_from: 400 },
  { id: 3, channel_id: 1, tier_id: 'mid', price_from: 75 },
]

export const RESULTS_MOCK_THRESHOLDS: TierThresholds = resolveThresholds(RESULTS_MOCK_PRICE_RANGES)

/** Stand-in for `Series.default_price`. */
export const RESULTS_MOCK_DEFAULT_PRICE = '$120-$349'

/**
 * Stand-in for `GET /api/series/{seriesId}/prices`. Fed to assignTiers()
 * ALONGSIDE the Chaser specials' totals below — see composeResults() in
 * results.ts for why teams and specials share one tier pool.
 */
export const RESULTS_MOCK_TEAM_PRICES: SeriesTeamTotal[] = [
  // Best (total >= 650): Dallas/KC/Eagles/49ers + Chaser 1 (see below) -> 5 entries, bestCount = max(3, 5) = 5.
  { team: 'Dallas Cowboys', total_price: 920, price_left: 310 },
  { team: 'Kansas City Chiefs', total_price: 840, price_left: 275 },
  { team: 'Philadelphia Eagles', total_price: 760, price_left: 150 },
  { team: 'San Francisco 49ers', total_price: 680, price_left: 95 },
  // Good (total >= 400, ranked after the best band): 5 entries, goodCount = max(4, 5) = 5.
  { team: 'Buffalo Bills', total_price: 600, price_left: 86 },
  { team: 'Cincinnati Bengals', total_price: 560, price_left: 220 },
  { team: 'Miami Dolphins', total_price: 520, price_left: 0 }, // -> forced regular/grey despite a good-range total
  { team: 'Baltimore Ravens', total_price: 480, price_left: 140 },
  { team: 'Green Bay Packers', total_price: 410, price_left: 95 },
  // Mid (total >= 75, ranked after best+good): Detroit/Houston/Chaser 3/Chargers.
  { team: 'Detroit Lions', total_price: 200, price_left: 90 },
  { team: 'Houston Texans', total_price: 150, price_left: 60 },
  { team: 'Los Angeles Chargers', total_price: 90, price_left: 40 },
  // Has price data, but total < mid threshold -> regular/grey (still ranks by total among withPrice).
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
  // Seattle Seahawks, Denver Broncos, Las Vegas Raiders, Chicago Bears,
  // Atlanta Falcons, New England Patriots are absent entirely -> no series
  // data -> regular/grey via assignTiers' noPrice branch.

  // Two of the five "Chaser N" specials get real price data, to exercise
  // composeResults()'s "a special with real data wears its earned medal"
  // path — one lands gold, one lands mid/bronze, both through the SAME
  // assignTiers() ranking pass as the teams above (not a separate rule).
  // Chaser 2, 4, 5 have no entry here, so composeResults() pins them 'grey'.
  { team: 'Chaser 1', total_price: 700, price_left: 200 },
  { team: 'Chaser 3', total_price: 130, price_left: 55 },
]
