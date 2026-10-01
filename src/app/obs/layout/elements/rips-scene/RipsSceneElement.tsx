'use client'

// The `ripsScene` registry component (rips-scene-plan.md §5). All the drawing is the shared pure
// renderer in ../../../rips_scene/RipsScene.tsx (also used by /obs/setup/rips_scene); this wrapper
// only turns the element's opaque `recipe` blob into a complete recipe and hands over the box size.
// Reads no layout data (needs.ts: `ripsScene: []`).

import { useMemo } from 'react'
import type { ElementProps } from '../../registry'
import { RipsScene } from '../../../rips_scene/RipsScene'
import { mergeRecipe } from '../../../rips_scene/recipe'

export function RipsSceneElement({ element, box }: ElementProps) {
    const raw = element.kind === 'ripsScene' ? element.recipe : undefined
    const recipe = useMemo(() => mergeRecipe(raw), [raw])
    if (element.kind !== 'ripsScene') return null
    return <RipsScene w={box.w} h={box.h} recipe={recipe} />
}
