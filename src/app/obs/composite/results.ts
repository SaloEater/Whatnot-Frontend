/**
 * Results screen (figure 1f) — shown after a break closes.
 *
 * Reports who took every slot, with a camera window at the foot so the breaker
 * stays on camera while the board is read out.
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
 * aesthetics.
 *
 * At 5 columns a tile is 166px wide with ~150px usable, and a realistic handle
 * ("onecardaway") runs about 176px at the 36px type floor — it overflows. Four
 * columns gives 210px tiles with ~194px usable, roughly twelve characters.
 * Longer names ellipsis; they must not wrap, because a two-line name breaks the
 * row rhythm and the height budget below has no slack for it.
 */
export const RESULTS_LAYOUT = {
  slots: 40,
  cols: 4,
  rows: 10,
  gap: SPACE.gridGap,
  /** (864 - 3*8) / 4 */
  tileWidth: 210,
  tileHeight: 112,
  /** 10*112 + 9*8 */
  gridHeight: 1192,

  title: {
    /** 26 pad + 64 + 12 gap + 36 = 138, rounded to 140. */
    height: 140,
    padTop: 26,
    headingSize: 64,
    subheadingSize: TYPE.label,
    gapBetween: 12,
  },

  /**
   * 864 x 492 is 1.76:1 — near enough 16:9 that a normally framed feed drops in
   * without cropping. Unlike the live overlay's portal this is a plain window at
   * the foot, not a hole punched through the board.
   */
  camera: { width: 864, height: 492 },

  /** Vertical gap above the grid and above the camera. */
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

/**
 * Height budget. Lands on exactly 1920 — there is no slack, so anything added
 * here must remove something else.
 *
 *   24   root padding (top)
 *   140  title band
 *   24   gap
 *   1192 grid
 *   24   gap
 *   492  camera
 *   24   root padding (bottom)
 *   ---- 1920
 */
export const RESULTS_HEIGHT_BUDGET = [
  SPACE.pagePad,
  RESULTS_LAYOUT.title.height,
  RESULTS_LAYOUT.blockGap,
  RESULTS_LAYOUT.gridHeight,
  RESULTS_LAYOUT.blockGap,
  RESULTS_LAYOUT.camera.height,
  SPACE.pagePad,
] as const

// ---------------------------------------------------------------------------
// Derived vertical stack — cumulative tops, computed from
// RESULTS_HEIGHT_BUDGET so the page never hand-adds offsets. Same pattern
// geometry.ts uses for the live overlay (STAT_ROW_TOP, BOARD_TOP, etc built
// from MOCK_MARGIN + LAYOUT instead of being retyped per component).
// ---------------------------------------------------------------------------

const [PAGE_PAD_TOP, TITLE_HEIGHT, GAP_ABOVE_GRID, GRID_HEIGHT, GAP_ABOVE_CAMERA] = RESULTS_HEIGHT_BUDGET

/** Top of the title band. Equal to the root's top padding — nothing above it. */
export const RESULTS_TITLE_TOP = PAGE_PAD_TOP

/** Top of the 4x10 slot grid. */
export const RESULTS_GRID_TOP = RESULTS_TITLE_TOP + TITLE_HEIGHT + GAP_ABOVE_GRID

/** Top of the camera window. Should land on 1404 per the spec's anatomy table. */
export const RESULTS_CAMERA_TOP = RESULTS_GRID_TOP + GRID_HEIGHT + GAP_ABOVE_CAMERA

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
 *    their label. This mirrors event_filter.ts's sortByTeamName
 *    (teams-alphabetical-then-specials) but additionally sorts the non-team
 *    group alphabetically among itself, which sortByTeamName does not do.
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
 * the grid overflows the canvas and the camera slides off the bottom edge,
 * which on a fixed stage just looks like a cropped page rather than an error.
 */
export function checkResultsGeometry(entryCount: number = RESULTS_LAYOUT.slots): string[] {
  const problems: string[] = []
  const { cols, rows, gap, tileWidth, tileHeight, gridHeight, slots } = RESULTS_LAYOUT

  const capacity = cols * rows
  if (capacity !== slots) {
    problems.push(`grid holds ${capacity} but RESULTS_LAYOUT.slots is ${slots}`)
  }
  if (entryCount > capacity) {
    problems.push(`${entryCount} entries exceed ${capacity} cells`)
  }

  const derivedWidth = cols * tileWidth + (cols - 1) * gap
  const contentWidth = CANVAS.width - 2 * SPACE.contentInset
  if (derivedWidth !== contentWidth) {
    problems.push(`grid width ${derivedWidth} !== content width ${contentWidth}`)
  }

  const derivedHeight = rows * tileHeight + (rows - 1) * gap
  if (derivedHeight !== gridHeight) {
    problems.push(`grid height ${derivedHeight} !== declared ${gridHeight}`)
  }

  const total = RESULTS_HEIGHT_BUDGET.reduce((a, b) => a + b, 0)
  if (total > CANVAS.height) {
    problems.push(`height budget ${total} overflows canvas ${CANVAS.height}`)
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
