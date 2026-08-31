// Pure row-packing geometry for the `cards` registry element (obs-layout-plan.md §2.8). Lifted
// out of channel/[id]/photos/page.tsx's inline ~300 lines (packList/packRowsWithHeight/
// centerByPrice + the smoothing loop) so it takes an explicit width/height budget instead of
// closing over that page's module-level VIEWPORT_W/H constants — that is what lets CardsElement.tsx
// derive the same layout from its `box` instead of a hardcoded 1080x1920 viewport, and what makes
// this testable in isolation. No React, no DOM — `getAspect` is handed in so the caller's own
// (stateful) aspect-ratio cache stays outside this module.
//
// Behaviour is byte-for-byte the same algorithm as the old route: binary-search the tallest row
// height that still fits the height budget, reassign row sizes so card counts ascend top→bottom,
// smooth any adjacent-row split that differs by more than one card, then uniformly scale down if
// the reassigned rows still overflow the budget.

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
 * Greedily fills rows of height `rowH` up to `areaWidth`, then sorts the resulting rows by their
 * most expensive card (most expensive row on top).
 */
export function packRowsWithHeight(
    list: Photo[],
    rowH: number,
    areaWidth: number,
    getAspect: GetAspect,
): PackedRow[] {
    const result: PackedRow[] = []
    let i = 0

    while (i < list.length) {
        let totalW = 0
        let j = i

        while (j < list.length) {
            totalW += rowH * getAspect(list[j])
            j++
            if (totalW >= areaWidth) break
        }

        const isLastIncomplete = j >= list.length && totalW < areaWidth
        const scaleFactor = isLastIncomplete ? 1 : areaWidth / totalW
        const h = rowH * scaleFactor
        const centered = centerByPrice(list.slice(i, j))
        result.push({
            photos: centered,
            rowHeight: h,
            widths: centered.map((p) => rowH * getAspect(p) * scaleFactor),
            cardHeights: centered.map(() => h),
        })

        i = j
    }

    const rowMaxPrice = (r: PackedRow) => Math.max(...r.photos.map((p) => p.price))

    return result
        .filter((r) => r.photos.length > 0)
        .sort((a, b) => rowMaxPrice(b) - rowMaxPrice(a))
}

/**
 * Packs `list` into rows that together fit within `budget` px of height and `areaWidth` px of
 * width, biasing fewer cards (taller cards) toward the top row.
 */
export function packList(
    list: Photo[],
    budget: number,
    areaWidth: number,
    getAspect: GetAspect,
): PackedRow[] {
    if (list.length === 0) return []

    let lo = 10, hi = budget
    for (let iter = 0; iter < 24; iter++) {
        const mid = (lo + hi) / 2
        if (totalHeight(packRowsWithHeight(list, mid, areaWidth, getAspect)) <= budget) lo = mid
        else hi = mid
    }
    const greedy = packRowsWithHeight(list, lo, areaWidth, getAspect)

    // Reassign the greedy row sizes so card counts ascend top→bottom: the expensive top rows hold
    // the fewest cards, and every row spans the full width, so fewer cards means visibly taller
    // cards.
    const counts = greedy.map((r) => r.photos.length).sort((a, b) => a - b)

    // Smooth extreme splits (e.g. a leftover row of 2 next to rows of 5): move cards up from the
    // row below until no adjacent pair differs by more than 1. Keeps counts ascending, so 2/5/5/5
    // becomes 3/4/5/5.
    let changed = true
    while (changed) {
        changed = false
        for (let i = 0; i < counts.length - 1; i++) {
            if (counts[i + 1] - counts[i] >= 2) {
                counts[i] += 1
                counts[i + 1] -= 1
                changed = true
            }
        }
    }

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
    if (scale === 1) return rows
    return rows.map((r) => ({
        ...r,
        rowHeight: r.rowHeight * scale,
        widths: r.widths.map((w) => w * scale),
        cardHeights: r.cardHeights.map((h) => h * scale),
    }))
}
