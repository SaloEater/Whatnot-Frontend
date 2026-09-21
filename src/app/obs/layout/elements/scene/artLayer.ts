// Shared sizing helper for `scene` art layers (obs-scene-element-plan.md §1.1/§4): every art layer
// (mountain, clouds, later birds) keeps its own asset aspect ratio and is sized by WIDTH alone —
// `width = box.w` for a single copy, `2 * box.w` for a cloud strip's doubled scroll track — then
// positioned vertically by a 0..100 percentage of `box.h`. Centralised here so no art layer has to
// re-derive the same aspect math, and so iteration 3's birds get it for free.

import type { Box } from '../../schema'
import type { SceneAsset } from './assets'

// Which edge of the rendered layer `yPct` pins: `mountain` anchors its BOTTOM edge (100 = sits on
// the box floor); a `clouds` strip anchors its VERTICAL CENTRE. See schema.ts's `SceneEffect`
// comment for the same rule stated against the config fields.
export type ArtLayerAnchor = 'bottom' | 'centre'

export type ArtLayerStyle = { width: number; height: number; top: number }

/**
 * `widthFactor` is 1 for a single copy (mountain) or 2 for a cloud strip's doubled track (§1.2).
 * Returns px values to apply directly as inline style — nothing here is clipped; if `yPct` pushes
 * the layer past the box edge, the element root's `overflow: hidden` crops it (the operator's
 * choice, not a bug).
 */
export function artLayerStyle(box: Box, asset: SceneAsset, anchor: ArtLayerAnchor, yPct: number, widthFactor = 1): ArtLayerStyle {
    const width = box.w * widthFactor
    const height = width * (asset.h / asset.w)
    const anchorY = (yPct / 100) * box.h
    const top = anchor === 'bottom' ? anchorY - height : anchorY - height / 2
    return { width, height, top }
}
