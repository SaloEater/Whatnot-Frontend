'use client'

/**
 * OBS BROWSER SOURCE SETTINGS (plan §5) — recommended config for this source:
 *   - Size: 1080 x 1920
 *   - URL: .../obs/composite/transition
 *   - ✅ Shutdown source when not visible
 *   - ✅ Refresh browser when scene becomes active
 * With both checkboxes on, showing this source (or toggling its scene
 * visibility) reloads the page and replays the stinger from 0ms every time.
 * There is no in-page re-trigger, WebSocket, or backend wiring in this
 * iteration (plan §7) — replay IS page reload.
 *
 * See overlay-transition-spec.md for the design brief (why the timing is
 * pinned where it is) and overlay-transition-plan.md for the implementation
 * plan this page follows.
 */

import { useEffect, useRef, useState } from 'react'
import './page.css'
import { CANVAS, COLOR, SHELL } from '@/app/obs/composite/tokens'
import { useStageScale } from '@/app/obs/composite/useStageScale'
import { GearTrain } from '@/components/GearTrain'
import { MeanderBand } from '@/app/obs/composite/Meander'
import { Chains } from './Chains'
import { LogoBadge } from './LogoBadge'

/**
 * Top/bottom Greek-key band geometry, read straight off SHELL.frame.band
 * (tokens.ts) — the same literal values `[id]/page.tsx` uses via its
 * geometry.ts re-exports (FRAME_BAND_LEFT etc). This page doesn't reuse
 * geometry.ts itself (plan §2's reuse list is tokens.ts only), so the two
 * numbers that come from board/board-layout maths there (BOARD_TOP and
 * friends) aren't needed here; only the frame band's own fixed offsets are.
 */
const BAND_LEFT = SHELL.frame.band.left
const BAND_TOP = SHELL.frame.band.top
const BAND_WIDTH = SHELL.frame.band.width
const BAND_HEIGHT = SHELL.frame.band.height
const BAND_BOTTOM_TOP = CANVAS.height - SHELL.frame.band.bottom - SHELL.frame.band.height

/** Give this page's meander pattern its own SVG <pattern> id (MeanderBand's
 *  `id` prop) so it can never collide with `[id]/page.tsx`'s "top"/"bottom"
 *  ids if both pages are ever rendered in one document (plan §2). */
const MEANDER_ID_TOP = 'transition-top'
const MEANDER_ID_BOTTOM = 'transition-bottom'

/**
 * Reads `?delay=<ms>` once, on first client render. Malformed or missing
 * values fall back to 0 (start immediately once the logo has loaded). The
 * slab sits off-screen (translateY(-100%)) the entire time this delay is
 * being waited out, so the wait is invisible — an operator can use it to
 * line up the scene swap underneath.
 */
function readDelayParam(): number {
  if (typeof window === 'undefined') return 0
  const raw = new URLSearchParams(window.location.search).get('delay')
  const parsed = raw === null ? 0 : Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export default function Page() {
  const scale = useStageScale()

  // Lazily read the query param exactly once — window is only defined on
  // the client, and the value can't change over the page's lifetime.
  const delayRef = useRef<number | null>(null)
  if (delayRef.current === null) delayRef.current = readDelayParam()

  const [logoLoaded, setLogoLoaded] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [done, setDone] = useState(false)

  // Gate animation start on the logo's onLoad (it is a raster asset, not
  // inline art — plan §5) AND on the optional delay, so neither a slow
  // image fetch nor an operator-requested delay ever shows a logo-less or
  // mistimed slab. Both are invisible waits: the rig sits fully off-screen
  // (translateY(-100%)) the whole time.
  useEffect(() => {
    if (!logoLoaded) return
    const delay = delayRef.current ?? 0
    if (delay <= 0) {
      setPlaying(true)
      return
    }
    const timer = setTimeout(() => setPlaying(true), delay)
    return () => clearTimeout(timer)
  }, [logoLoaded])

  return (
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
        {/*
         * Deliberately NO page-level opaque ground here (unlike
         * `[id]/page.tsx`'s full-bleed COLOR.cella div at zIndex 0) — the
         * opaque fill lives on `.slab` alone, below. composite.css already
         * forces `html, body { background: transparent !important }`
         * against the app-wide Bootstrap dark theme, so every pixel of this
         * page outside the slab stays genuinely transparent in an OBS
         * browser source, before the drop and after the exit (plan §3).
         *
         * The rig unmounts entirely once the animation ends (onAnimationEnd
         * below) — this is what guarantees the page returns to fully
         * transparent afterward AND stops GearTrain's infinite rotation
         * keyframes from costing GPU/encode time on a parked, invisible
         * slab (plan §5).
         */}
        {!done && (
          <div
            className={playing ? 'slab-rig slab-rig-playing' : 'slab-rig'}
            style={{ width: CANVAS.width, height: CANVAS.height }}
            onAnimationEnd={(e) => {
              // GearTrain's own spin keyframes are `infinite` and never fire
              // `animationend` on their own, but React's onAnimationEnd
              // bubbles from descendants — guard on the animation name so
              // only the rig's own one-shot cycle can trigger the unmount.
              if (e.animationName === 'slab-cycle') setDone(true)
            }}
          >
            <Chains />
            <div
              className="slab"
              style={{ position: 'absolute', inset: 0, background: COLOR.cella, overflow: 'hidden' }}
            >
              <GearTrain />
              <div style={{ position: 'absolute', left: BAND_LEFT, top: BAND_TOP, zIndex: 1, pointerEvents: 'none' }}>
                <MeanderBand id={MEANDER_ID_TOP} width={BAND_WIDTH} height={BAND_HEIGHT} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: BAND_LEFT,
                  top: BAND_BOTTOM_TOP,
                  zIndex: 1,
                  transform: 'scaleY(-1)',
                  pointerEvents: 'none',
                }}
              >
                <MeanderBand id={MEANDER_ID_BOTTOM} width={BAND_WIDTH} height={BAND_HEIGHT} />
              </div>
              <LogoBadge onLoad={() => setLogoLoaded(true)} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
