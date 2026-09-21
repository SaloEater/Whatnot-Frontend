'use client'

// `clouds` effect (obs-scene-element-plan.md §1.2/§4) — a horizontally-tileable strip scrolled by a
// CSS `translateX` keyframe. `element.effects` may hold two of these (`layer: 'far' | 'near'`, each
// its own independent instance keyed by array index in SceneElement.tsx), one slower/behind the
// mountain and one faster/in front of it (z handled by SceneElement, not here).
//
// Each rendered strip copy is `2 * box.w` wide and the track always holds TWO copies translated
// by exactly one copy-width — the standard doubled-strip infinite scroll: the second copy is
// pixel-identical to the first, so the instant the loop resets to 0 is indistinguishable from
// mid-scroll. `quality: 'reduced'` deliberately does NOT drop to one copy: a single copy wrapping
// on itself is a visible crop-jump (two halves of the same image are not a matched tile edge), and
// the saving is one decoded <img> — not worth a seam. `reduced` affects the vignette and rain
// (§1.4), not this layer.
//
// The loop distance is expressed as `--scene-clouds-mult * var(--scene-w)` (a CSS custom property
// read inside the `@keyframes` rule, CloudsEffect.css) rather than a literal pixel value baked into
// the keyframe, and `animation-duration` is set as a plain inline style (not a custom property) —
// both computed fresh on every render from `box.w`/`effect.speed`, but neither one ever
// changes the CLASS NAME or unmounts anything, so a live speed/Y/box-size change reflows the
// running animation in place instead of restarting or remounting it (§4's "no jump/remount" test).
// (Changing `animation-duration` on a running CSS animation retimes it, keeping its current
// fractional progress, rather than restarting it — standard browser behaviour, not something this
// file has to implement.)

import type { CSSProperties } from 'react'
import type { EffectProps } from '../../effectRegistry'
import type { SceneEffect } from '../../../../schema'
import { CLOUD_LAYER_ASSETS } from '../../assets'
import { artLayerStyle } from '../../artLayer'
import './CloudsEffect.css'

// Same custom-property escape hatch StashOrPassWrap.tsx uses — CSSProperties' index signature
// doesn't allow arbitrary `--*` keys.
type Style = CSSProperties & Record<string, string | number>

type CloudsEffectProps = EffectProps<Extract<SceneEffect, { id: 'clouds' }>>

export function CloudsEffect({ box, effect }: CloudsEffectProps) {
    const asset = CLOUD_LAYER_ASSETS[effect.layer]
    const { width, height, top } = artLayerStyle(box, asset, 'centre', effect.y, 2)

    const copies = 2
    const mult = -2
    const distancePx = Math.abs(mult) * box.w
    const durationSec = distancePx / Math.max(1, effect.speed)

    const rootStyle: Style = { top, opacity: effect.opacity }
    const trackStyle: Style = {
        '--scene-clouds-mult': mult,
        animationDuration: `${durationSec}s`,
    }

    return (
        <div className="scene-clouds" style={rootStyle}>
            <div className="scene-clouds-track" style={trackStyle}>
                {Array.from({ length: copies }, (_, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={i} src={asset.src} alt="" className="scene-clouds-img" style={{ width, height }} draggable={false} />
                ))}
            </div>
        </div>
    )
}

export default CloudsEffect
