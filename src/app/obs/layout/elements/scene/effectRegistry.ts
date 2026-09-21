// Effect registry (obs-scene-element-plan.md §2.3): maps each `SceneEffect` union member's `id` to
// the component that renders it, and to that layer's z-index inside the scene box (§1.2's layer
// order table). Both tables are typed `Record<SceneEffectId, …>` — a `satisfies`-style
// exhaustiveness check — so adding an id to `SceneEffect` (schema.ts) without an entry in EITHER
// table fails `tsc` right here, mirroring the `registryIdOf`/`KIND_VALIDATORS` `never`/`satisfies`
// idiom used elsewhere in the layout system (ADDING_AN_ELEMENT.md §1).

import type { ComponentType } from 'react'
import type { Box, SceneEffect, SceneEffectId, SceneQuality } from '../../schema'
import type { SceneCueApi } from './sceneCue'
import { SkyEffect } from './effects/sky/SkyEffect'
import { MountainEffect } from './effects/mountain/MountainEffect'
import { CloudsEffect } from './effects/clouds/CloudsEffect'
import { RainEffect } from './effects/rain/RainEffect'
import { LightningEffect } from './effects/lightning/LightningEffect'
import { BirdsEffect } from './effects/birds/BirdsEffect'

export type EffectProps<E extends SceneEffect = SceneEffect> = {
    box: Box // the element's resolved box, px — the stage (§1.1)
    effect: E
    quality: SceneQuality
    cue: SceneCueApi
}

export const EFFECT_REGISTRY: { [K in SceneEffectId]: ComponentType<EffectProps<Extract<SceneEffect, { id: K }>>> } = {
    sky: SkyEffect,
    mountain: MountainEffect,
    clouds: CloudsEffect,
    rain: RainEffect,
    lightning: LightningEffect,
    birds: BirdsEffect,
}

// §1.2's back-to-front stacking order (0 sky, 10 clouds-far, 20 mountain, 30 clouds-near, 40 birds,
// 50 rain, 60 lightning's flash, 70 the vignette). `clouds` maps to its FAR value here — the table
// only holds one number per id, and the `near` copy of the same effect id needs a HIGHER z than the
// mountain it should sit in front of. SceneElement.tsx bumps a `near`-layer `clouds` effect to 30
// itself rather than this table trying to hold two numbers under one key. The vignette isn't an
// effect at all (no id, no per-instance settings, no enable toggle of its own — it's tied to
// `quality`, not to any one effect being on) so it isn't listed here either; SceneElement.tsx
// renders it directly at z 70. `birds` (iteration 3, §6) sits behind rain/the flash and in front of
// the mountain and near clouds, so flocks read as flying in the middle distance.
export const LAYER_Z: Record<SceneEffectId, number> = {
    sky: 0,
    clouds: 10,
    mountain: 20,
    birds: 40,
    rain: 50,
    lightning: 60,
}
