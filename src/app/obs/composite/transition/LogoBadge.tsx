/**
 * The still logo mark at the centre of the slab (overlay-transition-spec.md
 * §4, §6). ~340px, centred on (540, 960) — the canvas's horizontal centre
 * and the slab's vertical centre. Deliberately STILL while the gear train
 * turns around it: stillness is what makes it read as the fixed point, and
 * that reading is lost the moment it rotates (spec open question 4).
 *
 * The asset (public/images/transition/sports.webp, 256x256) already carries
 * its own gold rim, so this renders a bare <img> — no ring, no frame, no
 * drop-shadow added on top of it (plan §6).
 */

import { useEffect, useRef } from 'react'

/** Centre of the slab, in the 1080x1920 canvas coordinate space. */
const CENTER_X = 540
const CENTER_Y = 960

/**
 * Rendered size. The source asset is 256px — this is a 1.33x upscale,
 * acceptable for a 3.2s motion piece (plan §6). Re-export the asset larger
 * if it reads soft in OBS; no code change needed here.
 */
const BADGE_SIZE = 340

export function LogoBadge({ onLoad }: { onLoad?: () => void }) {
  const imgRef = useRef<HTMLImageElement>(null)

  // The <img> is in the server-rendered HTML, so with a warm cache (exactly
  // what OBS's "refresh browser when scene becomes active" produces on every
  // replay after the first) the browser can finish loading it BEFORE React
  // hydrates and attaches the onLoad handler — the event fires into nothing
  // and the animation would never start. Re-check on mount; onLoad firing
  // twice is harmless (the page's setState is idempotent).
  useEffect(() => {
    const img = imgRef.current
    if (img && img.complete && img.naturalWidth > 0) onLoad?.()
  }, [onLoad])

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static OBS art, not a Next-optimized asset
    <img
      ref={imgRef}
      src="/images/transition/sports.webp"
      alt=""
      onLoad={onLoad}
      style={{
        position: 'absolute',
        left: CENTER_X - BADGE_SIZE / 2,
        top: CENTER_Y - BADGE_SIZE / 2,
        width: BADGE_SIZE,
        height: BADGE_SIZE,
        zIndex: 2,
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  )
}
