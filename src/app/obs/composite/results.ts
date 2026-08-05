/**
 * Results screen (figure 1f) — shown after a break closes.
 *
 * Reports who took every slot. NOTE (user decision, supersedes spec §3): the
 * camera window that originally sat at the foot of this screen is REMOVED —
 * the page is just the title band and the slot grid, vertically centred as a
 * unit on the canvas. The freed height stays empty margin; the tiles were
 * simultaneously squeezed to 85% of their spec width, not grown to fill it.
 *
 * Deliberately NOT a second design system. It reuses:
 *   - palette, type and spacing from ./tokens
 *   - the pricing-derived medal ramp from ./pricing (assignTiers,
 *     PRICING_TIER_TO_FRAME) — see the TIER ASSIGNMENT note below.
 * A viewer who learned the frame colours during the break already knows how to
 * read this screen. That is the whole reason the gold star and the "HIT" badge
 * were removed — a badge would have been a second vocabulary for the same idea.
 *
 * TIER ASSIGNMENT — SUPERSEDES spec §5's "Slot price -> tier, ranked
 * client-side" BY USER DECISION. The original design ranked every event by
 * its own `Event.price` and cut gold/silver/bronze/grey at fixed rank
 * thresholds (board.ts's tierForRank/TIER_CUTS). That has been replaced with
 * the SAME pricing pass `/obs/prices/[id]` uses for its own tiles — the one
 * pricing.ts's assignTiers()/resolveThresholds() already mirror byte-for-byte,
 * and composeRoster.ts already demonstrates end-to-end for the live board's
 * BoardTile. This screen now runs that exact pattern (composeResults, below)
 * instead of a second, results-only tier rule.
 *
 * All values are CANVAS px on the same fixed 1080 x 1920 stage as the live
 * overlay. Scale once at the root; never use viewport units below it.
 */

import { CANVAS, SPACE, TYPE } from './tokens'
import type { Tier } from './board'
import { assignTiers, PRICING_TIER_TO_FRAME, type TeamCell, type TierThresholds } from './pricing'
import type { SeriesTeamTotal } from '@/app/entity/entities'

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/**
 * The grid is 4 x 10, and the column count is forced by the buyer name, not by
 * aesthetics: at 5 columns a realistic handle overflows the 36px type floor.
 * Longer names ellipsis; they must not wrap, because a two-line name breaks
 * the row rhythm.
 *
 * 85% SQUEEZE (user decision, supersedes the spec's 864px content column for
 * this screen): the grid occupies 736px — 4 x 178 + 3 x 8, which is ~85% of
 * the original 864 — centred horizontally (gridLeft 172 each side). Tiles
 * scaled on both axes to keep the aspect: 210x112 -> 178x95. Column count
 * stays 4; the resize is what keeps it 4. Content inside the tile does NOT
 * scale: the 44px logo matches BoardTile and the 36px buyer name is the
 * legibility floor and cannot shrink — 3 + 44 + 6 + 36 + 3 = 92 <= 95, so it
 * still fits, but the tile height has only 3px of slack left.
 */
export const RESULTS_LAYOUT = {
  slots: 40,
  cols: 4,
  rows: 10,
  gap: SPACE.gridGap,
  /** (736 - 3*8) / 4 */
  tileWidth: 178,
  /** 112 * (178/210), rounded — keeps the spec tile's aspect. */
  tileHeight: 95,
  /** 4*178 + 3*8 = ~85% of the spec's 864 content column. */
  gridWidth: 736,
  /** (1080 - 736) / 2 — grid centred on the canvas. */
  gridLeft: 172,
  /** 10*95 + 9*8 */
  gridHeight: 1022,

  title: {
    /** 26 pad + 64 + 12 gap + 36 = 138, rounded to 140. */
    height: 140,
    padTop: 26,
    headingSize: 64,
    subheadingSize: TYPE.label,
    gapBetween: 12,
  },

  /** Vertical gap between the title band and the grid. */
  blockGap: SPACE.lg,

  tile: {
    /**
     * Height/width of the team image (real teams) or font size of the
     * getSpotAbbreviation() label (non-team specials) — both occupy the same
     * slot above the buyer name, sized to match the composite live board's
     * own BoardTile.tsx convention (44x44 team image).
     */
    iconSize: 44,
    /** Between icon/label and buyer name. */
    gap: 6,
    borderWidth: 3,
  },
} as const

