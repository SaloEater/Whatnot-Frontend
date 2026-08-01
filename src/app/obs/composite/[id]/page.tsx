'use client'

import { useEffect, useRef, useState } from 'react'
import './page.css'
import { CANVAS, COLOR, FONT, LAYOUT, SHELL, SPACE, TRACKING, TYPE } from '@/app/obs/composite/tokens'
import { validateDefault } from '@/app/obs/composite/board'
import { useStageScale } from '@/app/obs/composite/useStageScale'
import { HoleBackdrop } from '@/app/obs/composite/HoleBackdrop'
import {
  BOARD_TOP,
  BOTTOM_BAND_TOP,
  CHECKLIST_MODE_LAYOUT,
  CHECKLIST_TOP,
  DIVIDER_TOP,
  FRAME_BAND_HEIGHT,
  FRAME_BAND_LEFT,
  FRAME_BAND_WIDTH,
  FRAME_INSET,
  PORTAL_RECT,
  STAT_ROW_TOP,
  TOP_BAND_TOP,
  CHECKLIST_ROW_GAP,
  checkPortalGeometry,
  checklistCellHeight,
  checklistGridHeight,
  checklistGridWidth,
} from '@/app/obs/composite/geometry'
import { useCompositeData } from '@/app/obs/composite/useCompositeData'
import type { ChecklistCardView, ChecklistMode, ChecklistRowState, PlacedRosterSlot } from '@/app/obs/composite/types'
import { BoardTile } from '@/app/obs/composite/BoardTile'
import { MeanderBand } from '@/app/obs/composite/Meander'
import { DividerMeander } from '@/app/obs/composite/DividerMeander'
import { Chevron } from '@/app/obs/composite/Chevron'

function FrameBorder() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: FRAME_INSET,
        border: `${SHELL.frame.borderWidth}px solid ${COLOR.bronze}`,
        zIndex: 1,
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  )
}

/**
 * The camera portal isn't a bare hole in the mock (lines 83, 114-117): a 3px
 * bronze border runs around it, plus four 26x26 corner brackets sitting 7px
 * outside the rect. Both are strokes only — nothing here paints an opaque
 * fill, so the hole punched by HoleBackdrop stays a real hole.
 */
function PortalFrame() {
  const { left, top, width, height } = PORTAL_RECT
  const { size, offset, strokeWidth } = SHELL.portal.bracket
  const bracketBase: React.CSSProperties = {
    position: 'absolute',
    width: size,
    height: size,
    pointerEvents: 'none',
  }
  const rightX = left + width - size - offset
  const bottomY = top + height - size - offset

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }} aria-hidden>
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          border: `${SHELL.portal.borderWidth}px solid ${COLOR.bronze}`,
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          ...bracketBase,
          left: left + offset,
          top: top + offset,
          borderLeft: `${strokeWidth}px solid ${COLOR.bronze}`,
          borderTop: `${strokeWidth}px solid ${COLOR.bronze}`,
        }}
      />
      <div
        style={{
          ...bracketBase,
          left: rightX,
          top: top + offset,
          borderRight: `${strokeWidth}px solid ${COLOR.bronze}`,
          borderTop: `${strokeWidth}px solid ${COLOR.bronze}`,
        }}
      />
      <div
        style={{
          ...bracketBase,
          left: left + offset,
          top: bottomY,
          borderLeft: `${strokeWidth}px solid ${COLOR.bronze}`,
          borderBottom: `${strokeWidth}px solid ${COLOR.bronze}`,
        }}
      />
      <div
        style={{
          ...bracketBase,
          left: rightX,
          top: bottomY,
          borderRight: `${strokeWidth}px solid ${COLOR.bronze}`,
          borderBottom: `${strokeWidth}px solid ${COLOR.bronze}`,
        }}
      />
    </div>
  )
}

function StatTile({ caption1, caption2, value }: { caption1: string; caption2: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SHELL.statTile.innerGap,
        padding: SHELL.statTile.padding,
        background: COLOR.plate,
        border: `2px solid ${SHELL.statTile.borderColor}`,
      }}
    >
      <div
        style={{
          fontFamily: FONT.display,
          fontWeight: FONT.weight.regular,
          fontSize: TYPE.label,
          letterSpacing: TRACKING.caption,
          color: COLOR.ivory70,
          textTransform: 'uppercase',
          lineHeight: 1.12,
        }}
      >
        <div>{caption1}</div>
        <div>{caption2}</div>
      </div>
      <div
        style={{
          fontFamily: FONT.display,
          fontWeight: FONT.weight.semibold,
          fontSize: TYPE.value,
          color: COLOR.ivory,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function StatRow({ stashOrPassValue, spin2ChooseValue }: { stashOrPassValue: string; spin2ChooseValue: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: STAT_ROW_TOP,
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        height: 113,
        zIndex: 2,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: SHELL.statTile.tileGap,
      }}
    >
      <StatTile caption1="STASH" caption2="OR PASS" value={stashOrPassValue} />
      <StatTile caption1="SPIN 2" caption2="CHOOSE 1" value={spin2ChooseValue} />
    </div>
  )
}

