// Pure row-packing geometry for the `cards` registry element (obs-layout-plan.md §2.8). Lifted
// out of channel/[id]/photos/page.tsx's inline ~300 lines (packList/packRowsWithHeight/
// centerByPrice + the smoothing loop) so it takes an explicit width/height budget instead of
// closing over that page's module-level VIEWPORT_W/H constants — that is what lets CardsElement.tsx
// derive the same layout from its `box` instead of a hardcoded 1080x1920 viewport, and what makes
// this testable in isolation. No React, no DOM — `getAspect` is handed in so the caller's own
// (stateful) aspect-ratio cache stays outside this module.
//
// packList exhaustively tries every row count instead of binary-searching a single greedy row
// height: each additional full-width row is a large discrete height jump, so picking a row count
// by height alone (the old approach) often leaves 40-60% of the budget empty when one more/fewer
// row would have filled it far better. Trying every count and keeping the one with the greatest
// total card area after scaling is only O(n^2) for the list sizes this element handles (~30 cards)
// and guarantees the best fill for this "ascending count, centered, most-expensive-row-on-top"
// distribution shape. When a candidate is width-bound (rows narrower than areaWidth), the existing
// `.crd-row` `justify-content: center` centers it — no extra centering logic is needed here.

import type { Photo } from '@/app/entity/entities'

export type PackedRow = {
    photos: Photo[]
    rowHeight: number
    widths: number[]
    cardHeights: number[]
    rotated?: boolean
}

export type GetAspect = (photo: Photo) => number

/**
 * Interleave a price-sorted list around its center so the most expensive card sits in the middle
 * of the row and price descends symmetrically outward (…5 3 1 2 4…).
 */
export function centerByPrice(cards: Photo[]): Photo[] {
    const sorted = [...cards].sort((a, b) => b.price - a.price)
    const result = new Array<Photo>(sorted.length)
    const center = Math.floor(sorted.length / 2)
    sorted.forEach((card, i) => {
        if (i % 2 === 0) result[center + i / 2] = card
        else              result[center - Math.ceil(i / 2)] = card
    })
    return result
}

function totalHeight(rows: Array<{ rowHeight: number }>): number {
    return rows.reduce((s, r) => s + r.rowHeight, 0)
}

/**
 * Packs `list` (price-desc) into rows for every row count from 1 to list.length and keeps the
 * layout with the greatest total card area, biasing fewer cards (taller cards) toward the top row.
 *
 * For a given row count r, counts ascend top→bottom (fewest cards on the expensive top row, at
 * most 1 apart between adjacent rows) by splitting list.length into r near-equal buckets. Each
 * row is sized to span `areaWidth` (capped at half the height budget), the whole candidate is then
 * scaled down uniformly if it overflows `budget`, and its post-scale card area is the score. Trying
 * every r this way — rather than searching for one greedy row height and only ever scaling down —
 * catches the row count that actually fills the budget best, since one more/fewer full-width row is
 * too large a height jump for a single greedy search to land on optimally.
 */
export function packList(
    list: Photo[],
    budget: number,
    areaWidth: number,
    getAspect: GetAspect,
): PackedRow[] {
    if (list.length === 0) return []

    const n = list.length
    let best: PackedRow[] | null = null
    let bestScore = -Infinity

    for (let r = 1; r <= n; r++) {
        const base = Math.floor(n / r)
        const extra = n % r
        const counts: number[] = []
        for (let i = 0; i < r; i++) counts.push(base + (i >= r - extra ? 1 : 0))

        const rows: PackedRow[] = []
        let idx = 0
        for (const count of counts) {
            const slice = list.slice(idx, idx + count)
            idx += count
            const h = Math.min(
                areaWidth / slice.reduce((s, p) => s + getAspect(p), 0),
                budget * 0.5,
            )
            const centered = centerByPrice(slice)
            rows.push({
                photos: centered,
                rowHeight: h,
                widths: centered.map((p) => h * getAspect(p)),
                cardHeights: centered.map(() => h),
            })
        }

        const scale = Math.min(1, budget / totalHeight(rows))
        const scaled = scale === 1 ? rows : rows.map((row) => ({
            ...row,
            rowHeight: row.rowHeight * scale,
            widths: row.widths.map((w) => w * scale),
            cardHeights: row.cardHeights.map((h) => h * scale),
        }))

        const score = scaled.reduce(
            (s, row) => s + row.widths.reduce((rowArea, w, i) => rowArea + w * row.cardHeights[i], 0),
            0,
        )

        if (score > bestScore) {
            bestScore = score
            best = scaled
        }
    }

    return best as PackedRow[]
}
