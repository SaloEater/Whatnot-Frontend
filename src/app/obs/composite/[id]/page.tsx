'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import './page.css'
import { CANVAS, COLOR, FONT, LAYOUT, MOTION, SHELL, SPACE, TRACKING, TYPE } from '@/app/obs/composite/tokens'
import { ALL_CELLS, ROUTE_RUNS, isStaticIndex, validateDefault, type Tier } from '@/app/obs/composite/board'
import {
  BOARD_TOP,
  CHECKLIST_MODE_LAYOUT,
  CHECKLIST_TOP,
  DIVIDER_TOP,
  MOCK_MARGIN,
  CHECKLIST_ROW_GAP,
  checkLayoutGeometry,
  checklistCellHeight,
  checklistGridHeight,
  checklistGridWidth,
} from '@/app/obs/composite/geometry'
import { useCompositeData } from '@/app/obs/composite/useCompositeData'
import type { ChecklistCardView, ChecklistMode, ChecklistRowState, PlacedRosterSlot } from '@/app/obs/composite/types'
import { BoardTile } from '@/app/obs/composite/BoardTile'
import { CompositeShell } from '@/app/obs/composite/CompositeShell'
import { Chevron } from '@/app/obs/composite/Chevron'

/** TEMP: show the microfreeze indicator (spinning hand over the camera area). Set false to hide. */
const FREEZE_INDICATOR = false
const FREEZE_INDICATOR_RADIUS = 100

/**
 * Microfreeze diagnostic: a circle with a single hand rotating at constant
 * speed (2s per revolution), centered on the camera portal. Any dropped or
 * frozen frames in OBS read as visible jumps/stalls of the hand — much
 * easier to spot than judging the ambient layers.
 */
function FreezeIndicator() {
  // Centered on the canvas (the camera portal is gone).
  const cx = CANVAS.width / 2
  const cy = CANVAS.height / 2
  const r = FREEZE_INDICATOR_RADIUS
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - r,
        top: cy - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: '50%',
        border: `3px solid ${COLOR.ivory}`,
        zIndex: 3,
        pointerEvents: 'none',
      }}
      aria-hidden
    >
      {/* The hand: pivots at the circle's center, sweeps the full radius. */}
      <div
        style={{
          position: 'absolute',
          left: r - 2,
          top: r,
          width: 4,
          height: r - 6,
          background: COLOR.ivory,
          transformOrigin: 'top center',
          animation: 'indicator-spin 5s linear infinite',
        }}
      />
    </div>
  )
}

/** Shared height of the two segmented text rows (header + mid). */
const SEGMENTED_ROW_HEIGHT = 68

/**
 * The shared style of BOTH info rows: one full-width bar split into EQUAL
 * parts, each part holding only text, the parts divided by their own
 * left/right bronze borders. Plate fill for legibility over the gears; no
 * other chrome, no ornament.
 */
function SegmentedTextRow({
  cells,
  height = SEGMENTED_ROW_HEIGHT,
  borderTop = false,
}: {
  cells: React.ReactNode[]
  height?: number
  borderTop?: boolean
}) {
  return (
    <div
      style={{
        width: '100%',
        height,
        background: COLOR.plate,
        borderTop: borderTop ? `2px solid ${SHELL.statTile.borderColor}` : undefined,
        boxSizing: 'border-box',
        display: 'flex',
      }}
    >
      {cells.map((cell, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxSizing: 'border-box',
            // No cell borders — just a single separator line BETWEEN texts.
            ...(i > 0 ? { borderLeft: `2px solid ${SHELL.statTile.borderColor}` } : {}),
          }}
        >
          {cell}
        </div>
      ))}
    </div>
  )
}

/** Caption + value as inline TEXTS (the segmented rows carry no boxes), vertically centered on each other. */
function StatCellText({ caption, value }: { caption: string; value: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: SHELL.statTile.innerGap }}>
      <span
        style={{
          fontFamily: FONT.display,
          fontWeight: FONT.weight.regular,
          fontSize: TYPE.label,
          letterSpacing: TRACKING.caption,
          color: COLOR.ivory70,
          textTransform: 'uppercase',
          lineHeight: 1,
        }}
      >
        {caption}
      </span>
      <span
        style={{
          fontFamily: FONT.display,
          fontWeight: FONT.weight.semibold,
          fontSize: TYPE.value,
          color: COLOR.ivory,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </span>
  )
}

