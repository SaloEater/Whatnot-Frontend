'use client'

/**
 * Compact board (`/obs/composite/compact/[id]`) — a second OBS browser
 * source that reuses the composite overlay's frame (CompositeShell: bronze
 * frame border, top/bottom Greek-key bands) but skips the shell's opaque
 * cella ground (`transparent`) and ambient gear train (`gears={false}`),
 * replacing all inner content
 * with one thin strip: 5 fixed rows, a dynamic number of columns, one cell
 * per eligible break event — a tier-colored line, team logo, and customer
 * name laid out left-to-right on each row. See overlay-compact-plan.md for
 * the original brief (the vertical-cell/full-frame layout it describes was
 * superseded by this horizontal, 10%-20%-of-canvas iteration).
 *
 * A SEPARATE route from the live overlay ([id]/page.tsx) — same shell, same
 * data sources (useCompositeSources, shared via useCompactData), but no
 * board route/Zuma machinery, no checklist, no widgets: this page is a
 * ledger of the break — teams first then specials, alphabetical within each
 * group — not a price-ranked route.
 */
import './page.css'
import { CANVAS, COLOR, FONT, LAYOUT, SPACE, TYPE } from '@/app/obs/composite/tokens'
import { CompositeShell } from '@/app/obs/composite/CompositeShell'
import { TIER_BAR_COLOR } from '@/app/obs/composite/BoardTile'
import { useCompactData, type CompactCell } from '../useCompactData'

// ---------------------------------------------------------------------------
// Geometry — derived from the CANVAS token, not hand-typed. The board is now
// a thin strip pinned to a fixed band of the canvas (12.5%-22.5% of its
// height) rather than filling the space between the frame's meander bands.
// ---------------------------------------------------------------------------

/** 12.5% of canvas height (1920 * 0.125 = 240). */
const COMPACT_TOP = CANVAS.height * 0.125
/** The strip keeps its original 10%-of-canvas height (192), just shifted down — bottom lands at 22.5%. */
const BOARD_HEIGHT = CANVAS.height * 0.1

/** Row/column gap = the shared grid-gap token, same as the main board's tile grid. Also the board's own edge padding, so cells never touch its border. */
const GAP = SPACE.gridGap
const BOARD_PADDING = GAP

/** 5 fixed rows, stretched to fill the board's INNER height (outside the padding) exactly. */
const ROWS = 5
const INNER_HEIGHT = BOARD_HEIGHT - 2 * BOARD_PADDING
const ROW_HEIGHT = (INNER_HEIGHT - (ROWS - 1) * GAP) / ROWS
/** Inner width available to the grid — DELIBERATELY still the content column
 * (not the backing's full-bleed canvas width): the backing claims the screen
 * edges, the grid itself keeps its size and centers over it. */
const INNER_WIDTH = LAYOUT.contentWidth - 2 * BOARD_PADDING

/** A nearly-empty break (few columns) is capped so cells don't render absurdly wide. */
const MAX_CELL_WIDTH = 280

/** Tier line: 6px, full cell height, pinned to the left edge. */
const TIER_LINE_WIDTH = 6
/** Gap between the tier line and the logo, and left/right cell padding. */
const CELL_PAD_LEFT = TIER_LINE_WIDTH + 6
const CELL_PAD_RIGHT = 8
/** Gap between the logo and the customer name. */
const LOGO_NAME_GAP = 8
/** A couple px of vertical breathing room around the square logo, off the ~30px row height. */
const LOGO_INSET = 4

