import { useEffect, useLayoutEffect, useState } from 'react'
import { CANVAS } from './tokens'

// useLayoutEffect on the server only logs a warning and never runs (SSR has no
// window) — fall back to useEffect there so the warning never fires.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function computeScale(): number {
  return Math.min(window.innerWidth / CANVAS.width, window.innerHeight / CANVAS.height)
}

/**
 * Root stage scale for the 1080 x 360 banner canvas.
 *
 * Deliberately NOT composite/useStageScale — that hook is hardcoded to the
 * 1080 x 1920 overlay canvas. Generalising it to take dimensions would work and
 * would be backward-compatible, but it touches a hook three live on-air
 * overlays depend on in order to save these fifteen lines. Not worth the blast
 * radius.
 *
 * `scale(100vw / 1080)` is not valid CSS — dividing a length by a number yields
 * a length, and scale() requires a bare number, so the declaration is dropped by
 * the parser. Computing it in JS and handing it to `scale(var(--stage-scale))`
 * also works on OBS's older CEF, which is the runtime this page ships to.
 *
 * In practice the OBS source is set to exactly 1080 x 360 and this returns 1.
 * It exists so a mis-sized source letterboxes instead of cropping.
 */
export function useBannerScale(): number {
  // Starts at 1 on BOTH server and client so the markup React hydrates against
  // matches byte for byte. Measuring during the first client render instead
  // would emit a different --stage-scale than the server did and trip a
  // hydration mismatch. The layout effect below replaces it synchronously
  // before paint, so there is still no visible flash at the wrong size.
  const [scale, setScale] = useState(1)

  useIsomorphicLayoutEffect(() => {
    const update = () => setScale(computeScale())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return scale
}
