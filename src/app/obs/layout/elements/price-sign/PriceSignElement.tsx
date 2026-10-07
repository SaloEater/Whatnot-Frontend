'use client'

// The `priceSign` registry component (obs-price-sign-plan.md v2) — a stone pedestal at the bottom
// of the box with one stone tablo per price range stacked above it, growing upward. Same data as
// `priceRanges` (../price-ranges/PriceRangesElement.tsx); `formatRange` is COPIED from there.
//
// Renders nothing unless the current series is a `price_ranges` series with at least one range.
// Geometry: all px from `box`, anchored at the box's bottom centre; the stack may rise above the
// box top (the registry entry is `unclipped`).

import type { ElementProps } from '../../registry'
import { useLayoutData } from '../../useLayoutData'
import { SIGN_ASSETS, TABLO_BADGE, TABLO_LABEL, TABLO_WIDTH_RATIO } from './assets'
import './PriceSignElement.css'

function formatRange(priceFrom: number, priceTo: number | null): string {
    return priceTo === null ? `$${priceFrom}+` : `$${priceFrom}–$${priceTo}`
}

export function PriceSignElement({ box, element }: ElementProps) {
    const { series, seriesPriceRanges } = useLayoutData()

    if (element.kind !== 'priceSign') return null
    if (series?.kind !== 'price_ranges' || seriesPriceRanges.length === 0) return null

    const { pedestal, tablo } = SIGN_ASSETS
    const rows = seriesPriceRanges.length
    const pedestalW = box.w
    const pedestalH = (pedestalW * pedestal.h) / pedestal.w
    const tabloW = pedestalW * TABLO_WIDTH_RATIO
    const tabloH = (tabloW * tablo.h) / tablo.w
    const fontSize = tabloH * 0.42 * (element.fontScale ?? 1)
    const pedestalTop = box.h - pedestalH

    return (
        <div className="psn-root" style={{ fontSize }}>
            <img
                src={pedestal.src}
                alt=""
                draggable={false}
                className="psn-stone"
                style={{ left: 0, top: pedestalTop, width: pedestalW, height: pedestalH }}
            />
            {seriesPriceRanges.map((r, i) => {
                const top = pedestalTop - (rows - i) * tabloH
                const left = (box.w - tabloW) / 2
                return (
                    <div key={r.id}>
                        <img
                            src={tablo.src}
                            alt=""
                            draggable={false}
                            className="psn-stone"
                            style={{ left, top, width: tabloW, height: tabloH }}
                        />
                        <span
                            className="psn-label"
                            style={{
                                left: left + TABLO_LABEL.x0 * tabloW,
                                width: (TABLO_LABEL.x1 - TABLO_LABEL.x0) * tabloW,
                                top,
                                height: tabloH,
                            }}
                        >
                            {formatRange(r.price_from, r.price_to)}
                        </span>
                        <span
                            className="psn-count"
                            style={{
                                left: left + TABLO_BADGE.x0 * tabloW,
                                width: (TABLO_BADGE.x1 - TABLO_BADGE.x0) * tabloW,
                                top: top + TABLO_BADGE.y0 * tabloH,
                                height: (TABLO_BADGE.y1 - TABLO_BADGE.y0) * tabloH,
                            }}
                        >
                            {r.count}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}

export default PriceSignElement
