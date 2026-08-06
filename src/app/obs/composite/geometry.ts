/**
 * Derived pixel geometry for the composite overlay static shell.
 *
 * tokens.ts and board.ts are the source of truth for every number that is
 * defined there. This file DERIVES layout positions from them (plus the
 * mock-sourced margins below) — the camera portal rectangle in particular is
 * computed from the board grid, never hand-typed.
 *
 * VERTICAL RHYTHM — reworked from the fig4h mock's original order: both text
 * rows now sit at the TOP (header labels row, then the stash-or-pass divider
 * row directly under it), the board follows, and the checklist anchors to
 * the canvas BOTTOM at exactly 60% of its height. Top-down:
 *   top ornament band bottom (20 + 32)         -> HEADER_ROW_TOP = 52
 *   + header row 80 (12px gap absorbed)        -> DIVIDER_TOP    = 132
 *   + divider row 100 (margins folded in)      -> BOARD_TOP      = 232
 * and bottom-up:
 *   canvas 1920 - bottom ornament band (20 + 32)
 *   - checklist minHeight 1194                 -> CHECKLIST_TOP  = 674
 * CHECKLIST_TOP lands exactly on the board's bottom edge (232 + 442 = 674):
 * the checklist panel CONNECTS to the board with no gap (the overlap check
 * in checkLayoutGeometry keeps the two from drifting apart or into each
 * other). The mock's margin values are recorded as MOCK_MARGIN below rather
 * than silently inlined.
 */
import { CANVAS, LAYOUT, SHELL, SPACE, TYPE } from './tokens'
import type { ChecklistMode } from './types'

/** Bronze frame border sits this far in from the canvas edge (mock line 59). */
export const FRAME_INSET = 12

export const MOCK_MARGIN = {
  rootPadding: 24,
  statRowTop: 40,
  boardTop: 24,
  dividerTop: 24,
  dividerBottom: 16,
  checklistBottom: 44,
} as const

// ---------------------------------------------------------------------------
// Vertical stack — top to bottom
// ---------------------------------------------------------------------------

/**
 * The header labels row CONNECTS to the top ornament band: its top edge sits
 * flush against the band's bottom (20 + 32 = 52), and its height absorbs the
 * old 12px gap (68 -> 80) so its bottom edge — and everything below — stays
 * put. Texts stay vertically centered in the taller row.
 */
export const HEADER_ROW_HEIGHT =
  MOCK_MARGIN.rootPadding + MOCK_MARGIN.statRowTop + 68 - (SHELL.frame.band.top + SHELL.frame.band.height)

/**
 * Divider (stash-or-pass) row height — the old divider strip plus ALL its
 * folded margins, including the board's top margin: the row's bottom edge
 * touches the board's top row of tiles (texts stay vertically centered).
 */
export const MID_ROW_HEIGHT =
  MOCK_MARGIN.dividerTop + LAYOUT.divider.height + MOCK_MARGIN.dividerBottom + MOCK_MARGIN.boardTop

export const HEADER_ROW_TOP = SHELL.frame.band.top + SHELL.frame.band.height
/** The divider row sits DIRECTLY under the header row (flush). */
export const DIVIDER_TOP = HEADER_ROW_TOP + HEADER_ROW_HEIGHT
/** The board starts flush against the divider row's bottom edge. */
export const BOARD_TOP = DIVIDER_TOP + MID_ROW_HEIGHT
/** Checklist anchors to the BOTTOM ORNAMENT band: its bottom edge sits flush against the band's top. */
export const CHECKLIST_TOP =
  CANVAS.height - SHELL.frame.band.bottom - SHELL.frame.band.height - LAYOUT.checklist.minHeight
export const CHECKLIST_BOTTOM = CHECKLIST_TOP + LAYOUT.checklist.minHeight

/** Sanity total — checklist bottom + the ornament band under it lands at exactly CANVAS.height. */
export const TOTAL_CONTENT_HEIGHT =
  CHECKLIST_BOTTOM + SHELL.frame.band.height + SHELL.frame.band.bottom

// ---------------------------------------------------------------------------
// Frame meander bands — absolutely positioned, independent of the flex flow
// above. Mock lines 61-69: left 24 / top 20 / bottom 20, width 1032, height 32.
// ---------------------------------------------------------------------------

export const FRAME_BAND_LEFT = SHELL.frame.band.left
export const FRAME_BAND_WIDTH = SHELL.frame.band.width
export const FRAME_BAND_HEIGHT = SHELL.frame.band.height
export const TOP_BAND_TOP = SHELL.frame.band.top
export const BOTTOM_BAND_TOP = CANVAS.height - SHELL.frame.band.bottom - SHELL.frame.band.height

// ---------------------------------------------------------------------------
// Camera portal: REMOVED — the board's full 8x5 grid holds 40 cards.
// (The LAYOUT.portal / SHELL.portal tokens remain for the results screen.)
// ---------------------------------------------------------------------------

/** Dev-only sanity check on the vertical stack. */
export function checkLayoutGeometry(): string[] {
  const problems: string[] = []
  if (TOTAL_CONTENT_HEIGHT > CANVAS.height) {
    problems.push(`content stack ${TOTAL_CONTENT_HEIGHT} exceeds canvas height ${CANVAS.height}`)
  }
  if (BOARD_TOP + LAYOUT.board.height > CHECKLIST_TOP) {
    problems.push(
      `board bottom ${BOARD_TOP + LAYOUT.board.height} overlaps checklist top ${CHECKLIST_TOP}`,
    )
  }
  return problems
}

