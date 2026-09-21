'use client'

// `mountain` effect (obs-scene-element-plan.md §1.2/§4/§5) — a static `<img>`, sized by width alone
// (`width = box.w`, height from the asset's own aspect via artLayer.ts) and anchored by its BOTTOM
// edge at `effect.y` percent of `box.h` (100 = sits on the box floor). `.scene-mountain`'s
// `transition: top` is what makes a live Y change slide the layer instead of snapping (§4
// Behaviour) — CSS, not a React animation, so it costs nothing beyond the one property.
//
// Iteration 2 (§5) stacks a second `<img>` — `mountain_lit.png`, identical dimensions, same
// `artLayerStyle` position — on top of the base one and subscribes to `flash` SceneCues (published
// by the lightning effect's `flash()`) to pulse its opacity 0 -> strength -> 0 over the same 600 ms
// as the lightning flash itself, so the two visibly sync. Like the lightning effect, this replays a
// CSS keyframe by remounting the lit `<img>` under a bumped key rather than toggling a class on an
// already-mounted node (a finished, non-looping keyframe animation does not replay just because its
// element re-renders) — the peak opacity itself (`strength`) rides a CSS custom property, the same
// technique CloudsEffect.tsx uses for its scroll distance, so a differently-valued flash needs no
// new keyframe rule.

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import type { EffectProps } from '../../effectRegistry'
import type { SceneEffect } from '../../../../schema'
import { SCENE_ASSETS } from '../../assets'
import { artLayerStyle } from '../../artLayer'
import './MountainEffect.css'

type MountainEffectProps = EffectProps<Extract<SceneEffect, { id: 'mountain' }>>

// Same custom-property escape hatch CloudsEffect.tsx uses — CSSProperties' index signature doesn't
// allow arbitrary `--*` keys.
type Style = CSSProperties & Record<string, string | number>

export function MountainEffect({ box, effect, cue }: MountainEffectProps) {
    const asset = SCENE_ASSETS.mountain
    const litAsset = SCENE_ASSETS.mountainLit
    const { width, height, top } = artLayerStyle(box, asset, 'bottom', effect.y)

    // 0 = "never flashed yet" — see LightningEffect.tsx's identical `flashSeq` for why a bumped key
    // (not a toggled class) is what makes the keyframe replay on every subsequent flash.
    const [flashSeq, setFlashSeq] = useState(0)
    const [strength, setStrength] = useState(1)

    useEffect(() => {
        return cue.subscribe((c) => {
            if (c.kind !== 'flash') return
            setStrength(c.strength)
            setFlashSeq((seq) => seq + 1)
        })
    }, [cue])

    const litStyle: Style = { '--scene-mountain-lit-strength': strength }

    return (
        <div className="scene-mountain" style={{ top, width, height }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={asset.src} alt="" className="scene-mountain-img" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                key={flashSeq}
                src={litAsset.src}
                alt=""
                className={`scene-mountain-img scene-mountain-lit-img${flashSeq > 0 ? ' scene-mountain-lit-img--flash' : ''}`}
                style={litStyle}
                draggable={false}
            />
        </div>
    )
}

export default MountainEffect
