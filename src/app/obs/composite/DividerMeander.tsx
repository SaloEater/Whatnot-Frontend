import { COLOR, MOTION, SHELL } from './tokens'

/**
 * Static base path for the divider meander (fig4h mock lines 122-133).
 *
 * Built by repeating the mock's literal unit segment (SHELL.divider.unitSegment)
 * MOTION.meander.repeats times, not hand-typed — the resulting `d` string is
 * identical to the mock's (same 22 repeats of `h7 v-23 h26 v14 h-15 v9 h22`
 * starting at M0,28). Stage 3's running-light layers (mock lines 125-126)
 * will reuse this exact same `d` builder with stroke-dasharray, which is why
 * this needs to be a real repeated path rather than an SVG <pattern> like the
 * frame bands — dasharray/stroke-dashoffset animate along ONE continuous path.
 */
export function buildDividerPath(): string {
  const units = Array(MOTION.meander.repeats).fill(SHELL.divider.unitSegment).join(' ')
  return `M0,${SHELL.divider.startY} ${units}`
}

export function DividerMeander({ width, height }: { width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      style={{ position: 'absolute', left: 0, top: 0, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden
    >
      <path d={buildDividerPath()} fill="none" stroke={COLOR.bronze} strokeWidth={MOTION.meander.strokeWidth} />
    </svg>
  )
}
