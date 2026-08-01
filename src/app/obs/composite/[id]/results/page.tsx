'use client'

/**
 * Results screen (figure 1f) — shown after a break closes. Reports who took
 * every slot, with a camera window at the foot so the breaker stays on
 * camera while reading the board out. See overlay-1f-spec.md and
 * overlay-1f-plan.md for the full brief; this page just wires the shell
 * (results.ts layout/placement, tokens.ts palette/type) together.
 *
 * A SEPARATE route from the live overlay ([id]/page.tsx) on purpose — this
 * screen has a different lifecycle (a closed break, static content, slow
 * polling) and a different data window (break_events for one specific break,
 * not the channel's currently-active one necessarily — see useResultsData's
 * `?break=` override / Decision D2). It shares only the canvas scaffolding
 * (useStageScale, HoleBackdrop, composite.css) and the palette/layout tokens
 * with the live page — nothing from board.ts's route/ORDER/portal machinery,
 * per the plan's §3: "the results grid is not a path."
 */
import { useEffect } from 'react'
import './page.css'
import { CANVAS, COLOR, FONT, SPACE, TRACKING } from '@/app/obs/composite/tokens'
import {
  RESULTS_CAMERA_TOP,
  RESULTS_GRID_TOP,
  RESULTS_LAYOUT,
  RESULTS_TITLE_TOP,
  checkResultsGeometry,
  type PlacedResult,
} from '@/app/obs/composite/results'
import { useStageScale } from '@/app/obs/composite/useStageScale'
import { HoleBackdrop } from '@/app/obs/composite/HoleBackdrop'
import { useResultsData } from '@/app/obs/composite/useResultsData'
import { ResultTile } from '@/app/obs/composite/ResultTile'

/**
 * The camera window at the foot of the board. Unlike the live overlay's
 * portal (geometry.ts's PORTAL_RECT, derived from the cells the board route
 * never visits) this rect is NOT derived from anything — the spec is
 * explicit that no portal-derivation logic applies here (§3: "this is a
 * plain window at the foot, not a hole punched through the board"). Its
 * numbers come straight from RESULTS_LAYOUT/results.ts's own derived top.
 */
const CAMERA_RECT = {
  left: SPACE.contentInset,
  top: RESULTS_CAMERA_TOP,
  width: RESULTS_LAYOUT.camera.width,
  height: RESULTS_LAYOUT.camera.height,
}

/**
 * `BREAK RESULTS` 64/600 ivory, centred; `{SERIES NAME} · {N} SLOTS` beneath
 * it, 36/400 ivory70, TRACKING.label, uppercase (spec §3's anatomy table).
 *
 * `offsetY` shifts the band down by the board's unused-row slack (see
 * boardSlack in ResultsPage) so the title always sits right above the
 * board's FIRST row, which is itself bottom-anchored against the camera
 * window. With a full 10-row board the offset is 0 and the band sits at its
 * spec position.
 */
function TitleBand({ subtitle, offsetY }: { subtitle: string; offsetY: number }) {
  const { title } = RESULTS_LAYOUT
  return (
    <div
      style={{
        position: 'absolute',
        top: RESULTS_TITLE_TOP + offsetY,
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
 * NOT a CSS grid (Decision D1 revised): a `display:grid` with a fixed
 * `repeat(10, 112px)` row template left a PARTIAL last row left-aligned,
 * which read wrong once every row was full-width content instead of empty
 * capacity. Chunking into rows of 4 and centering each row
 * (`justify-content:center`) makes a full row pixel-identical to the old
 * grid (4 tiles already fill the 864px content width) while a short last row
 * centers instead of hugging the left edge. Height budget is unchanged: a
 * given break's row count is `ceil(placed.length / cols)`, which is still 10
 * for anything from 37-40 entries, so the reserved `gridHeight` never moves.
 * Trailing cells beyond `placed.length` simply stay empty — no placeholder
 * tile is rendered for them.
 *
 * BOTTOM-ANCHORED (user decision): the whole board is shifted down by
 * `offsetY` — the height of its unused rows (boardSlack in ResultsPage) — so
 * its LAST row always sits directly above the camera window. The title band
 * takes the same offset, so it stays right above the board's FIRST row. A
 * break with fewer than 10 rows therefore leaves its slack above the title,
 * not as a hole between the board and the camera the breaker is pointing at.
 * With a full 10 rows the offset is 0 and nothing moves.
 */
function ResultsGrid({ placed, offsetY }: { placed: PlacedResult[]; offsetY: number }) {
  const { cols, gap, tileWidth, tileHeight } = RESULTS_LAYOUT

  const rows: PlacedResult[][] = []
  for (let i = 0; i < placed.length; i += cols) {
    rows.push(placed.slice(i, i + cols))
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: RESULTS_GRID_TOP + offsetY,
        left: SPACE.contentInset,
        width: cols * tileWidth + (cols - 1) * gap,
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

/**
 * 3px bronze border around the transparent camera rect — border only, no
 * corner brackets, unlike the live overlay's PortalFrame. The spec calls
 * this a "plain window", which is the distinction from the live portal.
 */
function CameraFrame() {
  return (
    <div
      style={{
        position: 'absolute',
        left: CAMERA_RECT.left,
        top: CAMERA_RECT.top,
        width: CAMERA_RECT.width,
        height: CAMERA_RECT.height,
        boxSizing: 'border-box',
        border: `3px solid ${COLOR.bronze}`,
        zIndex: 1,
        pointerEvents: 'none',
      }}
      aria-hidden
    />
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

  // Height of the board's UNUSED rows. Both the title band and the grid are
  // shifted down by this much, so title + board travel as one unit whose last
  // row lands exactly on the grid box's bottom edge (right above the camera
  // window) — see the BOTTOM-ANCHORED note on ResultsGrid. Zero for a full
  // 10-row board, and kept zero while `placed` is still empty/loading so the
  // title doesn't flash at the bottom of an empty page.
  const { cols, gap, tileHeight, gridHeight } = RESULTS_LAYOUT
  const rowCount = Math.ceil(placed.length / cols)
  const boardSlack =
    rowCount === 0 ? 0 : gridHeight - (rowCount * tileHeight + (rowCount - 1) * gap)

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
          <HoleBackdrop rect={CAMERA_RECT} />
          <TitleBand subtitle={subtitle} offsetY={boardSlack} />
          <ResultsGrid placed={placed} offsetY={boardSlack} />
          <CameraFrame />
        </div>
      </div>
    </>
  )
}
