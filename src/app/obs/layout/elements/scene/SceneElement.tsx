'use client'

// `scene` registry component (obs-scene-element-plan.md §1/§4) — a layered 2.5D living background:
// sky, drifting clouds, a mountain, later weather/birds (§5/§6). The stage is the element's own
// resolved `box` (§1.1) — no reference resolution, no aspect assumption; the root sets
// `overflow: hidden` so a layer whose `y` pushes it past the box edge is cropped by the box itself,
// never by code, and exposes `--scene-w`/`--scene-h` (the box's own w/h, in px) as CSS custom
// properties for every effect's stylesheet to read instead of any `vw`/`vh`/`rem` unit.
//
// `element.effects` is an ORDERED list (schema.ts's `DEFAULT_SCENE_EFFECTS`/§2.1) mapped through
// `EFFECT_REGISTRY` (§2.3), but the actual PAINT order is decided by `LAYER_Z`, not array order —
// an operator reordering stored effects (or a mirror copying them) should never change what's in
// front of what. A disabled effect is filtered out before mapping, which is what makes "disabling
// an effect unmounts its layer" (§4 Behaviour) true — no effect component ever checks its own
// `enabled` field itself.

import { useEffect, useState } from 'react'
import type { ComponentType, CSSProperties } from 'react'
import type { ElementProps } from '../../registry'
import type { Box, SceneEffect, SceneQuality } from '../../schema'
import { effectiveReactions } from '../../config'
import { useEventActive } from '../../eventActive'
import { useSceneEvent } from '../../sceneEventBus'
import { EFFECT_REGISTRY, LAYER_Z } from './effectRegistry'
import type { EffectProps } from './effectRegistry'
import { SceneCueProvider, useSceneCue } from './sceneCue'
import './SceneElement.css'

type Style = CSSProperties & Record<string, string | number>

function readDevMode(): boolean {
    try {
        return new URLSearchParams(window.location.search).get('dev') === '1'
    } catch {
        return false
    }
}

// `clouds` shares one registry id for both its `far` and `near` layer instances, but §1.2's table
// gives them different z (10 and 30) — LAYER_Z only holds one number per SceneEffectId (see that
// file's comment), so the `near` copy is bumped above the mountain (z 20) here instead.
function layerZ(effect: SceneEffect): number {
    if (effect.id === 'clouds' && effect.layer === 'near') return 30
    return LAYER_Z[effect.id]
}

// obs-scene-element-plan.md §5's "storm" latch: while ON for this element, force rain/lightning on
// with a floor on their intensity/cadence, LAYERED over the stored settings rather than mutating
// `element.effects` — so whatever the operator actually saved is exactly what reappears the moment
// the latch turns off (§5: "when it latches off, stored values apply again"). Effects this element
// doesn't carry a `rain`/`lightning` entry for (shouldn't happen post-migration — config.ts's
// `sanitizeSceneEffects` appends both on load — but guarded anyway) are appended rather than
// dropped, since the whole point is that BOTH end up enabled while the storm is active.
const STORM_MIN_RAIN_INTENSITY = 0.6
const STORM_MAX_LIGHTNING_INTERVAL_SEC = 20

function withStormOverride(effects: SceneEffect[], stormActive: boolean): SceneEffect[] {
    if (!stormActive) return effects

    let sawRain = false
    let sawLightning = false

    const next = effects.map((e): SceneEffect => {
        if (e.id === 'rain') {
            sawRain = true
            return { ...e, enabled: true, intensity: Math.max(e.intensity, STORM_MIN_RAIN_INTENSITY) }
        }
        if (e.id === 'lightning') {
            sawLightning = true
            const stored = e.ambientIntervalSec ?? STORM_MAX_LIGHTNING_INTERVAL_SEC
            return { ...e, enabled: true, ambientIntervalSec: Math.min(stored, STORM_MAX_LIGHTNING_INTERVAL_SEC) }
        }
        return e
    })

    if (!sawRain) next.push({ id: 'rain', enabled: true, intensity: STORM_MIN_RAIN_INTENSITY })
    if (!sawLightning) next.push({ id: 'lightning', enabled: true, ambientIntervalSec: STORM_MAX_LIGHTNING_INTERVAL_SEC })

    return next
}