// ---------------------------------------------------------------------------
// Derived vertical stack.
//
// With the camera window removed (see the module comment) the spec's fixed
// zero-slack height budget is gone. The grid sits at a FIXED 20% of the
// canvas height (user revision — replaced the earlier vertical centring,
// which itself replaced the camera-anchored budget), and the title band
// hangs above it at blockGap distance. Static again: row count no longer
// moves anything.
// ---------------------------------------------------------------------------

/** Grid top: 20% of the canvas height. 1920 * 0.2 = 384. */
export const RESULTS_GRID_TOP = Math.round(CANVAS.height * 0.2)

/** Title band top — right above the grid's first row. 384 - 24 - 140 = 220. */
export const RESULTS_TITLE_TOP = RESULTS_GRID_TOP - RESULTS_LAYOUT.blockGap - RESULTS_LAYOUT.title.height

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export interface ResultEntry {
  /** Stable identity. */
  id: number
  /** Whatnot handle of whoever took the slot. */
  buyer: string
  /**
   * Raw `event.team` label. Drives the tile's content: a real team renders
   * `/images/teams/{team}.webp`; a non-team special renders
   * `getSpotAbbreviation(team)` instead (see ResultTile.tsx). Also the
   * composeResults() tier-pool key AND its display-order sort key (below).
   *
   * NOTE: `Event.price` is deliberately NOT carried here. It was the tier
   * input under the old rank-cut scheme; under composeResults() the tier
   * comes from series price data (SeriesTeamTotal[]) instead, exactly like
   * `/obs/prices/[id]` and the live board's BoardTile — the event's own sale
   * price plays no role in this screen at all (spec's "Showing prices" is
   * explicitly out of scope — see overlay-1f-plan.md §5).
   */
  team: string
  /** Special spots (ZEUS / HERA / ARES / NIKE / MEGA) render hatched. */
  special?: boolean
}

export interface PlacedResult extends ResultEntry {
  tier: Tier
}

/**
 * Assigns tiers and the display order in two independent passes, mirroring
 * composeRoster.ts's exact pattern for the live board:
 *
 * 1. TIER — feed `assignTiers` every label, teams AND specials TOGETHER
 *    (`entries.map(e => e.team)`), so the tier pool (bestCount/goodCount
 *    indices) matches `/obs/prices/[id]`, which also receives every event
 *    team including custom spots. A team always takes the pricing tier
 *    (`PRICING_TIER_TO_FRAME[cell.tier]`). A special whose label has REAL
 *    series price data (`total_price > 0` in `prices`) wears its earned
 *    medal the same way; a special WITHOUT price data is pinned 'grey' — a
 *    coincidental medal (assignTiers still returns a cell/tier for every
 *    name, priced or not) would fake price-tier meaning it never earned. Note
 *    the same asymmetry `/obs/prices/[id]` has: a team with real data but
 *    `price_left === 0` still lands 'regular' -> grey (assignTiers' own
 *    rule) — that is the intended semantic, not a bug to work around.
 *
 * 2. DISPLAY ORDER — a separate user decision that overrides the spec's
 *    original "reading order = price rank" default: real teams first,
 *    alphabetical by team name, then non-team specials, alphabetical by
 *    their label. Same ordering as event_filter.ts's sortByTeamName
 *    (teams-alphabetical-then-specials-alphabetical) — not reused directly
 *    only because that helper takes Event[] and this sorts PlacedResult,
 *    whose team/non-team split (`special`) is already computed upstream.
 *
 * `special` (already computed upstream via IsTeam — see useResultsData.ts)
 * is used as the team/non-team split instead of importing IsTeam/teams.ts
 * directly here: results.ts has no dependency on the team list otherwise,
 * and ResultEntry already carries the boolean IsTeam would recompute.
 */
