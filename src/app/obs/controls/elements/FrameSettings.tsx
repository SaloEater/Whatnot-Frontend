'use client'

// Settings for the `frame:static` element (obs-layout-plan.md §1.7): an image URL (a file under
// `/public`, e.g. `/images/frame/olympus.png`) and an above/below-content toggle that flips the
// element's `z` between 10 and -10. Unlike the widget settings components, this one mutates the
// element itself (via `onPatchElement`, which goes through ElementsPanel's `mutate` -> debounced
// `pushConfig`), not a separate backend endpoint.

import {useEffect, useState} from 'react'
import type {Element} from '@/app/obs/layout/schema'
import type {PatchElement} from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
}

export default function FrameSettings({elementKey, element, onPatchElement}: Props) {
    const image = element.kind === 'frame' ? (element.image ?? '') : ''
    const z = element.z ?? 0
    const above = z >= 0

    const [imageDraft, setImageDraft] = useState(image)

    useEffect(() => {
        setImageDraft(image)
    }, [image])

    function saveImage(value: string) {
        const trimmed = value.trim()
        onPatchElement(elementKey, {image: trimmed || undefined})
    }

    function setAbove(nextAbove: boolean) {
        onPatchElement(elementKey, {z: nextAbove ? 10 : -10})
    }

    return (
        <div>
            <div className="mb-2">
                <label className="form-label mb-0 small">Image URL</label>
                <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="/images/frame/olympus.png"
                    value={imageDraft}
                    onChange={(e) => setImageDraft(e.target.value)}
                    onBlur={(e) => saveImage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
            </div>
            <div className="btn-group btn-group-sm" role="group">
                <button
                    type="button"
                    className={`btn ${above ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setAbove(true)}
                >
                    Above content
                </button>
                <button
                    type="button"
                    className={`btn ${!above ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setAbove(false)}
                >
                    Below content
                </button>
            </div>
        </div>
    )
}
