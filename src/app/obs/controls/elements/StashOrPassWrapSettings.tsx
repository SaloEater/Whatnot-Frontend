'use client'

// Settings for `animation:stashOrPassWrap` (obs-layout-plan.md §2.2): which element it wraps
// (default: the first board), how far the bands sit from that element's box, how thick they are,
// how fast the orbit marquee scrolls, and the entrance's hold beat duration — spec §7.1 calls the
// 220ms hold "the single most likely timing to be wrong," so it has to be tunable here rather
// than baked into a redeploy. No auto-dismiss setting: the orbit runs until the operator toggles
// `stash_or_pass` off from the Actions strip. Like FrameSettings, this mutates the element itself
// via `onPatchElement` rather than a separate backend endpoint.

import { useEffect, useState } from 'react'
import type { Element, LayoutConfig } from '@/app/obs/layout/schema'
import { REGISTRY, registryIdOf } from '@/app/obs/layout/registry'
import {
    DEFAULT_LANE_FONT,
    DEFAULT_HOLD_MS,
    DEFAULT_PAD,
    DEFAULT_SPEED,
} from '@/app/obs/layout/elements/animation/StashOrPassWrap'
import type { PatchElement } from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    config: LayoutConfig
    onPatchElement: PatchElement
}

export default function StashOrPassWrapSettings({ elementKey, element, config, onPatchElement }: Props) {
    // Narrowed here rather than via an early return so the hooks below stay unconditional
    // (rules-of-hooks): this component is only mounted for `animation` elements anyway.
    const anim = element.kind === 'animation' ? element : null

    // Target choices: every other element that has a real box of its own (hasBox) — a boxless
    // element (including this one, and any other wrap) has nothing to glue to.
    const targetChoices = Object.entries(config.elements).filter(
        ([key, el]) => key !== elementKey && REGISTRY[registryIdOf(el)].hasBox
    )

    const pad = anim?.pad ?? DEFAULT_PAD
    // Pad is allowed to be NEGATIVE (bands sit inside the target's box, overlapping it) — the
    // schema and validator have always permitted it. It is edited through a draft string because
    // a lone "-" parses to NaN: committing that as 0 on every keystroke made a minus sign
    // impossible to type, which is what made negatives look unsupported.
    const [padDraft, setPadDraft] = useState(String(pad))
    useEffect(() => {
        setPadDraft(String(pad))
    }, [pad])

    if (!anim) return null

    function commitPad(raw: string) {
        const parsed = parseInt(raw, 10)
        if (Number.isFinite(parsed)) {
            onPatchElement(elementKey, { pad: parsed })
        } else {
            setPadDraft(String(pad)) // '' or a bare '-' — snap back rather than write a bad value
        }
    }
    const laneFontSize = anim.laneFontSize ?? DEFAULT_LANE_FONT
    const speed = anim.speed ?? DEFAULT_SPEED
    const holdMs = anim.holdMs ?? DEFAULT_HOLD_MS

    return (
        <div>
            <div className="mb-2">
                <label className="form-label mb-0 small">Target element</label>
                <select
                    className="form-select form-select-sm"
                    value={anim.target ?? ''}
                    onChange={(e) => onPatchElement(elementKey, { target: e.target.value || undefined })}
                >
                    <option value="">(first board)</option>
                    {targetChoices.map(([key, el]) => (
                        <option key={key} value={key}>
                            {REGISTRY[registryIdOf(el)].label} ({key})
                        </option>
                    ))}
                </select>
            </div>
            <div className="d-flex gap-3 flex-wrap">
                <div className="mb-2">
                    <label className="form-label mb-0 small">Pad</label>
                    <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ width: '90px' }}
                        value={padDraft}
                        title="Distance from the target's box. Negative values pull the bands inside it."
                        onChange={(e) => {
                            setPadDraft(e.target.value)
                            const parsed = parseInt(e.target.value, 10)
                            if (Number.isFinite(parsed)) onPatchElement(elementKey, { pad: parsed })
                        }}
                        onBlur={(e) => commitPad(e.target.value)}
                    />
                </div>
                <div className="mb-2">
                    <label className="form-label mb-0 small">Lane font size (px)</label>
                    <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ width: '100px' }}
                        value={laneFontSize}
                        onChange={(e) => onPatchElement(elementKey, { laneFontSize: parseInt(e.target.value) || 0 })}
                    />
                </div>
                <div className="mb-2">
                    <label className="form-label mb-0 small">Marquee speed (px/s)</label>
                    <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ width: '110px' }}
                        value={speed}
                        onChange={(e) => onPatchElement(elementKey, { speed: parseInt(e.target.value) || 0 })}
                    />
                </div>
                <div className="mb-2">
                    <label className="form-label mb-0 small">Hold (ms)</label>
                    <input
                        type="number"
                        className="form-control form-control-sm"
                        style={{ width: '100px' }}
                        value={holdMs}
                        onChange={(e) => onPatchElement(elementKey, { holdMs: parseInt(e.target.value) || 0 })}
                    />
                </div>
            </div>
        </div>
    )
}
