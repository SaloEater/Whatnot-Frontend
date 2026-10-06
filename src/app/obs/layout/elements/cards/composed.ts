// Pure geometry for v1 photos (photo-art-label-plan.md §5) — no React/DOM. A v1 photo is drawn as a
// label crop stacked over an art crop, bare or inside a tier frame's hole.
//
// Worked formulas (content width = 1, GAP = 0 — label sits flush on the art, decision 2026-09-30):
//   ratioArt = art.h/art.w ; ratioLabel = label.h/label.w (label absent: term dropped)
//   stackH   = (label ? ratioLabel + GAP : 0) + ratioArt
//   Bare:    aspect = 1 / stackH                       e.g. art 620x780, label 670x160:
//            stackH = 0.2388+0.02+1.2581 = 1.5169 -> aspect 0.6592
//   Framed (source px, bronze hole 76,93,841,1513 on 917x1611):
//            holeW = x2-x1 = 765 ; ml = 76 ; mr = 917-841 = 76 ; mt = 93 ; mb = 1611-1513 = 98
//            minH  = fixedY + 0.6*stretchY  (sums over even/odd bands of asset.y, as frameSlices.ts)
//            contentH = holeW*stackH ; holeH = max(contentH, minH-mt-mb)
//            W = holeW+ml+mr = 917 ; H = holeH+mt+mb ; aspect = W/H
//   Layout in a target box {W,H}: s = W/(holeW+ml+mr); hole = (ml*s, mt*s, holeW*s, H-(mt+mb)*s);
//            stack (width = hole.w) is centred vertically in the hole, label on top, GAP*hole.w between.

import type { Bounds, Photo } from '@/app/entity/entities'
import { FRAME_ASSETS, FrameTier } from './frameAssets'

export const GAP = 0
// TEMPORARY (2026-10-06): hole-height floor disabled. With the 0.6 floor (frameSlices.ts's KMIN) a
// stack shorter than the frame's minimum height — typically a label-less card, whose art alone is
// squatter than the frame's hole — got a hole taller than the photo and showed the fill above and
// below it. At 0 the stretch bands may compress all the way to nothing, so the hole hugs the stack;
// only a stack shorter than the frame's FIXED pieces alone (aspect above ~0.78) would still get a
// gap, and there the frame pieces start to overlap. Restore 0.6 once the frames' stretch bands are
// reworked to tolerate it, or make this a per-element option.
const KMIN = 0

export type Rect = { x: number; y: number; w: number; h: number }

export function isV1(photo: Photo): photo is Photo & { art_bounds: Bounds } {
    return photo.version === 1 && !!photo.art_bounds && photo.art_bounds.w > 0 && photo.art_bounds.h > 0
}

function label(photo: Photo): Bounds | null {
    const l = photo.label_bounds
    return l && l.w > 0 && l.h > 0 ? l : null
}

/** Stack height at content width 1. */
export function stackHeight(photo: Photo & { art_bounds: Bounds }): number {
    const l = label(photo)
    return (l ? l.h / l.w + GAP : 0) + photo.art_bounds.h / photo.art_bounds.w
}

function frameMetrics(tier: FrameTier) {
    const a = FRAME_ASSETS[tier]
    const { x1, y1, x2, y2 } = a.hole
    let fixedY = 0
    let stretchY = 0
    for (let b = 0; b < 7; b++) {
        const len = a.y[b + 1] - a.y[b]
        if (b % 2 === 0) fixedY += len
        else stretchY += len
    }
    return {
        holeW: x2 - x1, ml: x1, mr: a.w - x2, mt: y1, mb: a.h - y2,
        minH: fixedY + KMIN * stretchY,
    }
}

/** Outer aspect (w/h) of the composed card; `tier` null = bare. */
export function composedAspect(photo: Photo & { art_bounds: Bounds }, tier: FrameTier | null): number {
    const stackH = stackHeight(photo)
    if (!tier) return 1 / stackH
    const m = frameMetrics(tier)
    const holeH = Math.max(m.holeW * stackH, m.minH - m.mt - m.mb)
    return (m.holeW + m.ml + m.mr) / (holeH + m.mt + m.mb)
}

export type ComposedLayout = {
    s: number // frame scale (source px -> target px); 1 when bare
    hole: Rect // target px
    label: Rect | null
    art: Rect
}

/** Target-px layout for a box {W,H} whose aspect came from `composedAspect`. */
export function composedLayout(
    photo: Photo & { art_bounds: Bounds },
    tier: FrameTier | null,
    W: number,
    H: number,
): ComposedLayout {
    let s = 1
    let hole: Rect = { x: 0, y: 0, w: W, h: H }
    if (tier) {
        const m = frameMetrics(tier)
        s = W / (m.holeW + m.ml + m.mr)
        hole = { x: m.ml * s, y: m.mt * s, w: m.holeW * s, h: Math.max(H - (m.mt + m.mb) * s, 0) }
    }
    const stackH = stackHeight(photo)
    const contentH = hole.w * stackH
    let y = hole.y + (hole.h - contentH) / 2
    const l = label(photo)
    let labelRect: Rect | null = null
    if (l) {
        const lh = hole.w * (l.h / l.w)
        labelRect = { x: hole.x, y, w: hole.w, h: lh }
        y += lh + GAP * hole.w
    }
    const art: Rect = { x: hole.x, y, w: hole.w, h: hole.w * (photo.art_bounds.h / photo.art_bounds.w) }
    return { s, hole, label: labelRect, art }
}
