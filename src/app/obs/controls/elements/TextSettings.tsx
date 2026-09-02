'use client'

// Settings for `text` (obs-layout-plan.md §2.12): a multi-line textarea for the text and a number
// input for font size (absolute canvas px). Like FrameSettings/ThinResultsSettings, this mutates
// the element itself via `onPatchElement` (ElementsPanel's `mutate` -> debounced `pushConfig`) —
// the config path already pushes to OBS, so no `useSettingWrite` here (that hook is for settings
// that live on the BACKEND, not inside LayoutConfig).

import { useEffect, useState } from 'react'
import type { Element } from '@/app/obs/layout/schema'
import { MAX_TEXT_LENGTH } from '@/app/obs/layout/schema'
import { DEFAULT_FONT_SIZE } from '@/app/obs/layout/elements/text/TextElement'
import type { PatchElement } from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
}

export default function TextSettings({ elementKey, element, onPatchElement }: Props) {
    // Narrowed into a local rather than an early return so the hooks below stay unconditional
    // (rules-of-hooks); this panel is only ever mounted for a `text` element anyway.
    const txt = element.kind === 'text' ? element : null
    const savedText = txt?.text ?? ''

    // The textarea is a DRAFT, committed by Save. Every other setting in this panel — and in every
    // other panel — saves as you type, but typing prose is not the same as nudging a number: each
    // keystroke would be a config push and a bus emit to OBS, and the overlay would show the text
    // being typed a character at a time. Font size keeps the save-as-you-type behaviour.
    const [draft, setDraft] = useState(savedText)
    // Re-seed when the stored value changes underneath (another session, an undo, a preset).
    useEffect(() => {
        setDraft(savedText)
    }, [savedText])

    if (!txt) return null

    const fontSize = txt.fontSize ?? DEFAULT_FONT_SIZE
    const dirty = draft !== savedText

    return (
        <div className="d-flex flex-column gap-2">
            <div>
                <label className="form-label mb-0 small">Text</label>
                <textarea
                    className="form-control form-control-sm"
                    rows={3}
                    maxLength={MAX_TEXT_LENGTH}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                />
                <div className="d-flex align-items-center gap-2 mt-1">
                    <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={!dirty}
                        onClick={() => onPatchElement(elementKey, { text: draft })}
                    >
                        Save
                    </button>
                    {dirty && (
                        <button
                            type="button"
                            className="btn btn-sm btn-link p-0"
                            onClick={() => setDraft(savedText)}
                        >
                            Discard
                        </button>
                    )}
                    {dirty && <span className="text-warning small">Unsaved</span>}
                </div>
            </div>
            <div>
                <label className="form-label mb-0 small">Font size (px)</label>
                <input
                    type="number"
                    min={1}
                    step={1}
                    className="form-control form-control-sm"
                    style={{ width: '100px' }}
                    value={fontSize}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        onPatchElement(elementKey, { fontSize: Number.isFinite(parsed) && parsed > 0 ? parsed : 1 })
                    }}
                />
            </div>
        </div>
    )
}