function Board({ placedRoster }: { placedRoster: PlacedRosterSlot[] }) {
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
      {/* Loading/empty: placedRoster is simply [] — no tiles, no shift, no crash. */}
      {placedRoster.map((s) => (
        <BoardTile key={s.id} slot={s} />
      ))}
    </div>
  )
}

function DividerLabel({
  text,
  tracking,
  padding,
  numeric,
}: {
  text: string
  tracking: string
  padding: string
  /** Only the `12 OF 148` readout pairs its tracking with tabular-nums. */
  numeric?: boolean
}) {
  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1,
        background: COLOR.cella,
        padding,
        fontFamily: FONT.display,
        fontWeight: FONT.weight.regular,
        fontSize: TYPE.label,
        letterSpacing: tracking,
        color: COLOR.ivory70,
        textTransform: 'uppercase',
        fontVariantNumeric: numeric ? FONT.numeric : undefined,
        lineHeight: `${LAYOUT.divider.height}px`,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  )
}

function Divider({
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
        top: DIVIDER_TOP,
        left: SPACE.contentInset,
        width: LAYOUT.contentWidth,
        height: LAYOUT.divider.height,
        zIndex: 2,
      }}
    >
      <DividerMeander width={LAYOUT.contentWidth} height={LAYOUT.divider.height} />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <DividerLabel text={seriesLabel} tracking={TRACKING.label} padding="0 14px 0 0" />
        <div style={{ flex: 1 }} />
        <DividerLabel text={boxesLabel} tracking={TRACKING.metope} padding="0 16px" />
        <div style={{ flex: 1 }} />
        <DividerLabel text={countLabel} tracking={TRACKING.numeric} padding="0 0 0 16px" numeric />
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
  rotation: number
  /** Card box in CANVAS px (nominal card dims, measured position). */
  rect: { x: number; y: number; w: number; h: number }
}