function InfoLabelText({
  text,
  tracking,
  numeric,
}: {
  text: string
  tracking: string
  numeric?: boolean
}) {
  return (
    <span
      style={{
        fontFamily: FONT.display,
        fontWeight: FONT.weight.regular,
        fontSize: TYPE.label,
        letterSpacing: tracking,
        color: COLOR.ivory70,
        textTransform: 'uppercase',
        fontVariantNumeric: numeric ? FONT.numeric : undefined,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </span>
  )
}

/**
 * TOP row (the former stat-row slot): the series info texts — swapped here
 * from the old divider row. Three equal parts.
 */
function HeaderLabelsRow({
  seriesLabel,
  boxesLabel,
  countLabel,
}: {
  seriesLabel: string
  boxesLabel: string
  countLabel: string
}) {
  return (
    <div
      style={{
        position: 'absolute',
        // Bottom edge flush against the board's top row of tiles.
        top: BOARD_TOP - SEGMENTED_ROW_HEIGHT,
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        height: SEGMENTED_ROW_HEIGHT,
        zIndex: 2,
      }}
    >
      <SegmentedTextRow
        cells={[
          <InfoLabelText key="series" text={seriesLabel} tracking={TRACKING.label} />,
          <InfoLabelText key="count" text={countLabel} tracking={TRACKING.numeric} numeric />,
          <InfoLabelText key="boxes" text={boxesLabel} tracking={TRACKING.metope} />,
        ]}
      />
    </div>
  )
}

/**
 * The Zuma advance (stage-3 STATE tier — MOTION.advance): when a sale frees a
 * cell, every tile behind it slides forward one cell as a ripple.
 *
 *   - THROTTLE, not per-sale twitch: the board renders a `displayed` roster
 *     that adopts the live placement at most once per MOTION.advance.debounce
 *     (2.5s) — a burst of sales inside the window resolves as ONE ripple.
 *     The tile's content flip (logo/price -> sold blank) rides the same
 *     adoption tick, so blanking and migration read as one event.
 *   - FLIP with NO DOM measurement: board cells are pure geometry, so the
 *     previous position per slot id is remembered as its CELL and the
 *     inverted delta is computed arithmetically. Applied as a transform,
 *     then released with the token transition (380ms, overshoot-and-settle
 *     ease) — grid placement itself is never animated.
 *   - Stagger by ROUTE distance, not pixels: delay = MOTION.advance.stagger x
 *     the tile's chain-index distance from the front of its chain's moved
 *     group. Chains are independent by construction (placeSlots
 *     half-stability), so a left sale ripples only the left chain.
 */
/** TEMP: slow-motion multiplier on the Zuma advance for examination. Set back to 1 for production speed. */
const ZUMA_SLOWMO = 3

/**
 * Sheen lottery — one tile at a time: roll the TIER first (weights below,
 * higher tier = higher chance), then a uniform pick among that tier's
 * AVAILABLE teams. Regular (grey) tiles never sheen. Empty tiers drop out of
 * the roll and their weight renormalizes across the rest.
 */
const SHEEN_TIER_WEIGHTS: ReadonlyArray<[Tier, number]> = [
  ['gold', 45],
  ['silver', 30],
  ['bronze', 25],
]
/** Random cooldown between sheens, milliseconds. */
const SHEEN_COOLDOWN_MIN_MS = 5000
const SHEEN_COOLDOWN_MAX_MS = 13000

function pickSheenTarget(slots: readonly PlacedRosterSlot[]): PlacedRosterSlot | null {
  const byTier = new Map<Tier, PlacedRosterSlot[]>()
  for (const s of slots) {
    if (s.sold) continue
    if (!byTier.has(s.tier)) byTier.set(s.tier, [])
    byTier.get(s.tier)!.push(s)
  }
  const candidates = SHEEN_TIER_WEIGHTS.filter(([tier]) => (byTier.get(tier)?.length ?? 0) > 0)
  if (candidates.length === 0) return null
  const total = candidates.reduce((sum, [, w]) => sum + w, 0)
  let roll = Math.random() * total
  for (const [tier, weight] of candidates) {
    roll -= weight
    if (roll <= 0) {
      const pool = byTier.get(tier)!
      return pool[Math.floor(Math.random() * pool.length)]
    }
  }
  return null
}

/**
 * The Zuma route made visible: ONE continuous red glowing line threaded
 * through the center of every route cell in order — a single polyline per
 * contiguous run (a seam, if the route ever has one, breaks the string
 * rather than cutting diagonally across the board). Rendered FIRST inside
 * the board grid with no z-index, so every plate and tile (each a stacking
 * context via its opacity) paints over it — the string runs BEHIND the cards
 * and only surfaces in the gaps between them. The glow is layered strokes
 * (wide translucent under a solid core), not a filter — static paint, no
 * per-frame cost.
 *
 * The string ends ON the LAST AVAILABLE card: live slots occupy route
 * positions 0..liveCount-1 (sold ones sort to the tail), so the polyline is
 * trimmed to the first `liveCount` route cells and never runs behind the
 * half-transparent sold plates or empty placeholders.
 */
function RouteConnectors({ liveCount }: { liveCount: number }) {
  const { tileWidth, rowHeight, gap } = LAYOUT.board
  const RED = '#ff2d2d'
  let remaining = Math.min(
    liveCount,
    ROUTE_RUNS.reduce((n, run) => n + run.length, 0),
  )
  const runs: string[] = []
  for (const run of ROUTE_RUNS) {
    if (remaining < 2) break
    const cells = run.slice(0, remaining)
    remaining -= cells.length
    if (cells.length < 2) continue
    runs.push(
      cells
        .map(([r, c]) => {
          const cx = (c - 1) * (tileWidth + gap) + tileWidth / 2
          const cy = (r - 1) * (rowHeight + gap) + rowHeight / 2
          return `${cx},${cy}`
        })
        .join(' '),
    )
  }
  return (
    <svg
      width={LAYOUT.contentWidth}
      height={LAYOUT.board.height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      aria-hidden
    >
      {runs.map((points, i) => (
        <g key={`route-run-${i}`} fill="none" strokeLinejoin="round" strokeLinecap="round">
          <polyline points={points} stroke={RED} strokeOpacity={0.25} strokeWidth={11} />
          <polyline points={points} stroke={RED} strokeOpacity={0.4} strokeWidth={6} />
          <polyline points={points} stroke={RED} strokeWidth={3} />
        </g>
      ))}
    </svg>
  )
}

function Board({ placedRoster }: { placedRoster: PlacedRosterSlot[] }) {
  const [displayed, setDisplayed] = useState<PlacedRosterSlot[]>(placedRoster)
  const lastAdoptedAtRef = useRef(0)
  const adoptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevCellsRef = useRef<Map<number, { row: number; col: number; routeIndex: number; sold: boolean }>>(
    new Map(),
  )
  const tileRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  // --- sheen lottery: one tile at a time on a 5-13s random cooldown ---
  const [sheen, setSheen] = useState<{ id: number; epoch: number } | null>(null)
  const displayedRef = useRef(displayed)
  useEffect(() => {
    displayedRef.current = displayed
  }, [displayed])
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let cancelled = false
    const schedule = () => {
      const delay =
        SHEEN_COOLDOWN_MIN_MS + Math.random() * (SHEEN_COOLDOWN_MAX_MS - SHEEN_COOLDOWN_MIN_MS)
      timer = setTimeout(() => {
        if (cancelled) return
        const target = pickSheenTarget(displayedRef.current)
        if (target) setSheen((prev) => ({ id: target.id, epoch: (prev?.epoch ?? 0) + 1 }))
        schedule()
      }, delay)
    }
    schedule()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    const adopt = (roster: PlacedRosterSlot[]) => {
      lastAdoptedAtRef.current = Date.now()
      setDisplayed(roster)
    }
    const sinceLast = Date.now() - lastAdoptedAtRef.current
    if (adoptTimerRef.current) {
      clearTimeout(adoptTimerRef.current)
      adoptTimerRef.current = null
    }
    if (sinceLast >= MOTION.advance.debounce) {
      adopt(placedRoster)
    } else {
      adoptTimerRef.current = setTimeout(() => {
        adoptTimerRef.current = null
        adopt(placedRoster)
      }, MOTION.advance.debounce - sinceLast)
    }
    return () => {
      if (adoptTimerRef.current) clearTimeout(adoptTimerRef.current)
    }
  }, [placedRoster])

  const soldTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([])
  // Newly-sold tiles keep their FACE (team content, tier frame, glow) through
  // the lift and the first half of the flip; at the flip's edge-on midpoint
  // the id leaves this set and the tile re-renders blank — the blank state
  // appears through the flip, never before it.
  const [preFlipIds, setPreFlipIds] = useState<Set<number>>(new Set())

  useLayoutEffect(() => {
    const duration = MOTION.advance.duration * ZUMA_SLOWMO
    const stagger = MOTION.advance.stagger * ZUMA_SLOWMO
    const liftMs = 200 * ZUMA_SLOWMO
    const flipMs = 400 * ZUMA_SLOWMO
    const colSpan = LAYOUT.board.tileWidth + LAYOUT.board.gap
    const rowSpan = LAYOUT.board.rowHeight + LAYOUT.board.gap

    // Choreography for a NEWLY-SOLD tile: (1) LIFT 15px off its cell,
    // (2) FLIP in place (rotateY 180 — the plate is already blank, so the
    // flip reads as the card turning face-down), (3) FLY to its tail cell,
    // keeping the residual 180 so the flight doesn't un-spin. The Zuma
    // ripple starts at the moment of the lift, as before — the queue slides
    // under the flipping/flying tile. Ripple delays count up the route from
    // the front of the moved group (the tile closest to the freed gap moves
    // first, then the wave runs down the whole route).
    const movedIndexes: number[] = []
    const moves: Array<{
      el: HTMLDivElement
      id: number
      dx: number
      dy: number
      routeIndex: number
      newlySold: boolean
    }> = []

    for (const slot of displayed) {
      const prev = prevCellsRef.current.get(slot.id)
      const [row, col] = slot.cell
      if (prev && (prev.row !== row || prev.col !== col)) {
        const el = tileRefs.current.get(slot.id)
        if (el) {
          // Moves touching the STATIC zone (cols 1/8 + (5,2)) are excluded
          // from the Zuma: the tile just re-renders at its new cell,
          // instantly — no inverted transform, no transition.
          const staticMove = isStaticIndex(slot.routeIndex) || isStaticIndex(prev.routeIndex)
          if (staticMove) {
            el.style.transition = 'none'
            el.style.transform = ''
            el.style.zIndex = ''
          } else {
            const newlySold = slot.sold && !prev.sold
            if (!newlySold) movedIndexes.push(slot.routeIndex)
            moves.push({
              el,
              id: slot.id,
              dx: (prev.col - col) * colSpan,
              dy: (prev.row - row) * rowSpan,
              routeIndex: slot.routeIndex,
              newlySold,
            })
          }
        }
      }
      prevCellsRef.current.set(slot.id, { row, col, routeIndex: slot.routeIndex, sold: slot.sold })
    }
    // Faces stay on through lift + half the flip (flushed before paint, so a
    // newly-sold tile never flashes blank). Resetting the whole set also
    // clears stale entries from an interrupted choreography.
    setPreFlipIds(new Set(moves.filter((m) => m.newlySold).map((m) => m.id)))
    // Forget slots that left the roster so a returning id doesn't animate from a stale cell.
    const liveIds = new Set(displayed.map((s) => s.id))
    for (const id of Array.from(prevCellsRef.current.keys())) {
      if (!liveIds.has(id)) prevCellsRef.current.delete(id)
    }
    if (moves.length === 0) return

    const gapFront = movedIndexes.length ? Math.min(...movedIndexes) : 0

    for (const m of moves) {
      m.el.style.transition = 'none'
      m.el.style.transform = `translate(${m.dx}px, ${m.dy}px)`
      // The departing sold tile flies OVER the tiles it passes (and over the
      // old tail occupant it briefly shares a cell with mid-choreography).
      m.el.style.zIndex = m.newlySold ? '3' : ''
    }
    // The ripple WAITS for the switched card: it starts when the sold tile
    // begins its flight (after lift + flip), not at the lift.
    const rippleBase = moves.some((m) => m.newlySold) ? liftMs + flipMs : 0

    // Double rAF: let the inverted position paint, then release each move.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        for (const m of moves) {
          if (!m.newlySold) {
            const delay = rippleBase + stagger * (m.routeIndex - gapFront)
            m.el.style.transition = `transform ${duration}ms ${MOTION.advance.ease} ${delay}ms`
            m.el.style.transform = ''
            continue
          }
          // Newly sold: lift -> flip (face swaps to blank at the edge-on
          // midpoint) -> fly (see choreography comment above).
          const lifted = `translate(${m.dx}px, ${m.dy - 15}px)`
          m.el.style.transition = `transform ${liftMs}ms ease-out`
          m.el.style.transform = lifted
          soldTimersRef.current.push(
            setTimeout(() => {
              m.el.style.transition = `transform ${flipMs}ms ease-in-out`
              m.el.style.transform = `${lifted} rotateY(180deg)`
            }, liftMs),
            setTimeout(() => {
              setPreFlipIds((prev) => {
                const next = new Set(prev)
                next.delete(m.id)
                return next
              })
            }, liftMs + flipMs / 2),
            setTimeout(() => {
              m.el.style.transition = `transform ${duration}ms ${MOTION.advance.ease}`
              m.el.style.transform = 'rotateY(180deg)'
            }, liftMs + flipMs),
            // Tidy up once landed: drop the residual rotation (invisible on a
            // blank plate) and the flight z-index.
            setTimeout(() => {
              m.el.style.transition = 'none'
              m.el.style.transform = ''
              m.el.style.zIndex = ''
            }, liftMs + flipMs + duration + 60),
          )
        }
      })
    })
    return () => {
      soldTimersRef.current.forEach(clearTimeout)
      soldTimersRef.current = []
    }
  }, [displayed])

  return (
    <div
      style={{
        position: 'absolute',
        top: BOARD_TOP,
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        height: LAYOUT.board.height,
        zIndex: 2,
        display: 'grid',
        gridTemplateColumns: `repeat(${LAYOUT.board.cols}, ${LAYOUT.board.tileWidth}px)`,
        gridTemplateRows: `repeat(${LAYOUT.board.rows}, ${LAYOUT.board.rowHeight}px)`,
        gap: LAYOUT.board.gap,
      }}
    >
      <RouteConnectors liveCount={displayed.filter((s) => !s.sold).length} />
      {/* Empty route cells get STATIC placeholder plates so the board always
          reads full. They are keyed by CELL, live outside the FLIP maps, and
          re-render in place as the queue shifts — they never animate, so
          they don't participate in the Zuma. Rendered first, so real tiles
          (and the flying sold tile) paint above them. */}
      {ALL_CELLS.filter(([row, col]) => !displayed.some((s) => s.cell[0] === row && s.cell[1] === col)).map(
        ([row, col]) => (
          <div
            key={`placeholder-${row}-${col}`}
            style={{
              gridRow: row,
              gridColumn: col,
              width: LAYOUT.board.tileWidth,
              height: LAYOUT.board.rowHeight,
              border: `2px solid ${COLOR.ivory20}`,
            opacity: 0.5,
              background: COLOR.cellaLift,
              boxSizing: 'border-box',
            }}
            aria-hidden
          />
        ),
      )}
      {/* Loading/empty: displayed is simply [] — the board is all placeholders, no crash. */}
      {displayed.map((s) => (
        <BoardTile
          key={s.id}
          slot={s}
          preFlip={preFlipIds.has(s.id)}
          sheenEpoch={sheen && sheen.id === s.id ? sheen.epoch : undefined}
          tileRef={(el) => {
            if (el) tileRefs.current.set(s.id, el)
            else tileRefs.current.delete(s.id)
          }}
        />
      ))}
    </div>
  )
}

