// Deterministic per-cell edge-wear randomisation: a global wearSeed combined with a per-cell
// key (via FNV-1a hash) drives a mulberry32 PRNG so each cell gets stable-but-distinct wear.
// Shared module (sport-style-board-plan.md §1): moved out of setup/sport_style/team/ so the team
// playground and the board:sport_style layout element render from the SAME code.

import { PatchStyle } from './PatchCell'
import { fnv1a, mulberry32 } from './prng'

export type WearParams = Pick<PatchStyle,
    'edgeFadeLighten' | 'edgeFadeDesaturate' | 'edgeFadeOpacity' | 'edgeFadeFeather' |
    'edgeGrainFrequency' | 'edgeGrainOctaves' | 'edgeGrainOpacity' | 'edgeGrainScale' |
    'edgeGrainGain' | 'edgeGrainBias'
> & { grainSeed: number }

export function wearParamsFor(seed: number, key: string): WearParams {
    const combined = (fnv1a(key) ^ seed) >>> 0
    const rand = mulberry32(combined)
    const range = (min: number, max: number) => min + rand() * (max - min)
    const rangeInt = (min: number, max: number) => Math.floor(range(min, max + 1))

    return {
        edgeFadeLighten: range(0.2, 0.5),
        edgeFadeDesaturate: range(0.3, 0.7),
        edgeFadeOpacity: range(0.35, 0.7),
        edgeFadeFeather: range(1.5, 5),
        edgeGrainFrequency: range(0.5, 1.3),
        edgeGrainOctaves: rangeInt(1, 3),
        edgeGrainOpacity: range(0.25, 0.6),
        edgeGrainScale: range(0.7, 1.5),
        edgeGrainGain: range(2.5, 4),
        edgeGrainBias: range(1.6, 2.0),
        grainSeed: rangeInt(1, 9999),
    }
}