function ChecklistCardTile({
  price,
  url,
  rotation,
  mode,
  onPauseChange,
  onZoomStart,
  onZoomEnd,
}: Omit<ChecklistCardView, 'id'> & {
  mode: ChecklistMode
  onPauseChange: (paused: boolean) => void
  onZoomStart: (req: ZoomRequest) => void
  onZoomEnd: () => void
}) {
  const { cardWidth, cardHeight } = CHECKLIST_MODE_LAYOUT[mode]
  const { labelGap } = LAYOUT.checklist
  const r = rotation ?? 0

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
      if (rect) onZoomStart({ url, rotation: r, rect })
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
      {/* 12-mode drops the price label entirely (showPrice: false) — the cell is just the card. */}
      {CHECKLIST_MODE_LAYOUT[mode].showPrice && (
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
        {/* No card chrome — background/border/shadow removed so the photo sits bare on the panel. */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* No url yet (stage-1 mock, or the photo hasn't loaded) -> plain placeholder box above, nothing more. */}
          {url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                transform: r ? `rotate(${r}deg)` : undefined,
              }}
            />
          )}
        </div>
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
  const { rect, rotation: r, url } = req

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
  const scale =
    r % 180 !== 0
      ? Math.min((CANVAS.width * zoomFraction) / rect.h, (CANVAS.height * zoomFraction) / rect.w)
      : Math.min((CANVAS.width * zoomFraction) / rect.w, (CANVAS.height * zoomFraction) / rect.h)
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
        // Chrome-free like the tiles: the clone is just the floating photo.
        overflow: 'hidden',
        transition: 'transform 200ms ease-out',
        transform: active ? `translate(${dx}px, ${dy}px) scale(${scale}) rotate(${r}deg)` : undefined,
      }}
      aria-hidden
    >
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            // The clone's own transform carries the rotation once it's active;
            // before that, rotate the image in place like the static tile does.
            transform: !active && r ? `rotate(${r}deg)` : undefined,
          }}
        />
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
}: {
  onStep: () => void
  rowIndex: number
  direction: 'left' | 'right'
  mode: ChecklistMode
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
        <Chevron direction={direction} onClick={onStep} scale={0.5} ariaLabel={`${verb} checklist row ${rowIndex + 1}`} />
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
      aria-label={`${mode}-card preview`}
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
 * CONTINUOUS SCROLL — rows drift slowly instead of snapping:
 *   - each scrolling row is a clipped viewport over a translating "track"
 *     that renders the bucket TWICE (the duplicate provides the seamless
 *     wrap: by the time the first copy has fully scrolled out, the second
 *     is in view and the offset wraps back by one bucket-width);
 *   - one requestAnimationFrame loop advances every row's offset by
 *     (cardSpan / intervalMs) * dt and writes the transform DIRECTLY to the
 *     track DOM node — no React state per frame, so the drift costs no
 *     re-renders (OBS needs that CPU for encoding);
 *   - hovering any card PAUSES its row (so the card can be read and the
 *     hover zoom can measure a stationary rect); leaving resumes it;
 *   - arrows nudge a row's offset by exactly one card span (left = back,
 *     right = forward) — instant, wrap-safe, on top of the drift;
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
/** Width of the darkening fade at the grid's left/right edges — softens cards scrolling in/out. */
const EDGE_FADE_PX = 10
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
  const { cardWidth: modeCardWidth, cardGap: modeCardGap } = CHECKLIST_MODE_LAYOUT[mode]
  const cardSpan = modeCardWidth + modeCardGap

  const trackRefs = useRef<Array<HTMLDivElement | null>>([])
  const offsetsRef = useRef<number[]>([])
  const pausedRef = useRef<number[]>([])
  const [zoom, setZoom] = useState<{ req: ZoomRequest; closing: boolean } | null>(null)

  const rowsKey = `${mode}:` + rows.map((row) => row.cards.map((c) => c.id).join('-')).join('|')

  const applyOffset = (rowIndex: number, offset: number) => {
    const el = trackRefs.current[rowIndex]
    if (el) el.style.transform = `translateX(${-offset}px)`
  }

  useEffect(() => {
    offsetsRef.current = rows.map(() => 0)
    pausedRef.current = rows.map(() => 0)
    rows.forEach((_, i) => applyOffset(i, 0))

    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      rows.forEach((row, i) => {
        if (!row.scrolls || pausedRef.current[i] > 0) return
        const trackWidth = row.cards.length * cardSpan
        let offset = offsetsRef.current[i] + (cardSpan * dt) / row.intervalMs
        offset %= trackWidth
        offsetsRef.current[i] = offset
        applyOffset(i, offset)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rowsKey captures rows' identity; mode is inside cardSpan
  }, [rowsKey, cardSpan])

  const nudge = (rowIndex: number, direction: 1 | -1) => {
    const row = rows[rowIndex]
    if (!row?.scrolls) return
    const trackWidth = row.cards.length * cardSpan
    let offset = (offsetsRef.current[rowIndex] + direction * cardSpan) % trackWidth
    if (offset < 0) offset += trackWidth
    offsetsRef.current[rowIndex] = offset
    applyOffset(rowIndex, offset)
  }

  const setRowPaused = (rowIndex: number, paused: boolean) => {
    const counts = pausedRef.current
    counts[rowIndex] = Math.max(0, (counts[rowIndex] ?? 0) + (paused ? 1 : -1))
  }

  // 6-mode anchors the grid's top at 5% of the panel's height (measured from
  // the panel's outer top edge) instead of vertical centering; 12-mode still
  // centers. The arrow columns follow the same anchor so they stay
  // row-aligned (absolute children offset from just inside the border, hence
  // the panelBorder correction).
  const gridTopFromPanelTop = mode === 6 ? minHeight * 0.05 : null

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
        {/* Edge fades: cards gradually darken into the panel over the outer EDGE_FADE_PX. */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: EDGE_FADE_PX,
            background: `linear-gradient(to right, ${COLOR.cella}, transparent)`,
            zIndex: 2,
            pointerEvents: 'none',
          }}
          aria-hidden
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: EDGE_FADE_PX,
            background: `linear-gradient(to left, ${COLOR.cella}, transparent)`,
            zIndex: 2,
            pointerEvents: 'none',
          }}
          aria-hidden
        />
        {/* Loading/empty: rows is simply [] — no cards, no shift, no crash. */}
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            style={{
              width: '100%',
              height: checklistCellHeight(mode),
              overflow: row.scrolls ? 'hidden' : 'visible',
            }}
          >
            <div
              ref={(el) => {
                trackRefs.current[rowIndex] = el
              }}
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: modeCardGap,
                // A short (non-scrolling) row centers its cards in the viewport;
                // scrolling tracks must stay left-anchored for the marquee offset.
                justifyContent: row.scrolls ? undefined : 'center',
              }}
            >
              {(row.scrolls ? [0, 1] : [0]).map((copy) =>
                row.cards.map((c) => (
                  <ChecklistCardTile
                    key={`${c.id}-${copy}`}
                    price={c.price}
                    url={c.url}
                    rotation={c.rotation}
                    mode={mode}
                    onPauseChange={(paused) => setRowPaused(rowIndex, paused)}
                    onZoomStart={(req) => setZoom({ req, closing: false })}
                    onZoomEnd={() => setZoom((z) => (z ? { ...z, closing: true } : null))}
                  />
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      {/* A non-scrolling row hides its arrows but keeps an equal-height spacer,
          so the arrows of the rows below stay aligned with their cards. */}
      <div style={{ ...arrowColumn, left: ARROW_EDGE_INSET }}>
        {rows.map((row, rowIndex) =>
          row.scrolls ? (
            <ChecklistRowArrow key={rowIndex} onStep={() => nudge(rowIndex, -1)} rowIndex={rowIndex} direction="left" mode={mode} />
          ) : (
            <div key={rowIndex} style={{ height: checklistCellHeight(mode) }} aria-hidden />
          ),
        )}
      </div>
      <div style={{ ...arrowColumn, right: ARROW_EDGE_INSET }}>
        {rows.map((row, rowIndex) =>
          row.scrolls ? (
            <ChecklistRowArrow key={rowIndex} onStep={() => nudge(rowIndex, 1)} rowIndex={rowIndex} direction="right" mode={mode} />
          ) : (
            <div key={rowIndex} style={{ height: checklistCellHeight(mode) }} aria-hidden />
          ),
        )}
      </div>
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
        <ChecklistModeButton mode={6} active={mode === 6} onClick={() => onSetMode(6)} />
        <ChecklistModeButton mode={12} active={mode === 12} onClick={() => onSetMode(12)} />
      </div>
    </div>
  )
}

export default function Page({ params }: { params: { id: string } }) {
  const channelId = parseInt(params.id)
  const scale = useStageScale()
  const [checklistMode, setChecklistMode] = useState<ChecklistMode>(6)
  const data = useCompositeData(channelId, checklistMode)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      // Validate against the actual live roster size, not the stage-1 default of 37 —
      // a break can return fewer (or, per composeRoster's capacity clamp, at most 38).
      for (const problem of validateDefault(data.placedRoster.length)) {
        console.error('[composite route]', problem)
      }
      for (const problem of checkPortalGeometry()) {
        console.error('[composite geometry]', problem)
      }
    }
  }, [data.placedRoster.length])

  return (
    <>
      {/*
       * Self-hosted per the spec's typography section: an OBS browser source
       * may start with no network, so the two Barlow Condensed weights are
       * preloaded rather than pulled from Google Fonts at stream time. The
       * actual @font-face rules (family "Barlow Condensed", font-display:
       * block) live in page.css so every component's literal FONT.display
       * string resolves against a real registered family.
       */}
      {FONT.files.map((file) => (
        <link
          key={file}
          rel="preload"
          href={`/fonts/${file}`}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      ))}
      <div className="composite-stage-outer">
        <div
          className="composite-canvas"
          style={
            {
              width: CANVAS.width,
              height: CANVAS.height,
              '--stage-scale': scale,
            } as React.CSSProperties & { '--stage-scale': number }
          }
        >
          <HoleBackdrop rect={PORTAL_RECT} />
          <FrameBorder />
          <div
            style={{ position: 'absolute', left: FRAME_BAND_LEFT, top: TOP_BAND_TOP, zIndex: 1, pointerEvents: 'none' }}
          >
            <MeanderBand id="top" width={FRAME_BAND_WIDTH} height={FRAME_BAND_HEIGHT} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: FRAME_BAND_LEFT,
              top: BOTTOM_BAND_TOP,
              zIndex: 1,
              transform: 'scaleY(-1)',
              pointerEvents: 'none',
            }}
          >
            <MeanderBand id="bottom" width={FRAME_BAND_WIDTH} height={FRAME_BAND_HEIGHT} />
          </div>
          <StatRow stashOrPassValue={data.stashOrPassValue} spin2ChooseValue={data.spin2ChooseValue} />
          <Board placedRoster={data.placedRoster} />
          <PortalFrame />
          <Divider seriesLabel={data.seriesLabel} boxesLabel={data.boxesLabel} countLabel={data.countLabel} />
          <Checklist rows={data.checklistRows} mode={checklistMode} onSetMode={setChecklistMode} />
        </div>
      </div>
    </>
  )
}
