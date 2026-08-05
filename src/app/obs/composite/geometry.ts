/**
 * Derived pixel geometry for the composite overlay static shell.
 *
 * tokens.ts and board.ts are the source of truth for every number that is
 * defined there. This file DERIVES layout positions from them (plus the
 * mock-sourced margins below) — the camera portal rectangle in particular is
 * computed from the board grid, never hand-typed.
 *
 * VERTICAL RHYTHM — the fig4h mock (Overlay Wireframes.dc.html) lays the
 * stat row / board / divider / checklist out as a flex column with margins,
 * inside a root that itself has 24px padding. Absolutely-positioned children
 * (frame border, meander bands) ignore that padding and are positioned from
 * the true canvas edge; the flex children don't get that for free, so their
 * margins are folded in here as fixed offsets:
 *   root padding-top            24
 *   + stat row margin-top       40   -> STAT_ROW_TOP = 64
 *   + board margin-top          24
 *   + divider margin-top        24
 *   + divider margin-bottom     16   -> CHECKLIST_TOP = 889
 *   + checklist margin-bottom   44   (trailing space before root's own
 *                                     bottom padding; not used to position
 *                                     anything below it)
 * These margin values are not in tokens.ts (the mock never made it into a
 * token) — they're recorded as MOCK_MARGIN below, next to the geometry they
 * produce, rather than silently inlined.
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

export const STAT_ROW_HEIGHT = 113

export const STAT_ROW_TOP = MOCK_MARGIN.rootPadding + MOCK_MARGIN.statRowTop
export const BOARD_TOP = STAT_ROW_TOP + STAT_ROW_HEIGHT + MOCK_MARGIN.boardTop
export const DIVIDER_TOP = BOARD_TOP + LAYOUT.board.height + MOCK_MARGIN.dividerTop
export const CHECKLIST_TOP = DIVIDER_TOP + LAYOUT.divider.height + MOCK_MARGIN.dividerBottom
export const CHECKLIST_BOTTOM = CHECKLIST_TOP + LAYOUT.checklist.minHeight

/** Sanity total — should land near CANVAS.height (spec: "~1917 of 1920"). */
export const TOTAL_CONTENT_HEIGHT =
  CHECKLIST_BOTTOM + MOCK_MARGIN.checklistBottom + MOCK_MARGIN.rootPadding

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

/** Panel inner width available to the grid (contentWidth minus the panel's own borders). */
const PANEL_INNER_WIDTH = LAYOUT.contentWidth - 2 * LAYOUT.checklist.panelBorder

/**
 * Per-density-mode grid shape (see ChecklistMode in types.ts). Cards carry
 * no chrome (background/border/shadow removed at the render site), and the
 * horizontal card gap is PER MODE:
 *
 *   mode 12: 3 rows x 4 cols at 190 x 266, 10px card gap -> grid 790,
 *            NO price labels (showPrice: false) — the cell is just the
 *            card, stack 3 * 266 + 2*10 = 818.
 *   mode  6 (DEFAULT): 2 rows x 4 cols, width FIXED at 185. The card GAP is
 *            derived so the grid sits exactly CHECKLIST_EDGE_MARGIN (30)
 *            from the panel's inner side edges: (860 - 2*30 - 4*185) / 3
 *            = 20 -> grid 800. The 30px edge arrows overlap the outer
 *            cards by a few px, carousel-style (they float at z-index 3).
 *            Card HEIGHT is a FIXED 300 (box aspect 185:300 ≈ 1:1.62,
 *            close to a slab capture's ~1:1.7, so slabs nearly fill it;
 *            plain 5:7 cards letterbox slightly). Stack: 2 * (42 + 300)
 *            + 10 = 694, centered -> ~133px to the top/bottom edges.
 */
const MODE12_CARD_WIDTH = 190
const MODE6_CARD_WIDTH = 185
const MODE6_COLS = 4
const MODE6_ROWS = 2

/** Distance from the grid to the panel's edges (top/bottom outer, left/right inner). */
export const CHECKLIST_EDGE_MARGIN = 30

const MODE6_CARD_GAP =
  (PANEL_INNER_WIDTH - 2 * CHECKLIST_EDGE_MARGIN - MODE6_COLS * MODE6_CARD_WIDTH) / (MODE6_COLS - 1)

const MODE6_CARD_HEIGHT = 300

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
    showPrice: false,
  },
  6: {
    cols: MODE6_COLS,
    rows: MODE6_ROWS,
    cardWidth: MODE6_CARD_WIDTH,
    cardHeight: MODE6_CARD_HEIGHT,
    cardGap: MODE6_CARD_GAP,
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