export function composeResults(
  entries: readonly ResultEntry[],
  prices: readonly SeriesTeamTotal[],
  defaultPrice: string,
  thresholds: TierThresholds,
): PlacedResult[] {
  const allNames = entries.map((e) => e.team)
  const cells = assignTiers(allNames, prices, defaultPrice, thresholds)
  const cellByTeam = new Map<string, TeamCell>(cells.map((c) => [c.team, c]))
  /** Labels with REAL series price data (total > 0) — only these let a special earn a priced cell. */
  const pricedNames = new Set(prices.filter((p) => p.total_price > 0).map((p) => p.team))

  const tiered: PlacedResult[] = entries.map((e) => ({
    ...e,
    tier:
      e.special && !pricedNames.has(e.team)
        ? 'grey'
        : PRICING_TIER_TO_FRAME[cellByTeam.get(e.team)?.tier ?? 'regular'],
  }))

  return tiered.sort((a, b) => {
    if (!!a.special !== !!b.special) return a.special ? 1 : -1
    return a.team.localeCompare(b.team)
  })
}

// ---------------------------------------------------------------------------
// Self-check
// ---------------------------------------------------------------------------

/**
 * Run in a test and on mount in dev. The failure mode this catches is silent:
 * an inconsistent layout constant just renders as a subtly cropped or
 * off-centre page on the fixed stage rather than an error.
 */
export function checkResultsGeometry(entryCount: number = RESULTS_LAYOUT.slots): string[] {
  const problems: string[] = []
  const { cols, rows, gap, tileWidth, tileHeight, gridWidth, gridLeft, gridHeight, slots } = RESULTS_LAYOUT

  const capacity = cols * rows
  if (capacity !== slots) {
    problems.push(`grid holds ${capacity} but RESULTS_LAYOUT.slots is ${slots}`)
  }
  if (entryCount > capacity) {
    problems.push(`${entryCount} entries exceed ${capacity} cells`)
  }

  const derivedWidth = cols * tileWidth + (cols - 1) * gap
  if (derivedWidth !== gridWidth) {
    problems.push(`grid width ${derivedWidth} !== declared ${gridWidth}`)
  }
  if (2 * gridLeft + gridWidth !== CANVAS.width) {
    problems.push(`gridLeft ${gridLeft} does not centre width ${gridWidth} on canvas ${CANVAS.width}`)
  }

  const derivedHeight = rows * tileHeight + (rows - 1) * gap
  if (derivedHeight !== gridHeight) {
    problems.push(`grid height ${derivedHeight} !== declared ${gridHeight}`)
  }

  if (RESULTS_TITLE_TOP < SPACE.pagePad) {
    problems.push(`title top ${RESULTS_TITLE_TOP} rises above page padding ${SPACE.pagePad}`)
  }
  const gridBottom = RESULTS_GRID_TOP + gridHeight
  if (gridBottom > CANVAS.height - SPACE.pagePad) {
    problems.push(`grid bottom ${gridBottom} overflows canvas ${CANVAS.height} (minus padding)`)
  }

  return problems
}

/**
 * ⚠️ ROSTER SIZE MISMATCH — resolve before building.
 *
 * This screen is specified for 40 slots. The live board (board.ts) is built for
 * 37 — 32 NFL teams plus 5 special spots — on a 38-cell route. Both cannot be
 * right. If 40 is the real number, ROUTE_LEFT needs two more cells per chain
 * and the portal rectangle moves, because the portal is derived from the cells
 * the route does not visit.
 */
export const LIVE_BOARD_SLOTS = 37
export const RESULTS_SLOTS = RESULTS_LAYOUT.slots
