// Pure geometry for the card tier frames (card-frames-plan.md §3) — no React/DOM. A frame image is
// cut into a 7x7 grid by 8 cuts per axis; even bands (0,2,4,6) keep their proportions, odd bands
// (1,3,5) absorb the difference between the source and the target box. The 25 inner cells (i and j
// both 1..5) are the hole where the card shows through, leaving 24 pieces.

import type { FrameAsset } from './frameAssets'

export type FramePiece = {
    left: number; top: number; width: number; height: number // target px
    sx: number; sy: number; sw: number; sh: number // source rect, px
}

// Floor on how far a stretch band may shrink relative to the source, so the side panels never collapse.
const KMIN = 0.6

/** Target boundaries (whole px, first 0, last `total`) for one axis. */
function axisBounds(cuts: number[], total: number, s: number): number[] {
    let fixed = 0
    let stretch = 0
    for (let b = 0; b < 7; b++) {
        const len = cuts[b + 1] - cuts[b]
        if (b % 2 === 0) fixed += len
        else stretch += len
    }
    const room = Math.max(total - fixed * s, 0)
    const out = [0]
    let pos = 0
    for (let b = 0; b < 7; b++) {
        const len = cuts[b + 1] - cuts[b]
        pos += b % 2 === 0 ? len * s : stretch > 0 ? (room * len) / stretch : 0
        out.push(b === 6 ? total : Math.round(pos))
    }
    return out
}

/** Source-px → target-px scale of the frame in a `width`×`height` box; `scale` (composed v1 path) overrides the fit-to-box rule. */
export function frameScale(asset: FrameAsset, width: number, height: number, scale?: number): number {
    const sum = (cuts: number[], parity: number) => {
        let t = 0
        for (let b = 0; b < 7; b++) if (b % 2 === parity) t += cuts[b + 1] - cuts[b]
        return t
    }
    return scale ?? Math.min(
        width / (sum(asset.x, 0) + KMIN * sum(asset.x, 1)),
        height / (sum(asset.y, 0) + KMIN * sum(asset.y, 1)),
    )
}

/** The hole's bounding box in target px — the area the frame's rails do NOT cover (its chamfered corners do). */
export function frameHole(asset: FrameAsset, width: number, height: number, scale?: number): { left: number; top: number; width: number; height: number } {
    const s = frameScale(asset, width, height, scale)
    const ml = asset.hole.x1 * s
    const mt = asset.hole.y1 * s
    const mr = (asset.w - asset.hole.x2) * s
    const mb = (asset.h - asset.hole.y2) * s
    return { left: ml, top: mt, width: Math.max(width - ml - mr, 0), height: Math.max(height - mt - mb, 0) }
}

export function frameSlices(asset: FrameAsset, width: number, height: number, scale?: number): FramePiece[] {
    const { x, y } = asset
    const s = frameScale(asset, width, height, scale)
    const tx = axisBounds(x, width, s)
    const ty = axisBounds(y, height, s)

    const pieces: FramePiece[] = []
    for (let j = 0; j < 7; j++) {
        for (let i = 0; i < 7; i++) {
            if (i >= 1 && i <= 5 && j >= 1 && j <= 5) continue
            const w = tx[i + 1] - tx[i]
            const h = ty[j + 1] - ty[j]
            if (w <= 0 || h <= 0) continue
            pieces.push({
                left: tx[i], top: ty[j], width: w, height: h,
                sx: x[i], sy: y[j], sw: x[i + 1] - x[i], sh: y[j + 1] - y[j],
            })
        }
    }
    return pieces
}
