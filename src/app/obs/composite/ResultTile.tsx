'use client'

/**
 * One slot tile on the results screen (figure 1f) — team image or spot
 * label, buyer name, tier-coloured border.
 *
 * ICON REVISION: the original brief called for a generic aspis (shield)
 * glyph. Replaced to reuse the LIVE BOARD's actual tile-content conventions
 * (`/obs/[id]`'s eventComponent.tsx / customSpotComponent.tsx — already
 * mirrored once by the composite live overlay's BoardTile.tsx):
 *   - Real teams (`!special`): the SAME `/images/teams/{team}.webp` asset
 *     BoardTile.tsx already uses for the live board's team tiles (NOT
 *     eventComponent.tsx's `/images/new_teams/...png` + " BW" pair — this
 *     screen never needs a taken/available contrast, since every slot here
 *     is already sold; see the superseded note below for why that BW
 *     distinction doesn't apply). Always the one asset, no variants.
 *   - Non-team specials (`special`): customSpotComponent.tsx's text
 *     substitution, `getSpotAbbreviation(team)` ("Chaser 1" -> "C1"), not an
 *     image — same as the live board's custom spots. There are no logo
 *     assets for specials, so this is the only option, not a stylistic
 *     choice.
 *
 * UNIFORM TILE CHROME (supersedes overlay-1f-spec.md §4's "special spots use
 * HATCH" rule, by user decision): every tile — team or special — now shares
 * identical chrome: `COLOR.cellaLift` fill, the same border, the same
 * icon/label slot, the same buyer name treatment. The only content
 * difference between a team tile and a special tile is logo-vs-abbreviation;
 * nothing about background or border depends on `special` anymore. (HATCH
 * itself is untouched in tokens.ts — still used elsewhere, e.g. the live
 * board's BoardTile — this file simply no longer reaches for it.)
 *
 * TIER COLOURS THE FRAME ONLY (supersedes spec §4's "one currentColor drives
 * border, icon and name together" rule, by user decision): under that rule
 * grey-tier tiles rendered their whole content dim (FRAME.grey is 2.7:1 —
 * under tokens.ts's own ivory70 text floor) while gold tiles glowed, so tiles
 * varied in apparent brightness by tier. Now every tile's CONTENT is uniform
 * ivory — special-spot label and buyer name alike — and the tier colour
 * appears on the border alone. This is the exact fallback overlay-1f-plan.md
 * D4 prepared; the frame still carries the meaning figure 1d's gold "HIT"
 * star used to.
 *
 * D5 (overlay-1f-plan.md): an event with an empty `buyer` still occupies its
 * slot, but renders an em-dash in `COLOR.ivory70` — dimmer than a real name
 * on purpose, so "no handle recorded" doesn't read as just another buyer.
 */
import { useEffect, useMemo, useState } from 'react'
import { COLOR, FONT, FRAME, TYPE } from './tokens'
import { getSpotAbbreviation } from '@/app/common/spot_label'
import { TIER_BAR_COLOR } from './BoardTile'
import { RESULTS_LAYOUT, type PlacedResult } from './results'

const EM_DASH = '—'

/**
 * DYNAMIC NAME FIT (user revision): rather than always ellipsising, the
 * buyer name shrinks from TYPE.floor (36) down to MIN_NAME_FONT so the whole
 * handle fits the tile. This knowingly goes under the overlay's 36px
 * legibility floor — the user chose completeness over the floor for names;
 * boardPriceLayout (pricing.ts) already set the precedent by dropping range
 * prices to 28px. Below MIN_NAME_FONT (~6px apparent on a phone, where
 * smaller stops being readable at all) the ellipsis returns as the fallback.
 */
const MIN_NAME_FONT = 18

/**
 * Measured with a real canvas 2d context using the tile's actual font stack
 * — NOT estimated from character count, so wide handles ("mmmm...") and
 * narrow ones ("iiii...") both fit exactly. The fallback family is
 * metric-adjacent by design (tokens.ts FONT.display), so a measurement taken
 * before the webfont arrives is already close; useFontsReady() below
 * re-measures once it lands.
 */
let measureCtx: CanvasRenderingContext2D | null = null
function measureNameWidth(name: string, fontPx: number): number {
  if (typeof document === 'undefined') return name.length * fontPx * 0.45
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx) return name.length * fontPx * 0.45
  measureCtx.font = `${FONT.weight.regular} ${fontPx}px ${FONT.display}`
  return measureCtx.measureText(name).width
}

