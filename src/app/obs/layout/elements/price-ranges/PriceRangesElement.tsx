'use client'

// The `priceRanges` registry component (series-price-ranges-plan.md §4.5) — a readout of a
// `price_ranges` series' contents, one row per range: the range label on the left, and the count
// on the right inside a small golden-bordered square badge, each row divided from the next by a
// thin rule. Visual spec: a square-cornered black panel at 20% opacity (see
// PriceRangesElement.css); the badge palette is borrowed from FrameElement.css's
// `--frm-bronze: #756241`, a shade brighter/golder to read as its own accent rather than a copy.
//
// Renders nothing when the break's current series isn't a `price_ranges` series, or has no ranges
// yet — same convention as an empty TextElement (../text/TextElement.tsx), so an unconfigured/
// mismatched element leaves no stray box on the canvas.

import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import './PriceRangesElement.css'

// Registry defaults (registry.ts `makeElement()` leaves `labelFontSize`/`badgeFontSize` unset on
// a freshly-added priceRanges element so these apply) — also imported by PriceRangesSettings.tsx
// so the controls UI shows the same numbers a brand-new element actually renders at, same
// convention as TextElement.tsx's DEFAULT_FONT_SIZE.
export const DEFAULT_LABEL_FONT_SIZE = 44
export const DEFAULT_BADGE_FONT_SIZE = 40

function formatRange(priceFrom: number, priceTo: number | null): string {
    return priceTo === null ? `$${priceFrom}+` : `$${priceFrom}–$${priceTo}`
}

export function PriceRangesElement({element}: ElementProps) {
    const {series, seriesPriceRanges} = useLayoutData()

    if (element.kind !== 'priceRanges') return null
    if (series?.kind !== 'price_ranges' || seriesPriceRanges.length === 0) return null

    const labelFontSize = element.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
    const badgeFontSize = element.badgeFontSize ?? DEFAULT_BADGE_FONT_SIZE
    const badgeSize = Math.round(badgeFontSize * 1.8)

    return (
        <div className="prr-root">
            {seriesPriceRanges.map((r, i) => (
                <div key={r.id} className={`prr-row${i > 0 ? ' prr-row-divider' : ''}`}>
                    <span className="prr-label" style={{fontSize: labelFontSize}}>
                        {formatRange(r.price_from, r.price_to)}
                    </span>
                    <span
                        className="prr-badge"
                        style={{fontSize: badgeFontSize, width: badgeSize, height: badgeSize, flexBasis: badgeSize}}
                    >
                        {r.count}
                    </span>
                </div>
            ))}
        </div>
    )
}

export default PriceRangesElement
