/**
 * Root stage scale, shared by every page built on the composite canvas
 * (the live overlay at `[id]/page.tsx` and the results screen at
 * `[id]/results/page.tsx`). Extracted so both pages stage the same
 * 1080 x 1920 canvas identically instead of maintaining two copies of this
 * math.
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import { CANVAS } from './tokens'

// useLayoutEffect on the server only logs a warning and never runs (SSR has no
// window) — fall back to useEffect there so the warning never fires.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

function computeStageScale(): number {
  return Math.min(window.innerWidth / CANVAS.width, window.innerHeight / CANVAS.height)
}

/**
 * The root scale from the spec, `scale(min(vw/1080, vh/1920))`, is CSS
 * pseudocode: `100vw / 1080` divides a length by a number, producing a
 * length, and `scale()` requires a bare number, so that declaration is
 * invalid CSS and gets dropped by the parser. Computing it in JS and handing
 * it to `scale(var(--stage-scale))` also works on OBS's older CEF, which is
 * the actual runtime this page ships to.
 *
 * Lazy `useState` init covers the very first client render (no flash), and
 * the `useIsomorphicLayoutEffect` re-measures synchronously before paint on
 * mount and on every `resize`.
 */
export function useStageScale(): number {
  const [scale, setScale] = useState(() => (typeof window === 'undefined' ? 1 : computeStageScale()))

  useIsomorphicLayoutEffect(() => {
    const update = () => setScale(computeStageScale())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return scale
}
