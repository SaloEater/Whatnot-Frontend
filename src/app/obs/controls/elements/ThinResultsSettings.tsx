'use client'

// Settings for `resultsThin` (obs-layout-plan.md §2.4): Columns, Text size (px), Icon size (px),
// and Sort (Alphabetical / By customer). Like FrameSettings/StashOrPassWrapSettings, this mutates
// the element itself via `onPatchElement` (ElementsPanel's `mutate` -> debounced `pushConfig`),
// not a separate backend endpoint — `columns`/`textSize`/`iconSize`/`sort` all live on the
// element in LayoutConfig.

import type {Element} from '@/app/obs/layout/schema'
import {
    DEFAULT_COLUMNS,
    DEFAULT_ICON_SIZE,
    DEFAULT_SORT,
    DEFAULT_TEXT_SIZE,
} from '@/app/obs/layout/elements/results-thin/ThinResults'
import type {PatchElement} from './ElementBlock'
import SortButtons from './SortButtons'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
}

export default function ThinResultsSettings({elementKey, element, onPatchElement}: Props) {
    if (element.kind !== 'resultsThin') return null

    const columns = element.columns ?? DEFAULT_COLUMNS
    const textSize = element.textSize ?? DEFAULT_TEXT_SIZE
    const iconSize = element.iconSize ?? DEFAULT_ICON_SIZE
    const sort = element.sort ?? DEFAULT_SORT

    return (
        <div className="d-flex gap-3 flex-wrap">
            <div className="mb-2">
                <label className="form-label mb-0 small">Columns</label>
                <input
                    type="number"
                    min={1}
                    step={1}
                    className="form-control form-control-sm"
                    style={{width: '90px'}}
                    value={columns}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        onPatchElement(elementKey, {columns: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1})
                    }}
                />
            </div>
            <div className="mb-2">
                <label className="form-label mb-0 small">Text size (px)</label>
                <input
                    type="number"
                    min={1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={textSize}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        onPatchElement(elementKey, {textSize: Number.isFinite(parsed) && parsed > 0 ? parsed : 1})
                    }}
                />
            </div>
            <div className="mb-2">
                <label className="form-label mb-0 small">Icon size (px)</label>
                <input
                    type="number"
                    min={1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={iconSize}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        onPatchElement(elementKey, {iconSize: Number.isFinite(parsed) && parsed > 0 ? parsed : 1})
                    }}
                />
            </div>
            <SortButtons value={sort} onChange={(next) => onPatchElement(elementKey, {sort: next})}/>
        </div>
    )
}