function SceneLayers({
    elementKey,
    effects,
    quality,
    box,
}: {
    elementKey: string
    effects: SceneEffect[]
    quality: SceneQuality
    box: Box
}) {
    const cue = useSceneCue()

    // `thunder` (obs-scene-element-plan.md §5) is relayed to the lightning effect as a `strike`
    // SceneCue rather than an imperative ref exposed by EFFECT_REGISTRY — this keeps every effect
    // component on the same uniform `{box, effect, quality, cue}` props (§2.3). `useSceneEvent`
    // already filters by this element's own `effectiveReactions` internally (sceneEventBus.tsx), so
    // an element whose `reactions.thunder` is explicitly turned off never gets here.
    useSceneEvent(elementKey, 'thunder', () => {
        cue.emit({ kind: 'strike' })
    })

    const ordered = effects
        .filter((effect) => effect.enabled)
        .map((effect) => ({ effect, z: layerZ(effect) }))
        .sort((a, b) => a.z - b.z)

    return (
        <>
            {ordered.map(({ effect, z }, i) => {
                // EFFECT_REGISTRY is keyed so each entry's component only accepts ITS OWN effect
                // shape (§2.3's mapped type) — indexing it with a plain `effect.id` (not narrowed
                // to one literal) necessarily widens back to a union of incompatible prop types, a
                // known TS limitation for this kind of "correlated union" lookup. One assertion
                // here (rather than scattering `as never`/`as any` at every call site) is the
                // accepted trade-off, same idiom as registry.ts's `toAnimationId`/`as AnimationId`.
                const Component = EFFECT_REGISTRY[effect.id] as ComponentType<EffectProps>
                return (
                    <div key={`${effect.id}-${i}`} className="scene-layer" style={{ zIndex: z }}>
                        <Component box={box} effect={effect} quality={quality} cue={cue} />
                    </div>
                )
            })}
            {/* Fill layer, not a `SceneEffect` (§1.2/§4) — no id, no per-instance settings, tied
                only to `quality` ('reduced' drops it, the one thing §1.4 says it does). */}
            {quality === 'full' && <div className="scene-vignette" style={{ zIndex: 70 }} />}
        </>
    )
}

export function SceneElement({ elementKey, element, box }: ElementProps) {
    // Read after mount, same as ImageBoxElement.tsx: `window` doesn't exist during SSR, and the
    // first client render must match the server's (empty) markup byte for byte.
    const [devMode, setDevMode] = useState(false)
    useEffect(() => {
        setDevMode(readDevMode())
    }, [])

    // `storm` latch (obs-scene-element-plan.md §5/§8): reads the SAME `OverlayState.active`
    // context StashOrPassWrap.tsx's own latching event uses, via `useEventActive` — never a
    // bespoke prop or a second copy of `active`. A hook, so it's called unconditionally (rules of
    // hooks) even on a render this component is about to bail out of below.
    const stormLatched = useEventActive('storm')

    if (element.kind !== 'scene') return null

    const quality = element.quality ?? 'full'
    // `element.reactions` may turn 'storm' off for this particular instance (config.ts's
    // `effectiveReactions`) even though the registry declares scene reacts to it natively.
    const stormActive = stormLatched && effectiveReactions(element).includes('storm')
    const effectiveEffects = withStormOverride(element.effects, stormActive)
    const hasEnabled = effectiveEffects.some((e) => e.enabled)

    const rootStyle: Style = {
        '--scene-w': `${box.w}px`,
        '--scene-h': `${box.h}px`,
    }

    if (!hasEnabled) {
        if (!devMode) return null
        return (
            <div className="scene-root scene-root--empty" style={rootStyle}>
                <div className="scene-empty-label">Scene (nothing enabled)</div>
            </div>
        )
    }

    return (
        <div className="scene-root" style={rootStyle}>
            <SceneCueProvider>
                <SceneLayers elementKey={elementKey} effects={effectiveEffects} quality={quality} box={box} />
            </SceneCueProvider>
        </div>
    )
}

export default SceneElement
