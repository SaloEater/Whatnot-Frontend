'use client'

// `sky` effect (obs-scene-element-plan.md §1.2/§4) — the back-most fill layer (z 0). Three stacked
// gradient divs, one per mood; only the active one is at opacity 1, and every one of them carries
// `transition: opacity 1.5s`, so switching `effect.mood` live crossfades instead of snapping (§4
// Behaviour). All three are always mounted (never conditionally rendered) — that IS what makes the
// transition fire on a mood change instead of one gradient popping in fresh at opacity 1.

import type { EffectProps } from '../../effectRegistry'
import type { SceneEffect } from '../../../../schema'
import { SKY_MOODS } from '../../../../schema'
import './SkyEffect.css'

type SkyEffectProps = EffectProps<Extract<SceneEffect, { id: 'sky' }>>

export function SkyEffect({ effect }: SkyEffectProps) {
    return (
        <div className="scene-sky">
            {SKY_MOODS.map((mood) => (
                <div
                    key={mood}
                    className={`scene-sky-layer scene-sky-layer--${mood}${effect.mood === mood ? ' scene-sky-layer--active' : ''}`}
                />
            ))}
        </div>
    )
}

export default SkyEffect
