'use client'

/**
 * Shared canvas chrome for every page built on the composite overlay's
 * 1080x1920 stage: font preloads, the scaled `.composite-stage-outer` /
 * `.composite-canvas` wrapper, the opaque cella ground, the ambient
 * `<GearTrain />`, the bronze `FrameBorder`, and the top/bottom Greek-key
 * `MeanderBand`s. Extracted verbatim from `[id]/page.tsx` (the live overlay)
 * so a second page (the compact board) can reuse the exact same frame
 * instead of re-deriving it — no behavior change on the live page.
 *
 * `children` render inside the canvas at z-index 2, absolutely positioned by
 * the caller (this shell carries no content geometry of its own).
 *
 * `transparent` (default false, live overlay untouched) skips ONLY the
 * opaque `COLOR.cella` ground div — GearTrain, FrameBorder, and the meander
 * bands still render. composite.css already keeps `html`/`body` transparent
 * for the OBS camera-hole use case, so with the ground gone the canvas is
 * genuinely see-through; a caller (the compact board) that wants its own
 * background paints it itself instead.
 */
import { CANVAS, COLOR, FONT, SHELL } from './tokens'
import { FRAME_BAND_LEFT, FRAME_BAND_WIDTH, FRAME_BAND_HEIGHT, FRAME_INSET, TOP_BAND_TOP, BOTTOM_BAND_TOP } from './geometry'
import { useStageScale } from './useStageScale'
import { MeanderBand } from './Meander'
import { GearTrain } from '@/components/GearTrain'

/**
 * Ring width of the frame's own cella backing: the bronze line sits at
 * FRAME_INSET with its stroke, and the backing mirrors that inset on the
 * line's inner side too (12 + 3 + 12 = 27), so the line runs centered on a
 * dark band instead of floating directly over whatever a transparent page
 * shows behind it. On the opaque page it's cella-on-cella — invisible.
 */
const FRAME_BACKING_WIDTH = 2 * FRAME_INSET + SHELL.frame.borderWidth

function FrameBorder() {
  return (
    <>
      {/* Backing ring: an edge-hugging cella band with a hollow (transparent)
          center, drawn as a fat border rather than a filled div so it never
          covers the canvas interior. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: `${FRAME_BACKING_WIDTH}px solid ${COLOR.cella}`,
          boxSizing: 'border-box',
          zIndex: 0,
          pointerEvents: 'none',
        }}
        aria-hidden
      />
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
    </>
  )
}

export function CompositeShell({
  children,
  transparent = false,
  gears = true,
}: {
  children?: React.ReactNode
  transparent?: boolean
  /** Set false to drop the ambient gear train (default true, live overlay untouched). */
  gears?: boolean
}) {
  const scale = useStageScale()

  return (
    <>
      {/*
       * Self-hosted per the spec's typography section: an OBS browser source
       * may start with no network, so the two Barlow Condensed weights are
       * preloaded rather than pulled from Google Fonts at stream time. The
       * actual @font-face rules (family "Barlow Condensed", font-display:
       * block) live in composite.css so every component's literal FONT.display
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
          {/* Full opaque ground — no camera hole anymore. Skipped entirely
              when `transparent`, so the caller's own background (or the
              genuinely transparent OBS canvas) shows through instead. */}
          {!transparent && (
            <div
              style={{ position: 'absolute', inset: 0, background: COLOR.cella, zIndex: 0, pointerEvents: 'none' }}
              aria-hidden
            />
          )}
          {gears && <GearTrain />}
          <FrameBorder />
          {/* Each band wrapper carries its own cella backing: on a
              `transparent` page the Greek keys would otherwise float over
              whatever OBS composites behind them; on the opaque page it sits
              cella-on-cella and changes nothing. */}
          <div
            style={{
              position: 'absolute',
              left: FRAME_BAND_LEFT,
              top: TOP_BAND_TOP,
              zIndex: 1,
              background: COLOR.cella,
              pointerEvents: 'none',
            }}
          >
            <MeanderBand id="top" width={FRAME_BAND_WIDTH} height={FRAME_BAND_HEIGHT} />
          </div>
          <div
            style={{
              position: 'absolute',
              left: FRAME_BAND_LEFT,
              top: BOTTOM_BAND_TOP,
              zIndex: 1,
              background: COLOR.cella,
              transform: 'scaleY(-1)',
              pointerEvents: 'none',
            }}
          >
            <MeanderBand id="bottom" width={FRAME_BAND_WIDTH} height={FRAME_BAND_HEIGHT} />
          </div>
          {children}
        </div>
      </div>
    </>
  )
}