/** Largest font size in [MIN_NAME_FONT, TYPE.floor] at which `name` fits `maxWidth`. */
function fitNameFontSize(name: string, maxWidth: number): number {
  const widthAtFloor = measureNameWidth(name, TYPE.floor)
  if (widthAtFloor <= maxWidth) return TYPE.floor
  // Text width is linear in font size, so one measurement scales exactly.
  return Math.max(MIN_NAME_FONT, Math.floor(TYPE.floor * (maxWidth / widthAtFloor)))
}

/**
 * True once document.fonts has finished loading — the one moment name
 * measurements can change (Arial Narrow metrics -> Barlow Condensed
 * metrics). One state flip per tile, no polling.
 */
function useFontsReady(): boolean {
  const [ready, setReady] = useState(
    () => typeof document !== 'undefined' && document.fonts?.status === 'loaded',
  )
  useEffect(() => {
    if (ready || typeof document === 'undefined' || !document.fonts) return
    let mounted = true
    document.fonts.ready.then(() => {
      if (mounted) setReady(true)
    })
    return () => {
      mounted = false
    }
  }, [ready])
  return ready
}

export function ResultTile({ result }: { result: PlacedResult }) {
  const { tileWidth, tileHeight, tile } = RESULTS_LAYOUT
  const tierColor = FRAME[result.tier]
  const emptyBuyer = result.buyer === ''

  // Tiered (gold/silver/bronze) tiles glow in their vivid neon tier colour —
  // the same static outer + inset box-shadow treatment BoardTile.tsx gives
  // the live board's available tiles (and /obs/prices before it); grey tiles
  // stay glow-free so the ramp still recedes. STATIC box-shadow only —
  // animating it would force per-frame repaints (tokens.ts ANIMATABLE rule).
  const glowColor = result.tier !== 'grey' ? TIER_BAR_COLOR[result.tier] : null
  const glow = glowColor
    ? `0 0 6px ${glowColor}, 0 0 14px ${glowColor}, inset 0 0 6px ${glowColor}`
    : undefined

  // Usable width inside the borders, minus a little breathing room — derived
  // from tileWidth so any future resize carries through automatically.
  const nameMaxWidth = tileWidth - 2 * tile.borderWidth - 10
  const fontsReady = useFontsReady()
  const nameFontSize = useMemo(
    () => (emptyBuyer ? TYPE.floor : fitNameFontSize(result.buyer, nameMaxWidth)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fontsReady re-runs the measurement once the webfont's metrics land
    [emptyBuyer, result.buyer, nameMaxWidth, fontsReady],
  )

  return (
    <div
      style={{
        width: tileWidth,
        height: tileHeight,
        boxSizing: 'border-box',
        // Tier colours the frame ONLY — see the header note. Content below
        // is uniform ivory regardless of tier.
        border: `${tile.borderWidth}px solid ${tierColor}`,
        boxShadow: glow,
        // Uniform fill regardless of special/team — see the UNIFORM TILE
        // CHROME note above. No HATCH branch here anymore.
        background: COLOR.cellaLift,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: tile.gap,
      }}
    >
      {result.special ? (
        <div
          style={{
            fontFamily: FONT.display,
            fontWeight: FONT.weight.semibold,
            fontSize: tile.iconSize,
            lineHeight: 1,
            color: COLOR.ivory,
            textTransform: 'uppercase',
          }}
        >
          {getSpotAbbreviation(result.team)}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- same convention as BoardTile.tsx's team image
        <img
          src={`/images/teams/${result.team}.webp`}
          alt={result.team}
          style={{ width: tile.iconSize, height: tile.iconSize, objectFit: 'contain' }}
        />
      )}
      <span
        style={{
          fontFamily: FONT.display,
          fontWeight: FONT.weight.regular,
          // Shrinks below TYPE.floor to fit the whole handle — see the
          // DYNAMIC NAME FIT note above.
          fontSize: nameFontSize,
          lineHeight: 1,
          // D5: em-dash for a missing handle renders dimmer (ivory70) than a
          // real name so "no name recorded" doesn't read as a buyer.
          color: emptyBuyer ? COLOR.ivory70 : COLOR.ivory,
          // Never wraps (spec overlay-1f-spec.md §3): a two-line name breaks
          // the row rhythm and the tile height (results.ts) has no slack to absorb
          // a taller tile.
          // Ellipsis is now only the LAST-RESORT fallback for a name that
          // still overflows at MIN_NAME_FONT — most names fit whole via the
          // dynamic font size instead.
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: nameMaxWidth,
          textAlign: 'center',
        }}
      >
        {emptyBuyer ? EM_DASH : result.buyer}
      </span>
    </div>
  )
}
