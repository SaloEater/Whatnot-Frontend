import { COLOR, SHELL } from './tokens'

/**
 * Static Greek-key (meander) band for the top/bottom FRAME only, tiled via an
 * SVG <pattern>. Exact geometry from the fig4h mock (lines 61-69): a 32x32
 * unit, path `M0 29 H32 M5 29 V5 H27 V21 H14 V12`, stroke 3.
 *
 * This is a different unit than the divider's fret (see DividerMeander.tsx,
 * MOTION.meander) — the two bands are visually similar but sized and drawn
 * independently in the mock, so they stay separate components.
 *
 * Stage 1 only: no <animate>, no stroke-dashoffset.
 */
export function MeanderBand({ width, height, id }: { width: number; height: number; id: string }) {
  const { unit, path, strokeWidth } = SHELL.frame.band
  const patternId = `meander-${id}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', pointerEvents: 'none' }}
      aria-hidden
    >
      <defs>
        <pattern id={patternId} width={unit} height={unit} patternUnits="userSpaceOnUse">
          <path d={path} fill="none" stroke={COLOR.bronze} strokeWidth={strokeWidth} />
        </pattern>
      </defs>
      <rect x="0" y="0" width={width} height={height} fill={`url(#${patternId})`} />
    </svg>
  )
}
