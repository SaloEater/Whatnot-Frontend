'use client'

/**
 * Results screen (figure 1f) — shown after a break closes. Reports who took
 * every slot. See overlay-1f-spec.md and overlay-1f-plan.md for the full
 * brief; this page just wires the shell (results.ts layout/placement,
 * tokens.ts palette/type) together.
 *
 * NO CAMERA WINDOW (user decision, supersedes spec §3): the 864x492 window
 * that originally sat at the foot is removed entirely — the background is a
 * plain opaque cella fill (plus the live overlay's ambient GearTrain), the
 * GRID is pinned at 20% of the canvas height, and the title band hangs
 * above it (results.ts's RESULTS_GRID_TOP / RESULTS_TITLE_TOP).
 *
 * A SEPARATE route from the live overlay ([id]/page.tsx) on purpose — this
 * screen has a different lifecycle (a closed break, static content, slow
 * polling) and a different data window (break_events for one specific break,
 * not the channel's currently-active one necessarily — see useResultsData's
 * `?break=` override / Decision D2). It shares the canvas scaffolding
 * (useStageScale, composite.css), the palette/layout tokens, and the shell
 * chrome (FrameBorder + MeanderBand + GearTrain, with the frame-band
 * geometry constants from geometry.ts) with the live page — but nothing
 * from board.ts's route/ORDER/portal machinery, per the plan's §3: "the
 * results grid is not a path."
 */
import { useEffect } from 'react'
import './page.css'
import { CANVAS, COLOR, FONT, SHELL, TRACKING } from '@/app/obs/composite/tokens'
import {
  RESULTS_GRID_TOP,
  RESULTS_LAYOUT,
  RESULTS_TITLE_TOP,
  checkResultsGeometry,
  type PlacedResult,
} from '@/app/obs/composite/results'
import {
  BOTTOM_BAND_TOP,
  FRAME_BAND_HEIGHT,
  FRAME_BAND_LEFT,
  FRAME_BAND_WIDTH,
  FRAME_INSET,
  TOP_BAND_TOP,
} from '@/app/obs/composite/geometry'
import { useStageScale } from '@/app/obs/composite/useStageScale'
import { useResultsData } from '@/app/obs/composite/useResultsData'
import { ResultTile } from '@/app/obs/composite/ResultTile'
import { MeanderBand } from '@/app/obs/composite/Meander'
import { GearTrain } from '@/components/GearTrain'

/**
 * Same bronze frame the live overlay draws (its FrameBorder component):
 * 3px SHELL.frame border inset FRAME_INSET from the canvas edge. The
 * meander bands rendered in the page body complete the frame, exactly as on
 * /obs/composite/[id] — top band upright, bottom band mirrored (scaleY(-1)).
 */
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
 * `BREAK RESULTS` 64/600 ivory, centred; `{SERIES NAME} · {N} SLOTS` beneath
 * it, 36/400 ivory70, TRACKING.label, uppercase (spec §3's anatomy table).
 *
 * `top` is RESULTS_TITLE_TOP — this band always sits right above the
 * grid's first row (the grid itself is pinned at 20% canvas height).
 */
function TitleBand({ subtitle, top }: { subtitle: string; top: number }) {
  const { title } = RESULTS_LAYOUT
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: 0,
        width: CANVAS.width,
        height: title.height,
        paddingTop: title.padTop,
        boxSizing: 'border-box',
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          fontFamily: FONT.display,
          fontWeight: FONT.weight.semibold,
          fontSize: title.headingSize,
          color: COLOR.ivory,
          lineHeight: 1,
        }}
      >
        BREAK RESULTS
      </div>
      <div
        style={{
          marginTop: title.gapBetween,
          fontFamily: FONT.display,
          fontWeight: FONT.weight.regular,
          fontSize: title.subheadingSize,
          letterSpacing: TRACKING.label,
          color: COLOR.ivory70,
          textTransform: 'uppercase',
          lineHeight: 1,
          // Reserves space even while `subtitle` is '' (series/count still
          // loading) so the title band never reflows once data lands.
          minHeight: title.subheadingSize,
        }}
      >
        {subtitle}
      </div>
    </div>
  )
}

