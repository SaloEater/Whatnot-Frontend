import { COLOR, FONT, FRAME, LAYOUT, TYPE } from './tokens'
import { boardPriceLayout } from './pricing'
import type { PlacedRosterSlot } from './roster'

/** One board tile, positioned on the board grid by its route cell. */
export function BoardTile({ slot }: { slot: PlacedRosterSlot }) {
  const [row, col] = slot.cell
  const borderColor = FRAME[slot.tier]

  const background = slot.sold ? COLOR.cellaLift : COLOR.ivory06

  // Special spots are visually identical to team tiles — only the art
  // differs (the Miscellaneous mark instead of a team logo).
  const imageSrc = slot.special ? '/images/Miscellaneous.webp' : `/images/teams/${slot.label}.webp`
  const { lines, fontSize } = boardPriceLayout(slot.displayPrice ?? `$${slot.price}`, TYPE.price)

  return (
    <div
      style={{
        gridRow: row,
        gridColumn: col,
        width: LAYOUT.board.tileWidth,
        height: LAYOUT.board.rowHeight,
        border: `2px solid ${borderColor}`,
        background,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Sold: blank plate — the tier frame alone carries the tail. */}
      {slot.sold ? null : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={slot.label}
            style={{ width: 44, height: 44, objectFit: 'contain' }}
          />
          <div
            style={{
              fontFamily: FONT.display,
              fontSize,
              fontWeight: FONT.weight.semibold,
              color: COLOR.ivory,
              lineHeight: 1,
              textAlign: 'center',
            }}
          >
            {lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