// ---------------------------------------------------------------------------
// Checklist hover-zoom geometry
//
// The photos-board reference (channel/[id]/photos/page.tsx handleMouseEnter,
// lines 171-192) measures the card's on-screen rect via getBoundingClientRect
// and computes a translate/scale to center it in the 1080x1920 viewport. That
// doesn't work unmodified here: this page's canvas sits under a root
// `scale(var(--stage-scale))` transform, so getBoundingClientRect() returns
// SCREEN px while a `transform` on a card inside the stage operates in CANVAS
// px — copying the reference's dx/dy verbatim would be off by the stage
// scale factor.
//
// Rather than measure-and-divide-by-scale, this computes each card's CANVAS
// position directly from the checklist's own layout constants. Cards are
// arranged 180x252 at up to 3 columns x 3 rows, but which ROW a card lands
// in is now a tier-bucket position (see useChecklistPage in
// useCompositeData.ts) rather than a fixed grid slot — collapsing means a
// card's "row" is its VISUAL position after empty buckets are squeezed out,
// which the render code already knows (it's the array index of a non-empty
// bucket). Either way there's nothing to measure — every (row, col) slot's
// position is knowable in advance and can't drift out of sync with a DOM
// measurement.
// ---------------------------------------------------------------------------


/** Vertical gap between rows (used by the row stack AND the arrow columns, so arrows stay row-aligned). */
export const CHECKLIST_ROW_GAP = 10

/**
 * Per-density-mode grid shape (see ChecklistMode in types.ts). Cards carry
 * no chrome (background/border/shadow removed at the render site):
 *
 *   mode 12 (DEFAULT): 3 rows x 4 cols, 10px card gap, WITH price labels
 *            (showPrice: true — inherited from the removed mode 6).
 *
 * Mode 6 (2 rows x 4 cols at 185 x 300) was removed entirely.
 */
/** 190 grown 15% — card height follows proportionally (7:5 aspect below). */
const MODE12_CARD_WIDTH = 190 * 1.15

/** Distance from the grid to the panel's edges (top/bottom outer, left/right inner). */
export const CHECKLIST_EDGE_MARGIN = 30

export const CHECKLIST_MODE_LAYOUT: Record<
  ChecklistMode,
  { cols: number; rows: number; cardWidth: number; cardHeight: number; cardGap: number; showPrice: boolean }
> = {
  // Mode 0 packs ALL cards dynamically (photos-board style, sizes computed at
  // render from measured image aspects) — these grid numbers are placeholders
  // that no mode-0 code path reads.
  0: { cols: 0, rows: 1, cardWidth: 0, cardHeight: 0, cardGap: 10, showPrice: false },
  12: {
    cols: 4,
    rows: 3,
    cardWidth: MODE12_CARD_WIDTH,
    cardHeight: MODE12_CARD_WIDTH * (7 / 5),
    cardGap: 10,
    showPrice: true,
  },
}

/** Outer width of the card grid in a given mode. */
export function checklistGridWidth(mode: ChecklistMode): number {
  const { cols, cardWidth, cardGap } = CHECKLIST_MODE_LAYOUT[mode]
  return cols * cardWidth + (cols - 1) * cardGap
}

/** Left edge of the card grid in canvas px — the grid centers in the panel's full 864px width. */
export function checklistGridLeft(mode: ChecklistMode): number {
  return SPACE.contentInset + (LAYOUT.contentWidth - checklistGridWidth(mode)) / 2
}

/**
 * Height of one grid row = price label + its gap + the card. The label's
 * rendered box height is approximated as TYPE.price (the label uses
 * `line-height: 1`, which renders a couple px taller than the bare font size
 * in practice) — a few px of slack here is imperceptible for an animated
 * hover target, and avoids needing to measure the DOM.
 *
 * Exported so page.tsx's per-row arrows can reproduce this exact
 * label-spacer + card split, landing the arrow's vertical center on the
 * card's, not the row's overall (label-inclusive) center.
 */
export function checklistCellHeight(mode: ChecklistMode): number {
  const { cardHeight, showPrice } = CHECKLIST_MODE_LAYOUT[mode]
  return (showPrice ? TYPE.price + LAYOUT.checklist.labelGap : 0) + cardHeight
}

/**
 * Fixed height of the FULL row stack for a mode (all rows present). The
 * render side sets this as the row-stack container's height, so when tier
 * buckets collapse, the remaining rows still stack from a stable top edge
 * (blank space stays at the bottom) instead of re-centering on every
 * bucket change. For mode 6 this is exactly minHeight - 2 * 30 = 900, which
 * is what puts the stack 30px from the panel's outer edges once the panel's
 * flex centering places it (2 border + 20 padding + 8 flex margin = 30).
 */
export function checklistGridHeight(mode: ChecklistMode): number {
  const { rows } = CHECKLIST_MODE_LAYOUT[mode]
  return rows * checklistCellHeight(mode) + (rows - 1) * CHECKLIST_ROW_GAP
}

// NOTE: the constant-based hover-transform helpers (checklistCardCenter /
// checklistHoverTransform) were removed — the hover zoom measures the card's
// live DOM rect instead (see ChecklistCardTile.measureRect in page.tsx),
// which continuous row scrolling made mandatory: a drifting card's position
// is no longer knowable from layout constants.
