/**
 * Antikythera-style gear train — an ambient decorative layer of meshed,
 * slowly counter-rotating line-art gears. Extracted from the composite
 * overlay so any page can mount it.
 *
 * SELF-CONTAINED: carries its own keyframes (inline <style>), its own
 * default wheel layout (authored on a 1080 x 1920 canvas), and needs no
 * page CSS. Drop it inside any positioned box — the SVG fills the box and
 * the whole train scales via the viewBox, so wheel coordinates never need
 * re-authoring per page.
 *
 * Deliberately SIMPLE model: wheels render at their authored positions, and
 * each wheel's period comes from its size — meshing wheels must share
 * surface speed, so period scales with radius (the ratios compose down the
 * chain, which collapses to `period = base * r / r0` for every wheel, no
 * graph walk needed). Pose the train with `initialAnglesDeg` and let it
 * spin. Meshing wheels counter-rotate (`reverse` alternates down a chain).
 *
 * The tooth dash pair is normalized per wheel to a whole number of teeth so
 * the pattern closes seamlessly around the rim (no irregular "seam" tooth);
 * per-wheel pitch varies ~±2% from the nominal 31px — imperceptible.
 *
 * Animation is CSS `transform: rotate` (compositor-only) on an inner <g> so
 * it composes with the outer <g>'s translate/pose. Teeth are a dashed
 * stroke ring: only strokes move, so it is cheap (~5% of frame area at the
 * default layout).
 */

export interface GearWheel {
  cx: number
  cy: number
  r: number
  /** Spin counter-clockwise. Alternate along a meshed chain. */
  reverse: boolean
}

/** Tooth pitch the dash pattern is normalized around ("11 20" dash pair). */
const NOMINAL_PITCH = 31
const TOOTH_FRACTION = 11 / NOMINAL_PITCH

/** The composite overlay's seven-wheel layout, authored on 1080 x 1920. */
export const DEFAULT_WHEELS: readonly GearWheel[] = [
  { cx: 540, cy: 300, r: 330, reverse: false },
  { cx: 180, cy: 688, r: 200, reverse: true },
  { cx: 875, cy: 760, r: 240, reverse: true },
  { cx: 400, cy: 1114, r: 280, reverse: false },
  { cx: 862, cy: 1305, r: 220, reverse: true },
  { cx: 330, cy: 1579, r: 190, reverse: true },
  { cx: 830, cy: 1693.5, r: 170, reverse: false },
]

/** Hand-tuned pose for DEFAULT_WHEELS so teeth visually mesh at t=0. */
export const DEFAULT_INITIAL_ANGLES_DEG: readonly number[] = [0, -2.5, 1.6, -1.3, 3.3, 3.2, 3.5]

export function GearTrain({
  wheels = DEFAULT_WHEELS,
  width = 1080,
  height = 1920,
  color = '#756241',
  opacity = 0.45,
  toothStroke = 14,
  lineStroke = 3,
  basePeriodSec = 210,
  initialAnglesDeg = DEFAULT_INITIAL_ANGLES_DEG,
  paused = false,
}: {
  /** Wheel layout in viewBox coordinates. Defaults to the composite's seven-wheel train. */
  wheels?: readonly GearWheel[]
  /** ViewBox size the wheels are authored in — NOT the rendered size; the SVG fills its container. */
  width?: number
  height?: number
  color?: string
  opacity?: number
  /** Stroke width of the dashed tooth ring / of rims, hubs and spokes. */
  toothStroke?: number
  lineStroke?: number
  /** Seconds per revolution of wheels[0]; every other wheel scales by radius. */
  basePeriodSec?: number
  /** Starting pose per wheel, degrees clockwise (turns spokes and teeth alike). */
  initialAnglesDeg?: readonly number[]
  /** Freeze the train (e.g. to inspect the initial pose). */
  paused?: boolean
}) {
  const train = wheels.map((w, i) => {
    const circumference = 2 * Math.PI * w.r
    const teeth = Math.round(circumference / NOMINAL_PITCH)
    const pitch = circumference / teeth
    return {
      ...w,
      toothLen: pitch * TOOTH_FRACTION,
      gapLen: pitch * (1 - TOOTH_FRACTION),
      durSec: (basePeriodSec * w.r) / wheels[0].r,
      angleDeg: initialAnglesDeg[i] ?? 0,
    }
  })

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
        opacity,
      }}
      aria-hidden
    >
      <style>{`@keyframes gear-train-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      {train.map((w) => {
        const rim = w.r - 12
        const hub = Math.round(w.r / 16)
        const spoke = w.r - 14
        const diag = Math.round(spoke * Math.SQRT1_2)
        return (
          <g key={`${w.cx},${w.cy}`} transform={`translate(${w.cx}, ${w.cy}) rotate(${w.angleDeg})`}>
            <g
              style={{
                animation: `gear-train-spin ${w.durSec}s linear infinite${w.reverse ? ' reverse' : ''}`,
                animationPlayState: paused ? 'paused' : undefined,
              }}
            >
              <circle
                r={w.r}
                fill="none"
                stroke={color}
                strokeWidth={toothStroke}
                strokeDasharray={`${w.toothLen} ${w.gapLen}`}
              />
              <circle r={rim} fill="none" stroke={color} strokeWidth={lineStroke} />
              <circle r={hub} fill="none" stroke={color} strokeWidth={lineStroke} />
              <path
                d={`M0 ${-spoke} V${spoke} M${-spoke} 0 H${spoke} M${-diag} ${-diag} L${diag} ${diag} M${-diag} ${diag} L${diag} ${-diag}`}
                stroke={color}
                strokeWidth={lineStroke}
                fill="none"
              />
            </g>
          </g>
        )
      })}
    </svg>
  )
}
