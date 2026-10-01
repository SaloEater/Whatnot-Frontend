'use client'

// Settings for `ripsScene` (rips-scene-plan.md §6): one paste-JSON field carrying the scene recipe
// exported by /obs/setup/rips_scene — the same copy/paste approach SportStyleBoardSettings.tsx uses
// for `turf`/`patch`. Goes through `onPatchElement` (layout config, which already pushes to OBS), so
// there is no `useSettingWrite` here. Apply only checks "valid JSON object"; the component's
// mergeRecipe() copes with anything odd.

import type {Element} from '@/app/obs/layout/schema'
import {DEFAULT_RIPS_RECIPE} from '@/app/obs/rips_scene/recipe'
import type {PatchElement} from './ElementBlock'
import {JsonField, isCustomBlob} from './JsonField'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
}

export default function RipsSceneSettings({elementKey, element, onPatchElement}: Props) {
    if (element.kind !== 'ripsScene') return null

    return (
        <div>
            <details className="mb-2">
                <summary className="small">
                    Scene recipe ({isCustomBlob(element.recipe, DEFAULT_RIPS_RECIPE) ? 'custom' : 'default'})
                </summary>
                <JsonField
                    label="Scene recipe (JSON)"
                    value={element.recipe}
                    defaultValue={DEFAULT_RIPS_RECIPE}
                    onApply={(parsed) => onPatchElement(elementKey, {recipe: parsed})}
                />
            </details>
            <div className="d-flex align-items-center gap-3">
                <a className="small" href="/obs/setup/rips_scene" target="_blank" rel="noreferrer">
                    Open setup page
                </a>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => onPatchElement(elementKey, {recipe: undefined})}
                >
                    Reset to default
                </button>
            </div>
        </div>
    )
}