function CompactCellView({ cell, cellWidth }: { cell: CompactCell; cellWidth: number }) {
  const { label, special, customer, sold, tier } = cell
  const imageSrc = special ? '/images/Miscellaneous.webp' : `/images/teams/${label}.webp`
  const logoSize = ROW_HEIGHT - LOGO_INSET
  // The row is only ~30px tall (ROW_HEIGHT) — nowhere near TYPE.price/
  // TYPE.floor (36), the canvas-wide legibility floor. This page
  // deliberately goes below that floor: the user-requested 10%-of-canvas
  // strip cannot hold 36px text at any column count, so the name shrinks to
  // fit its row instead (still capped at TYPE.price for a break so short it
  // never gets this small), then scaled by a further 0.75 so the name reads
  // as secondary to the logo.
  const nameFontSize = Math.min(ROW_HEIGHT - 6, TYPE.price) * 0.75

  return (
    <div
      style={{
        position: 'relative',
        // Sized by the row's flex layout now (the old CSS grid sized cells
        // via gridAutoColumns) — fixed width, no shrink.
        width: cellWidth,
        flexShrink: 0,
        background: COLOR.plate,
        // 2px reads as too heavy at this scale — a hairline instead.
        border: `1px solid ${COLOR.ivory20}`,
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: CELL_PAD_LEFT,
        paddingRight: CELL_PAD_RIGHT,
      }}
    >
      {/* Left-edge tier line — unlike the main board, grey DOES get a line
          here: it's the only tier signal in the cell. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: TIER_LINE_WIDTH,
          background: TIER_BAR_COLOR[tier],
          opacity: sold ? 1 : 0.5,
        }}
        aria-hidden
      />
      {/* Square logo, sized off the row height — the row is the only
          dimension a horizontal cell can size it against. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageSrc}
        alt={label}
        style={{
          height: logoSize,
          width: 'auto',
          objectFit: 'contain',
          flexShrink: 0,
          marginRight: LOGO_NAME_GAP,
          opacity: sold ? 1 : 0.5,
        }}
      />
      {/* Customer name, same row as the logo — a horizontal layout has
          nothing for the name to reflow (the logo is anchored left), so
          unlike the old vertical cell there's no reserved-height machinery:
          it simply doesn't render while unsold. */}
      {sold && (
        <span
          style={{
            fontFamily: FONT.display,
            fontWeight: FONT.weight.semibold,
            fontSize: nameFontSize,
            color: COLOR.ivory,
            textTransform: 'uppercase',
            lineHeight: 1,
            whiteSpace: 'nowrap',
            // Hard clip, no `…`: every px of the narrow cell goes to actual
            // letters — a partially visible last letter beats losing ~2
            // characters to an ellipsis.
            textOverflow: 'clip',
            overflow: 'hidden',
            // minWidth: 0 is required for a flex child to actually shrink
            // and clip instead of overflowing its row.
            flex: '1 1 auto',
            minWidth: 0,
            textAlign: 'left',
          }}
        >
          {customer}
        </span>
      )}
    </div>
  )
}

function CompactBoard({ cells }: { cells: CompactCell[] }) {
  const cols = Math.max(1, Math.ceil(cells.length / ROWS))
  const rawCellWidth = (INNER_WIDTH - (cols - 1) * GAP) / cols
  const cellWidth = Math.min(rawCellWidth, MAX_CELL_WIDTH)

  // ROW-MAJOR fill: reading order runs left-to-right across a row, then down
  // to the next — row i holds cells [i*cols, (i+1)*cols). Rendered as five
  // fixed-height flex rows (not a CSS grid) because the LOWEST occupied row
  // is usually partial and must CENTER — grid auto-placement can only
  // left-align a partial row. Every row centers; full rows are all the same
  // width, so only the partial one visibly differs. (Order is alphabetical
  // per useCompactData, so an event added mid-break inserts in place and
  // shifts the cells after it — static paint, no animation, so it just
  // re-renders.)
  const rows = Array.from({ length: ROWS }, (_, i) => cells.slice(i * cols, (i + 1) * cols))

  return (
    <>
    {/* Backing: ONE full-bleed fill from the very top of the canvas down
        through the board's bottom edge — header gap, top-corner gaps and the
        board band all in a single slab. zIndex 0 keeps it UNDER the shell's
        frame border and ornament bands (zIndex 1), so the bronze chrome
        draws over the fill instead of being buried by it; only the grid
        itself (zIndex 2, content column, never reaching the frame) sits
        above. */}
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: CANVAS.width,
        height: COMPACT_TOP + BOARD_HEIGHT,
        background: COLOR.cella,
        zIndex: 0,
        pointerEvents: 'none',
      }}
      aria-hidden
    />
    <div
      style={{
        position: 'absolute',
        top: COMPACT_TOP,
        // The grid container is back to the content column — its opaque
        // backing moved to the full-bleed slab above (zIndex 0), so this
        // layer carries ONLY cells and never overlaps the frame border.
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        height: BOARD_HEIGHT,
        zIndex: 2,
        padding: BOARD_PADDING,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: GAP,
      }}
    >
      {/* Loading/empty: cells is simply [] — five empty (but still backed)
          rows inside an intact frame, no crash. Empty rows keep their fixed
          height so occupied rows never re-center vertically as cells land. */}
      {rows.map((rowCells, i) => (
        <div
          key={i}
          style={{
            height: ROW_HEIGHT,
            display: 'flex',
            gap: GAP,
            justifyContent: 'center',
          }}
        >
          {rowCells.map((cell) => (
            <CompactCellView key={cell.id} cell={cell} cellWidth={cellWidth} />
          ))}
        </div>
      ))}
    </div>
    </>
  )
}

export default function Page({ params }: { params: { id: string } }) {
  const channelId = parseInt(params.id)
  const { cells } = useCompactData(channelId)

  return (
    <CompositeShell transparent gears={false}>
      <CompactBoard cells={cells} />
    </CompositeShell>
  )
}