/**
 * MID row (the former divider slot): the STASH OR PASS / SPIN 2 CHOOSE 1
 * stats — swapped here from the old top stat row. Two equal parts, same
 * segmented style as the header row. The bar spans the ENTIRE gap between
 * the board's bottom edge and the checklist panel's top edge
 * (dividerTop margin + strip + dividerBottom margin = 76px), touching the
 * board with a bronze border on that top side.
 */
const MID_ROW_HEIGHT = MOCK_MARGIN.dividerTop + LAYOUT.divider.height + MOCK_MARGIN.dividerBottom

function MidStatsRow({
  stashOrPassValue,
  spin2ChooseValue,
}: {
  stashOrPassValue: string
  spin2ChooseValue: string
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: DIVIDER_TOP,
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        height: LAYOUT.divider.height,
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          // Reach up through the divider-top margin to the board's bottom edge.
          top: -MOCK_MARGIN.dividerTop,
        }}
      >
        <SegmentedTextRow
          height={MID_ROW_HEIGHT}
          cells={[
            <StatCellText key="sop" caption="STASH OR PASS" value={stashOrPassValue} />,
            <StatCellText key="s2c1" caption="SPIN 2 CHOOSE 1" value={spin2ChooseValue} />,
          ]}
        />
      </div>
    </div>
  )
}