/**
 * Stacked flex rows, `RESULTS_LAYOUT.cols` (4) tiles per row, fed
 * `composeResults()` output in array order (see results.ts's composeResults():
 * real teams alphabetical, then non-team specials alphabetical — a user
 * decision that overrides the spec's original price-rank reading order; the
 * frame colour encodes the series pricing tier, not reading position).
 *
 * NOT a CSS grid (Decision D1 revised): a `display:grid` with a fixed row
 * template left a PARTIAL last row left-aligned, which read wrong once every
 * row was full-width content instead of empty capacity. Chunking into rows
 * of 4 and centering each row (`justify-content:center`) makes a full row
 * pixel-identical to a grid while a short last row centers instead of
 * hugging the left edge. Trailing cells beyond `placed.length` simply stay
 * empty — no placeholder tile is rendered for them.
 *
 * `top` is RESULTS_GRID_TOP — the grid is pinned at 20% of the canvas
 * height, with the title band hanging above it (the camera window this used
 * to anchor against is gone).
 */
function ResultsGrid({ placed, top }: { placed: PlacedResult[]; top: number }) {
  const { cols, gap, tileHeight, gridWidth, gridLeft } = RESULTS_LAYOUT

  const rows: PlacedResult[][] = []
  for (let i = 0; i < placed.length; i += cols) {
    rows.push(placed.slice(i, i + cols))
  }

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: gridLeft,
        width: gridWidth,
        zIndex: 2,
        display: 'flex',
        flexDirection: 'column',
        gap,
      }}
    >
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'center', gap, height: tileHeight, flexShrink: 0 }}>
          {row.map((r) => (
            <ResultTile key={r.id} result={r} />
          ))}
        </div>
      ))}
    </div>
  )
}

export default function ResultsPage({ params }: { params: { id: string } }) {
  const channelId = parseInt(params.id)
  const scale = useStageScale()
  const { placed, seriesLabel, slotCount } = useResultsData(channelId)

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') {
      for (const problem of checkResultsGeometry(placed.length)) {
        console.error('[results geometry]', problem)
      }
    }
  }, [placed.length])

  // Empty '' while seriesLabel hasn't loaded yet — never a fake series name.
  const subtitle = seriesLabel ? `${seriesLabel} · ${slotCount} SLOTS` : ''

  // Grid pinned at 20% of the canvas height, title right above it — static
  // constants, see results.ts's derived-stack section.

  return (
    <>
      {/*
       * Self-hosted, preloaded exactly like the live overlay's page.tsx —
       * an OBS browser source may start with no network, so the two Barlow
       * Condensed weights are preloaded rather than pulled from Google Fonts
       * at stream time. The @font-face rules themselves live in
       * composite.css (imported via this page's page.css).
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
          {/* No camera window on this screen anymore — plain opaque ground,
              no HoleBackdrop, nothing transparent to protect. */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 0, background: COLOR.cella, pointerEvents: 'none' }}
            aria-hidden
          />
          {/* Ambient gear train behind the board — the live overlay's own
              layer (components/GearTrain, defaults authored on this same
              1080x1920 canvas). Rendered after the ground fill so it paints
              above it, and under everything at zIndex 2. */}
          <GearTrain />
          {/* Frame + Greek-key bands, identical to the live overlay's shell:
              bronze border inset 12, 32px meander band top and bottom, the
              bottom one mirrored. */}
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
          <TitleBand subtitle={subtitle} top={RESULTS_TITLE_TOP} />
          <ResultsGrid placed={placed} top={RESULTS_GRID_TOP} />
        </div>
      </div>
    </>
  )
}
