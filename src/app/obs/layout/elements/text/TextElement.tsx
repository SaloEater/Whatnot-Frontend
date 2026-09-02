'use client'

// The `text` registry component (obs-layout-plan.md §2.12) — free-form operator text, centred on
// both axes in its box. ElementFrame (../../[id]/ElementFrame.tsx) already sizes and clips this
// component's root to the element's box, so it only ever needs to fill 100%/100% of that root.
//
// `fontSize` is absolute canvas px, NOT derived from `box`. Deliberate (see the plan): the circle
// widgets and resultsThin size their text off `box`/their own settings because they are
// fixed-content readouts with a known shape; this holds arbitrary operator text sized by eye on a
// fixed 1080x1920 canvas, where an absolute px is exactly what "set a font size" means. The
// consequence — shrinking the box does not shrink the type, so text can overflow it — is called
// out in the plan as an accepted trade-off, revisited later with an auto-shrink clamp if needed.
//
// Renders nothing when there is no text, so an empty text box never leaves a stray flex container
// (or hit-testable area) sitting on the canvas.

import type { ElementProps } from '../../registry'
import './TextElement.css'

// Registry default (registry.ts `makeElement()` leaves `fontSize` unset on a freshly-added text
// element so this default applies) — also imported by TextSettings.tsx so the controls UI shows
// the same number a brand-new element actually renders at.
export const DEFAULT_FONT_SIZE = 64

export function TextElement({ element }: ElementProps) {
    if (element.kind !== 'text') return null

    const text = element.text ?? ''
    if (text.length === 0) return null

    const fontSize = element.fontSize ?? DEFAULT_FONT_SIZE

    return (
        <div className="txt-root">
            <div className="txt-text" style={{ fontSize }}>
                {text}
            </div>
        </div>
    )
}

export default TextElement