/**
 * Hover zoom mirrors src/app/channel/[id]/photos/page.tsx's
 * handleMouseEnter/handleMouseLeave (lines 171-206) and its hovered-card
 * render (lines 274-307):
 *   - a 500ms arm timer before the zoom actually starts (prevents flicker on
 *     mouse-through);
 *   - the zoom itself is a single `transform` (translate + scale + rotate)
 *     on an absolutely-positioned inner "visual" wrapper, so it never
 *     affects layout/reflow of neighboring cards;
 *   - z-index elevation clears 220ms after mouseleave (not immediately), so
 *     the shrink-back animation plays above neighbors instead of ducking
 *     under them mid-shrink;
 *   - mouse handlers stay on the OUTER (un-transformed, normally-sized) box
 *     rather than the growing inner visual — the inner visual is a CHILD of
 *     the outer box, so hovering over its scaled-up rendered area still
 *     bubbles mouseenter/mouseleave through the outer box correctly; if the
 *     handlers were on the growing element itself the hit-test target would
 *     be a moving target.
 *
 * Because rows now DRIFT continuously, a card's canvas position is no longer
 * knowable from layout constants — so the zoom is measured at arm time
 * instead: hovering pauses the row immediately (see onPauseChange), and when
 * the 500ms timer fires the (now stationary) card's rect and the canvas
 * root's rect are both read, and screen px are converted to canvas px by
 * dividing by the stage scale (canvasRect.width / CANVAS.width) — the same
 * scale-aware correction geometry.ts documents.
 *
 * The zoom itself renders as an OVERLAY CLONE at panel level (see
 * ChecklistZoomOverlay), not as a transform on this card — the row viewport
 * stays `overflow: hidden` at all times, so the duplicated marquee cards
 * never peek out of bounds; only the clone escapes the row.
 */
interface ZoomRequest {
  url?: string
  tier: Tier
  /** Card box in CANVAS px (nominal card dims, measured position). */
  rect: { x: number; y: number; w: number; h: number }
}

/**
 * Checklist card tier frame — overlay-card-frame-spec.md. Four elements and
 * nothing else: tier-stroked card box (rounded TOP corners, tier wash over
 * the plate), the photo at full height / proportional width with its own
 * inner top radius, and two INVERTED bottom corners. The tier ramp is
 * colour + wash + radius; stroke stays 2px everywhere (a line-weight ramp is
 * invisible at phone scale — see the spec).
 */
const CARD_FRAME_STROKE = 2
const CARD_FRAME: Record<Tier, { color: string; wash: string; radius: number }> = {
  gold: { color: '#ffd700', wash: 'rgba(255,215,0,.14)', radius: 42 },
  silver: { color: '#f5f5f5', wash: 'rgba(245,245,245,.14)', radius: 36 },
  bronze: { color: '#cd6f19', wash: 'rgba(205,111,25,.14)', radius: 30 },
  grey: { color: '#909090', wash: 'rgba(144,144,144,.14)', radius: 24 },
}

