'use client'

// Settings for the `results` element (obs-layout-plan.md §2.3). Column count and sort order —
// the tier ramp, palette and heading it took from overlay-1f-spec.md are deliberately fixed, so
// every channel's results screen reads the same way.
//
// Like the other settings components this mutates the element itself via `onPatchElement`
// (ElementsPanel's `mutate` -> debounced `pushConfig`), not a separate backend endpoint.

import type {Element} from '@/app/obs/layout/schema'
import {DEFAULT_COLUMNS, DEFAULT_SORT} from '@/app/obs/layout/elements/results/ResultsElement'
import type {PatchElement} from './ElementBlock'
import SortButtons from './SortButtons'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
}

export default function ResultsSettings({elementKey, element, onPatchElement}: Props) {
    if (element.kind !== 'results') return null

    const columns = element.columns ?? DEFAULT_COLUMNS
    const sort = element.sort ?? DEFAULT_SORT

    return (
        <div className="d-flex gap-3 flex-wrap">
            <div className="mb-2">
                <label className="form-label mb-0 small">Columns</label>
                <input
                    type="number"
                    min={1}
                    className="form-control form-control-sm"
                    style={{width: '90px'}}
                    value={columns}
                    onChange={(e) =>
                        onPatchElement(elementKey, {columns: Math.max(1, parseInt(e.target.value, 10) || 1)})
                    }
                />
            </div>
            <SortButtons value={sort} onChange={(next) => onPatchElement(elementKey, {sort: next})}/>
        </div>
    )
}
