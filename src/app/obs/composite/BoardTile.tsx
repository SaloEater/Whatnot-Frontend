import { COLOR, FONT, FRAME, LAYOUT, MOTION, TYPE } from './tokens'
import { boardPriceLayout } from './pricing'
import type { Tier } from './board'
import type { PlacedRosterSlot } from './roster'

/**
 * Vivid tier colours — the /obs/prices/[id] neon palette (its --neon
 * variables for best/good/mid), NOT the overlay's muted FRAME metals. The
 * tile's tier BAR was removed; the colour survives as the tile's glow, which
 * should read unmistakably gold/silver/bronze from across a stream.
 *
 * Exported: ResultTile.tsx reuses these for the results screen's tier glow,
 * so the two boards can't drift to different neon palettes.
 */
export const TIER_BAR_COLOR: Record<Tier, string> = {
  gold: '#ffd700',
  silver: '#f5f5f5',
  bronze: '#cd6f19',
  grey: '#909090', // unused — regular tiles don't glow
}

/**
 * One board tile, positioned on the board grid by its route cell.
 * `tileRef` exposes the root element so the Board's Zuma FLIP can slide it
 * with a transform when its cell changes (grid placement is never animated).
 *
 * Vertical anatomy (live tiles): the logo in the flexible middle and the
 * price sitting 2px off the bottom border — no tier bar; tier reads from
 * the border colour and the glow alone.
 */
/** Sweep time for one sheen pass — the token period's duty-cycle slice (9s * 0.18 ≈ 1.6s). */
const SHEEN_SWEEP_S = parseFloat(MOTION.sheen.period) * MOTION.sheen.dutyCycle

export function BoardTile({
  slot,
  tileRef,
  sheenEpoch,
  preFlip,
}: {
  slot: PlacedRosterSlot
  tileRef?: (el: HTMLDivElement | null) => void
  /** When set, run ONE sheen sweep; a new value re-triggers (key remount). */
  sheenEpoch?: number
  /** Newly-sold tile mid-choreography: keep showing the FACE until the flip's midpoint. */
  preFlip?: boolean
}) {
  const [row, col] = slot.cell
  // A newly-sold tile keeps its available look until the flip's edge-on
  // midpoint — the blank appears THROUGH the flip, never before it.
  const displaySold = slot.sold && !preFlip
  // Sold tiles are uniform: no tier-related frame — every taken card looks
  // the same (neutral hairline + blank plate), the medal only marks the live.
  const borderColor = displaySold ? COLOR.ivory20 : FRAME[slot.tier]

  // Available tiles share the sold plates' blank fill (cellaLift) — one
  // consistent plate colour across the whole board.
  const background = COLOR.cellaLift

  // Special spots are visually identical to team tiles — only the art
  // differs (the Miscellaneous mark instead of a team logo).
  const imageSrc = slot.special ? '/images/Miscellaneous.webp' : `/images/teams/${slot.label}.webp`
  // Regular (grey) teams show their price at HALF size and always on ONE
  // line (at half size a full range fits the tile) — the medal tiers keep
  // the full-size price with the range split, so value stands out where it
  // matters. Rejoining the layout's lines undoes its range split without
  // duplicating the "$100-$299" -> "$100-299" normalization.
  const priceLayout = boardPriceLayout(slot.displayPrice ?? `$${slot.price}`, TYPE.price)
  const isRegular = slot.tier === 'grey'
  const lines = isRegular ? [priceLayout.lines.join('')] : priceLayout.lines
  const fontSize = isRegular ? TYPE.price * 0.75 : priceLayout.fontSize

  // Tiered (gold/silver/bronze) AVAILABLE tiles glow in their vivid tier
  // colour — the /obs/prices neon-glow treatment (outer + inset). STATIC
  // box-shadow only; animating it would force per-frame repaints.
  const glowColor = !displaySold && slot.tier !== 'grey' ? TIER_BAR_COLOR[slot.tier] : null
  const glow = glowColor
    ? `0 0 6px ${glowColor}, 0 0 14px ${glowColor}, inset 0 0 6px ${glowColor}`
    : undefined

  return (
    <div
      ref={tileRef}
      style={{
        gridRow: row,
        gridColumn: col,
        width: LAYOUT.board.tileWidth,
        height: LAYOUT.board.rowHeight,
        border: `2px solid ${borderColor}`,
        background,
        boxShadow: glow,
        // Available tiles fully opaque (nothing behind them — e.g. the route
        // string — may show through); sold plates recede at 0.5.
        opacity: displaySold ? 0.5 : 1,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* Sold: blank plate — the tier frame alone carries the tail. */}
      {displaySold ? null : (
        <>
          {/* Sheen (MOTION.sheen): a single specular sweep, fired by the
              Board's tier-weighted roll. Keyed by epoch so a re-roll of the
              same tile re-runs the animation; parks off-tile when done. */}
          {sheenEpoch != null && (
            <div
              key={sheenEpoch}
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: MOTION.sheen.gradient,
                transform: 'translateX(-100%)',
                animation: `tile-sheen-once ${SHEEN_SWEEP_S}s linear forwards`,
                pointerEvents: 'none',
                zIndex: 1,
              }}
              aria-hidden
            />
          )}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt={slot.label}
              style={{ width: 44, height: '100%', maxHeight: 44, objectFit: 'contain' }}
            />
          </div>
          <div
            style={{
              fontFamily: FONT.display,
              fontSize,
              fontWeight: FONT.weight.semibold,
              color: COLOR.ivory,
              lineHeight: 1,
              textAlign: 'center',
              marginBottom: 2,
              flexShrink: 0,
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