function TierCardFrame({
  tier,
  url,
  onImageLoad,
}: {
  tier: Tier
  url?: string
  onImageLoad?: (naturalWidth: number, naturalHeight: number) => void
}) {
  const { color, wash, radius } = CARD_FRAME[tier]
  const s = CARD_FRAME_STROKE
  // The notch square sits FLUSH inside the corner (size = radius), one
  // corner rounded at the square's own full size + borders on the two sides
  // adjacent to it merging into a single concave quarter-circle (spec §6).
  // With the arc centered exactly on the card's corner point, its endpoints
  // land precisely on the frame's border bands — no jog where they meet.
  // The notch itself is TRANSPARENT — it only draws the arc stroke; the
  // actual cut is a mask (below) so what's BEHIND the card shows through.
  const notch = radius
  const notchBase: React.CSSProperties = {
    position: 'absolute',
    bottom: 0,
    width: notch,
    height: notch,
    background: 'transparent',
    boxSizing: 'border-box',
  }
  // True inverted corners: two radial cutouts centered on the card's bottom
  // corner points punch through plate, wash AND photo. The hole reaches only
  // the arc band's INNER edge (radius - stroke): the band area keeps card
  // paint beneath the opaque arc stroke, so no antialiasing seam shows.
  // Each gradient is opaque except its own hole; intersecting them yields
  // both holes.
  const cutAt = (x: string) =>
    `radial-gradient(circle ${radius}px at ${x} 100%, transparent ${radius - s}px, #000 ${radius - s + 0.5}px)`
  const maskLayers = `${cutAt('0px')}, ${cutAt('100%')}`
  const maskStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    maskImage: maskLayers,
    maskComposite: 'intersect',
    WebkitMaskImage: maskLayers,
    WebkitMaskComposite: 'source-in',
  }
  return (
    // OUTER glow as drop-shadow on the whole assembly: unlike box-shadow,
    // drop-shadow follows the rendered ALPHA SILHOUETTE — rounded top, the
    // sides, and around the OUTER edge of each inverted-corner arc, with a
    // soft rim bleeding into the cutouts. Static filter (never animated).
    <div
      style={{
        position: 'absolute',
        inset: 0,
        filter:
          tier !== 'grey' ? `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 7px ${color})` : undefined,
      }}
    >
    <div style={maskStyle}>
      {/* Card box: plate + tier stroke, rounded top, open base. NO overflow
          clipping — the notches live at the edges (spec §6). Tiered frames
          carry a WEAKER version of the board tiles' neon glow (half blur
          radii, same static-box-shadow rule); grey stays glow-free. The
          INSET half lives here; the outer halo is the unmasked layer above. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: COLOR.plate,
          border: `${s}px solid ${color}`,
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          boxSizing: 'border-box',
          boxShadow: tier !== 'grey' ? `inset 0 0 3px ${color}` : undefined,
        }}
      />
      {/* Squared-notebook lattice on the FRAME's background, rotated 45°
          (two crossed diagonal line families = diamond grid), drawn in the
          frame's own border colour. Under the wash and the photo. */}
      <div
        style={{
          position: 'absolute',
          inset: s,
          borderTopLeftRadius: radius - s,
          borderTopRightRadius: radius - s,
          overflow: 'hidden',
          backgroundImage: `repeating-linear-gradient(45deg, ${color} 0px, ${color} 1px, transparent 1px, transparent 20px), repeating-linear-gradient(-45deg, ${color} 0px, ${color} 1px, transparent 1px, transparent 20px)`,
        }}
        aria-hidden
      />
      {/* Tier wash — layered over the plate, not pre-blended (spec §4). */}
      <div
        style={{
          position: 'absolute',
          inset: s,
          background: wash,
          borderTopLeftRadius: radius - s,
          borderTopRightRadius: radius - s,
        }}
      />
      {/* Photo: full height, PROPPORTIONAL width, centred — never crop, never
          stretch. The IMAGE itself stays square; its CONTAINER carries the
          top radii and clips, so a full-width photo conforms to the frame's
          rounded corners while a narrower one (slab gutters showing the
          wash beneath) keeps its natural square corners. Clipping here is
          safe — the notches are siblings, outside this container (spec §6-7). */}
      {url && (
        <div
          style={{
            position: 'absolute',
            inset: s,
            display: 'flex',
            justifyContent: 'center',
            overflow: 'hidden',
            borderTopLeftRadius: radius - s,
            borderTopRightRadius: radius - s,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            onLoad={(e) => onImageLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
            style={{
              height: '100%',
              width: 'auto',
              maxWidth: '100%',
              display: 'block',
            }}
          />
        </div>
      )}
    </div>
      {/* Inverted bottom corners: the arcs' STROKES only — the cut itself is
          the mask above, so the background genuinely shows through (spec §6,
          open question 1 resolved as "fully transparent"). */}
      <div
        style={{
          ...notchBase,
          left: 0,
          borderTopRightRadius: notch,
          borderTop: `${s}px solid ${color}`,
          borderRight: `${s}px solid ${color}`,
        }}
        aria-hidden
      />
      <div
        style={{
          ...notchBase,
          right: 0,
          borderTopLeftRadius: notch,
          borderTop: `${s}px solid ${color}`,
          borderLeft: `${s}px solid ${color}`,
        }}
        aria-hidden
      />
    </div>
  )
}

// NOTE: the Photo.rotation field is deliberately IGNORED in the checklist —
// every card renders upright in its portrait box, as captured.
function ChecklistCardTile({
  price,
  url,
  thumbnail,
  tier,
  cardWidth,
  cardHeight,
  showPrice,
  onPauseChange,
  onZoomStart,
  onZoomEnd,
  onImageLoad,
}: Omit<ChecklistCardView, 'id'> & {
  cardWidth: number
  cardHeight: number
  showPrice: boolean
  onPauseChange: (paused: boolean) => void
  onZoomStart: (req: ZoomRequest) => void
  onZoomEnd: () => void
  /** Mode 0's packer measures true image aspects through this. */
  onImageLoad?: (naturalWidth: number, naturalHeight: number) => void
}) {
  const { labelGap } = LAYOUT.checklist

  const boxRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    },
    [],
  )

  function measureRect(): ZoomRequest['rect'] | null {
    const box = boxRef.current
    const canvas = box?.closest('.composite-canvas')
    if (!box || !canvas) return null
    const canvasRect = canvas.getBoundingClientRect()
    const boxRect = box.getBoundingClientRect()
    const stageScale = canvasRect.width / CANVAS.width
    if (stageScale <= 0) return null
    return {
      x: (boxRect.left - canvasRect.left) / stageScale,
      y: (boxRect.top - canvasRect.top) / stageScale,
      w: cardWidth,
      h: cardHeight,
    }
  }

  function handleMouseEnter() {
    onPauseChange(true)
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null
      const rect = measureRect()
      if (rect) onZoomStart({ url, tier, rect })
    }, 500)
  }

  function handleMouseLeave() {
    onPauseChange(false)
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    onZoomEnd()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
      {/* 12-mode and the packed mode 0 drop the price label — the cell is just the card. */}
      {showPrice && (
        <div
          style={{
            fontFamily: FONT.display,
            fontSize: TYPE.price,
            fontWeight: FONT.weight.semibold,
            color: SHELL.checklistCard.priceColor,
            marginBottom: labelGap,
            lineHeight: 1,
          }}
        >
          {price}
        </div>
      )}
      <div
        ref={boxRef}
        style={{
          position: 'relative',
          width: cardWidth,
          height: cardHeight,
          aspectRatio: LAYOUT.checklist.cardAspect,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <TierCardFrame tier={tier} url={thumbnail || url} onImageLoad={onImageLoad} />
      </div>
    </div>
  )
}

/**
 * The zoomed checklist card, rendered as a clone ABOVE the panel (z-index
 * over rows and arrows, pointer-events none so the hovered tile keeps
 * receiving mouseleave). Mounts at the measured card rect, then transitions
 * to canvas center at ~80% size on the next frame; when `closing`, it
 * transitions back and the parent unmounts it after the transition ends.
 * Positioned in the PANEL's coordinate space: the panel's absolute children
 * are laid out from its padding box, so canvas coords convert by subtracting
 * the panel's canvas position and border.
 */
function ChecklistZoomOverlay({
  req,
  closing,
  onClosed,
}: {
  req: ZoomRequest
  closing: boolean
  onClosed: () => void
}) {
  const [active, setActive] = useState(false)
  const { rect, url, tier } = req

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!closing) return
    setActive(false)
    const t = setTimeout(onClosed, 220)
    return () => clearTimeout(t)
  }, [closing, onClosed])

  const zoomFraction = 0.8
  const scale = Math.min((CANVAS.width * zoomFraction) / rect.w, (CANVAS.height * zoomFraction) / rect.h)
  const dx = CANVAS.width / 2 - (rect.x + rect.w / 2)
  const dy = CANVAS.height / 2 - (rect.y + rect.h / 2)

  return (
    <div
      style={{
        position: 'absolute',
        left: rect.x - SPACE.contentInset - LAYOUT.checklist.panelBorder,
        top: rect.y - CHECKLIST_TOP - LAYOUT.checklist.panelBorder,
        width: rect.w,
        height: rect.h,
        zIndex: 10,
        pointerEvents: 'none',
        transition: 'transform 200ms ease-out',
        transform: active ? `translate(${dx}px, ${dy}px) scale(${scale})` : undefined,
      }}
      aria-hidden
    >
      {/* Zoom shows JUST the card photo — no frame, no glow, no notches. */}
      {url && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            style={{ height: '100%', width: 'auto', maxWidth: '100%', display: 'block' }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * One row's small advance arrow, vertically centered against that row's
 * CARD (not its price label) by mirroring the same label-height + labelGap
 * spacer the card column itself uses above the card — see ChecklistCardTile.
 * Stage 3's chevron-fill animation will eventually live here, filling over
 * this row's own CHECKLIST_ROW_INTERVALS_MS interval.
 */
function ChecklistRowArrow({
  onStep,
  rowIndex,
  direction,
  mode,
  fillDurationMs,
  fillEpoch,
}: {
  onStep: () => void
  rowIndex: number
  direction: 'left' | 'right'
  mode: ChecklistMode
  fillDurationMs?: number
  fillEpoch?: number
}) {
  const { labelGap } = LAYOUT.checklist
  const { cardHeight } = CHECKLIST_MODE_LAYOUT[mode]
  const verb = direction === 'right' ? 'Advance' : 'Rewind'
  return (
    <div style={{ height: checklistCellHeight(mode), display: 'flex', flexDirection: 'column' }}>
      {CHECKLIST_MODE_LAYOUT[mode].showPrice && (
        <div style={{ height: TYPE.price + labelGap, flexShrink: 0 }} aria-hidden />
      )}
      <div style={{ height: cardHeight, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Chevron
          direction={direction}
          onClick={onStep}
          scale={0.5}
          ariaLabel={`${verb} checklist row ${rowIndex + 1}`}
          fillDurationMs={fillDurationMs}
          fillEpoch={fillEpoch}
        />
      </div>
    </div>
  )
}

/** One digit of the density toggle in the panel's bottom-left corner. */
function ChecklistModeButton({
  mode,
  active,
  onClick,
}: {
  mode: ChecklistMode
  active: boolean
  onClick: () => void
}) {
  return (
    <div
      role="button"
      aria-label={mode === 0 ? 'All cards' : `${mode}-card preview`}
      aria-pressed={active}
      onClick={onClick}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        padding: '6px 16px',
        background: COLOR.plate,
        border: `2px solid ${active ? SHELL.statTile.borderColor : COLOR.ivory20}`,
        color: active ? COLOR.ivory : COLOR.ivory70,
        fontFamily: FONT.display,
        fontSize: TYPE.price,
        fontWeight: FONT.weight.semibold,
        lineHeight: 1,
      }}
    >
      {mode}
    </div>
  )
}

/**
 * Row = tier bucket (see useChecklistPage in useCompositeData.ts): `rows` is
 * already collapsed (empty buckets removed) and carries each bucket's FULL
 * card list plus drift metadata (`intervalMs`, `scrolls`).
 *
 * INSTANT STEPPING — rows snap by exactly one card, no drift:
 *   - each scrolling row is a clipped viewport over a translating "track"
 *     that renders the bucket TWICE (the duplicate provides the seamless
 *     wrap: the visible window can span past the first copy's end before
 *     the offset wraps back by one bucket-width);
 *   - a per-row setInterval fires every `intervalMs` (the row's tier pace)
 *     and steps the offset one card span, written DIRECTLY to the track DOM
 *     node — instant, no transition, no React re-render;
 *   - hovering any card PAUSES its row's stepping (so the card can be read
 *     and the hover zoom can measure a stationary rect); leaving resumes;
 *   - arrows step a row by one card immediately (left = back, right =
 *     forward) and restart that row's own timer from the click;
 *   - a row whose bucket fits its window (`scrolls: false`) never moves and
 *     renders its cards once, unclipped.
 *
 * The row-stack container below (and its arrow-column twin) are each a FIXED
 * checklistGridHeight(mode) tall (reserved for the mode's full row count) regardless
 * of how many rows actually render — rows stack from a stable top as buckets
 * empty/refill. Arrow columns sit at the panel's INNER EDGES (mode 12's
 * 768px grid leaves 48px a side — enough for a 30px edge arrow, not for
 * flanking flex columns).
 *
 * Row viewports stay `overflow: hidden` AT ALL TIMES — the hover zoom never
 * lifts the clipping. Instead the zoomed card renders as an overlay CLONE at
 * panel level (ChecklistZoomOverlay), above rows and arrows, so the
 * duplicated marquee cards never peek out of a row's bounds.
 */
const ARROW_EDGE_INSET = 6

/**
 * Mode 0: the WHOLE series at once, packed like /channel/[id]/photos —
 * uniform-height rows, card widths from each image's TRUE aspect (measured
 * on load, 5:7 assumed until then), and a binary search for the largest row
 * height at which everything still fits the panel area. Static: no tier
 * rows, no scrolling, no arrows, no prices — but the same hover zoom.
 */
function PackedChecklist({
  cards,
  onZoomStart,
  onZoomEnd,
}: {
  cards: ChecklistCardView[]
  onZoomStart: (req: ZoomRequest) => void
  onZoomEnd: () => void
}) {
  const { panelPadding, panelBorder, minHeight } = LAYOUT.checklist
  const areaW = LAYOUT.contentWidth - 2 * panelBorder - 2 * panelPadding
  const areaH = minHeight - 2 * panelBorder - 2 * panelPadding
  const GAP = 10

  const [dims, setDims] = useState<Record<number, { w: number; h: number }>>({})
  const aspectOf = (c: ChecklistCardView) => {
    const d = dims[c.id]
    return d && d.h > 0 ? d.w / d.h : 5 / 7
  }

  const packWithHeight = (h: number): ChecklistCardView[][] => {
    const rows: ChecklistCardView[][] = []
    let row: ChecklistCardView[] = []
    let rowW = 0
    for (const c of cards) {
      const w = h * aspectOf(c)
      const nextW = row.length === 0 ? w : rowW + GAP + w
      if (row.length > 0 && nextW > areaW) {
        rows.push(row)
        row = [c]
        rowW = w
      } else {
        row.push(c)
        rowW = nextW
      }
    }
    if (row.length > 0) rows.push(row)
    return rows
  }

  // Binary search the largest uniform row height that fits the area (the
  // photos board's packRows approach, without its stretch pass).
  let lo = 10
  let hi = areaH
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const rows = packWithHeight(mid)
    const total = rows.length * mid + (rows.length - 1) * GAP
    if (total <= areaH) lo = mid
    else hi = mid
  }
  const rowH = lo
  const packed = packWithHeight(rowH)

  return (
    <div
      style={{
        width: areaW,
        height: areaH,
        display: 'flex',
        flexDirection: 'column',
        gap: GAP,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {packed.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: GAP, justifyContent: 'center' }}>
          {row.map((c) => (
            <ChecklistCardTile
              key={c.id}
              price={c.price}
              url={c.url}
              thumbnail={c.thumbnail}
              tier={c.tier}
              cardWidth={rowH * aspectOf(c)}
              cardHeight={rowH}
              showPrice={false}
              onPauseChange={() => {}}
              onZoomStart={onZoomStart}
              onZoomEnd={onZoomEnd}
              onImageLoad={(w, h) =>
                setDims((prev) => {
                  const d = prev[c.id]
                  return d && d.w === w && d.h === h ? prev : { ...prev, [c.id]: { w, h } }
                })
              }
            />
          ))}
        </div>
      ))}
    </div>
  )
}
function Checklist({
  rows,
  mode,
  onSetMode,
}: {
  rows: ChecklistRowState[]
  mode: ChecklistMode
  onSetMode: (mode: ChecklistMode) => void
}) {
  const { panelPadding, panelBorder, minHeight, chevronWidth } = LAYOUT.checklist
  const { cardGap: modeCardGap, cols: modeCols } = CHECKLIST_MODE_LAYOUT[mode]

  const pausedRef = useRef<number[]>([])
  const [zoom, setZoom] = useState<{ req: ZoomRequest; closing: boolean } | null>(null)

  const rowsKey = `${mode}:` + rows.map((row) => row.cards.map((c) => c.id).join('-')).join('|')

  // Window start (card index) per row. Steps re-render the row with a fresh
  // circular slice — ONLY the visible window's cards exist in the DOM, so
  // there is nothing to clip and nothing adjacent to leak into view; the
  // glow is free in every direction.
  const [starts, setStarts] = useState<number[]>([])

  const timersRef = useRef<Array<ReturnType<typeof setInterval> | null>>([])
  // Bumped whenever a row's timer (re)starts — keys the arrows' fill animation
  // so the countdown visually restarts in sync with the timer.
  const [timerEpochs, setTimerEpochs] = useState<number[]>([])

  const stepRow = (rowIndex: number, direction: 1 | -1) => {
    const row = rows[rowIndex]
    if (!row?.scrolls) return
    const len = row.cards.length
    setStarts((prev) => {
      const next = [...prev]
      next[rowIndex] = (((next[rowIndex] ?? 0) + direction) % len + len) % len
      return next
    })
  }

  const startRowTimer = (rowIndex: number) => {
    const prior = timersRef.current[rowIndex]
    if (prior) clearInterval(prior)
    const row = rows[rowIndex]
    timersRef.current[rowIndex] = !row?.scrolls
      ? null
      : setInterval(() => {
          // Hover holds the row still; the tick is skipped, not queued.
          if (pausedRef.current[rowIndex] > 0) return
          stepRow(rowIndex, 1)
        }, row.intervalMs)
    setTimerEpochs((prev) => {
      const next = [...prev]
      next[rowIndex] = (next[rowIndex] ?? 0) + 1
      return next
    })
  }

  useEffect(() => {
    pausedRef.current = rows.map(() => 0)
    setStarts(rows.map(() => 0))
    rows.forEach((_, i) => startRowTimer(i))
    return () => {
      timersRef.current.forEach((t) => {
        if (t) clearInterval(t)
      })
      timersRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowsKey captures rows' identity
  }, [rowsKey])

  const nudge = (rowIndex: number, direction: 1 | -1) => {
    stepRow(rowIndex, direction)
    // Manual navigation restarts THIS row's own timer from the click.
    startRowTimer(rowIndex)
  }

  const setRowPaused = (rowIndex: number, paused: boolean) => {
    const counts = pausedRef.current
    counts[rowIndex] = Math.max(0, (counts[rowIndex] ?? 0) + (paused ? 1 : -1))
  }

  // Modes 6 and 12 anchor the grid's top at 2% of the panel's height
  // (measured from the panel's outer top edge) instead of vertical
  // centering; mode 0's packed board centers itself. The arrow columns
  // follow the same anchor so they stay row-aligned (absolute children
  // offset from just inside the border, hence the panelBorder correction).
  const gridTopFromPanelTop = mode === 6 || mode === 12 ? minHeight * 0.02 : null

  const arrowColumn: React.CSSProperties = {
    position: 'absolute',
    ...(gridTopFromPanelTop != null
      ? { top: gridTopFromPanelTop - panelBorder }
      : { top: '50%', transform: 'translateY(-50%)' }),
    width: chevronWidth * 0.5,
    height: checklistGridHeight(mode),
    display: 'flex',
    flexDirection: 'column',
    gap: CHECKLIST_ROW_GAP,
    zIndex: 3,
  }
  return (
    <div
      style={{
        position: 'absolute',
        top: CHECKLIST_TOP,
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        minHeight,
        zIndex: 2,
        background: COLOR.panel,
        border: `${panelBorder}px solid ${COLOR.panelBorder}`,
        boxSizing: 'border-box',
        padding: panelPadding,
        display: 'flex',
        alignItems: gridTopFromPanelTop != null ? 'flex-start' : 'center',
        justifyContent: 'center',
      }}
    >
      {mode === 0 ? (
        <PackedChecklist
          cards={rows[0]?.cards ?? []}
          onZoomStart={(req) => setZoom({ req, closing: false })}
          onZoomEnd={() => setZoom((z) => (z ? { ...z, closing: true } : null))}
        />
      ) : (
      <>
      <div
        style={{
          position: 'relative',
          width: checklistGridWidth(mode),
          height: checklistGridHeight(mode),
          display: 'flex',
          flexDirection: 'column',
          gap: CHECKLIST_ROW_GAP,
          marginTop:
            gridTopFromPanelTop != null ? gridTopFromPanelTop - panelPadding - panelBorder : undefined,
        }}
      >
        {/* Loading/empty: rows is simply [] — no cards, no shift, no crash. */}
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              width: '100%',
              height: checklistCellHeight(mode),
              // No clipping at all: only the visible window's cards render,
              // so nothing adjacent exists and the glow is free everywhere.
              display: 'flex',
              flexDirection: 'row',
              gap: modeCardGap,
              justifyContent: 'center',
            }}
          >
            {(row.scrolls
              ? Array.from(
                  { length: Math.min(modeCols, row.cards.length) },
                  (_, i) => row.cards[((starts[rowIndex] ?? 0) + i) % row.cards.length],
                )
              : row.cards
            ).map((c) => (
              <ChecklistCardTile
                key={c.id}
                price={c.price}
                url={c.url}
                thumbnail={c.thumbnail}
                tier={c.tier}
                cardWidth={CHECKLIST_MODE_LAYOUT[mode].cardWidth}
                cardHeight={CHECKLIST_MODE_LAYOUT[mode].cardHeight}
                showPrice={CHECKLIST_MODE_LAYOUT[mode].showPrice}
                onPauseChange={(paused) => setRowPaused(rowIndex, paused)}
                onZoomStart={(req) => setZoom({ req, closing: false })}
                onZoomEnd={() => setZoom((z) => (z ? { ...z, closing: true } : null))}
              />
            ))}
          </div>
        ))}
      </div>
      {/* A non-scrolling row hides its arrows but keeps an equal-height spacer,
          so the arrows of the rows below stay aligned with their cards. */}
      <div style={{ ...arrowColumn, left: ARROW_EDGE_INSET }}>
        {rows.map((row, rowIndex) =>
          row.scrolls ? (
            <ChecklistRowArrow
              key={rowIndex}
              onStep={() => nudge(rowIndex, -1)}
              rowIndex={rowIndex}
              direction="left"
              mode={mode}
            />
          ) : (
            <div key={rowIndex} style={{ height: checklistCellHeight(mode) }} aria-hidden />
          ),
        )}
      </div>
      <div style={{ ...arrowColumn, right: ARROW_EDGE_INSET }}>
        {rows.map((row, rowIndex) =>
          row.scrolls ? (
            <ChecklistRowArrow
              key={rowIndex}
              onStep={() => nudge(rowIndex, 1)}
              rowIndex={rowIndex}
              direction="right"
              mode={mode}
              fillDurationMs={row.intervalMs}
              fillEpoch={timerEpochs[rowIndex] ?? 0}
            />
          ) : (
            <div key={rowIndex} style={{ height: checklistCellHeight(mode) }} aria-hidden />
          ),
        )}
      </div>
      </>
      )}
      {zoom && (
        <ChecklistZoomOverlay
          req={zoom.req}
          closing={zoom.closing}
          onClosed={() => setZoom(null)}
        />
      )}
      {/* Density toggle — stuck to the panel's bottom-left corner from the OUTSIDE
          (a vertical stack in the content-inset margin, flush against the panel's
          outer left border, bottom-aligned with its outer bottom edge). */}
      <div
        style={{
          position: 'absolute',
          right: `calc(100% + ${panelBorder}px)`,
          bottom: -panelBorder,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 3,
        }}
      >
        <ChecklistModeButton mode={0} active={mode === 0} onClick={() => onSetMode(0)} />
        <ChecklistModeButton mode={6} active={mode === 6} onClick={() => onSetMode(6)} />
        <ChecklistModeButton mode={12} active={mode === 12} onClick={() => onSetMode(12)} />
      </div>
    </div>
  )
}

export default function Page({ params }: { params: { id: string } }) {
  const channelId = parseInt(params.id)
  const [checklistMode, setChecklistMode] = useState<ChecklistMode>(12)
  const data = useCompositeData(channelId, checklistMode)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // Validate against the actual live roster size, not the stage-1 default of 37 —
      // a break can return fewer (or, per composeRoster's capacity clamp, at most 38).
      for (const problem of validateDefault(data.placedRoster.length)) {
        console.error('[composite route]', problem)
      }
      for (const problem of checkLayoutGeometry()) {
        console.error('[composite geometry]', problem)
      }
    }
  }, [data.placedRoster.length])

  return (
    <CompositeShell>
      <HeaderLabelsRow seriesLabel={data.seriesLabel} boxesLabel={data.boxesLabel} countLabel={data.countLabel} />
      <Board placedRoster={data.placedRoster} />
      {FREEZE_INDICATOR && <FreezeIndicator />}
      <MidStatsRow stashOrPassValue={data.stashOrPassValue} spin2ChooseValue={data.spin2ChooseValue} />
      <Checklist rows={data.checklistRows} mode={checklistMode} onSetMode={setChecklistMode} />
    </CompositeShell>
  )
}
