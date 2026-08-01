import { COLOR, LAYOUT } from './tokens'

/**
 * Checklist paging chevron — bronze base layer only. The mock (lines
 * 136-138, 148-150) draws a second ivory layer on top with `animation:fillup`
 * as the paging fill indicator; that's stage-3/4 motion and is skipped here
 * (once built, it belongs on these per-row arrows, filling over each row's
 * own auto-advance interval — see CHECKLIST_ROW_INTERVALS_MS in
 * useCompositeData.ts). Exact path/stroke from the mock: 60x86 viewBox,
 * 8px stroke, round caps/joins, at `scale` 1.
 *
 * `scale` renders a smaller (or larger) version at the same proportions.
 * The viewBox stays the mock's original 60x86 units (path/stroke-width
 * values are left unscaled) while only the rendered `width`/`height` shrink
 * — the SVG's own viewBox-to-rendered-box mapping then scales the path AND
 * the stroke down together automatically, which is what keeps the stroke
 * proportional without a second explicit multiplication. Used at <1 for the
 * small per-row advance arrows in page.tsx (paging is per-row now — the old
 * flanking full-size chevrons are gone).
 *
 * Real button: `onClick` advances and (see useChecklistPage) resets the
 * relevant timer.
 */
export function Chevron({
  direction,
  onClick,
  scale = 1,
  ariaLabel,
}: {
  direction: 'left' | 'right'
  onClick?: () => void
  scale?: number
  ariaLabel?: string
}) {
  const { chevronWidth: w, chevronHeight: h } = LAYOUT.checklist
  const d = direction === 'left' ? 'M42 10 L18 43 L42 76' : 'M18 10 L42 43 L18 76'

  return (
    <svg
      width={w * scale}
      height={h * scale}
      viewBox={`0 0 ${w} ${h}`}
      style={{ flexShrink: 0, cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      aria-label={onClick ? (ariaLabel ?? `${direction === 'left' ? 'Previous' : 'Next'} checklist page`) : undefined}
      aria-hidden={onClick ? undefined : true}
    >
      <path d={d} fill="none" stroke={COLOR.bronze} strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
