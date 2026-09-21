'use client'

// Settings for `ticker` (obs-ticker-plan.md §6) — the ticker's OWN line settings (separator/font
// size/speed/direction) via `onPatchElement` (same push-to-OBS path as TextSettings/PriceSignSettings
// — the config path already pushes to OBS, so nothing here uses `useSettingWrite`), plus six
// per-widget slot cards (enabled/label/colours, also via `onPatchElement`) that each MOUNT that
// widget's EXISTING settings panel — Pick2Settings, StashOrPassSettings, NameSettings,
// BoxesPerBreakSettings, CountSettings. Importing those is correct here: they are controls
// components, not element components, so ADDING_AN_ELEMENT.md's copy-not-import rule (which covers
// ported ELEMENT code under `layout/elements/`) does not apply — mounting means the ticker's
// "Price" field literally IS the pick2 widget's own field (one backend value, one cue), with no
// drift possible between the two. CountSettings is shared by boxesLeft/chasersLeft (one Used Cards
// editor, not two competing local states) — mounted once under chasersLeft's card, with a one-line
// note under boxesLeft's pointing there.
//
// The DEFAULT_* constants are imported from TickerElement.tsx so the panel shows the same values a
// brand-new element renders at (same as TextSettings.tsx importing TextElement.tsx's
// DEFAULT_FONT_SIZE).
//
// This panel must NOT call useLayoutData(): the controls page is not wrapped in a
// <LayoutDataProvider> (only the layout page is), so the hook throws during render. That is why
// each slot's preview chip shows a fixed SAMPLE value, not live data — it previews the slot's label
// text and colours. The real current values are visible in the embedded widget panels below it.

import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { DurableCue, Element, TickerDirection, TickerSlot, WidgetId } from '@/app/obs/layout/schema'
import { TICKER_DIRECTIONS, WIDGET_IDS } from '@/app/obs/layout/schema'
import {
    DEFAULT_LABEL_COLOR,
    DEFAULT_TICKER_DIRECTION,
    DEFAULT_TICKER_FONT_SIZE,
    DEFAULT_TICKER_LABELS,
    DEFAULT_TICKER_SEPARATOR,
    DEFAULT_TICKER_SPEED,
    DEFAULT_VALUE_COLOR,
    DEFAULT_SHOW_PCT_MIN,
} from '@/app/obs/layout/elements/ticker/TickerElement'
import Pick2Settings from './Pick2Settings'
import StashOrPassSettings from './StashOrPassSettings'
import NameSettings from './NameSettings'
import BoxesPerBreakSettings from './BoxesPerBreakSettings'
import CountSettings from './CountSettings'
import type { PatchElement } from './ElementBlock'

type Props = {
    channelId: number
    seriesId?: number | null
    elementKey: string
    element: Element
    onPatchElement: PatchElement
    onFireCue?: (cue: DurableCue) => void
}

const DIRECTION_LABELS: Record<TickerDirection, string> = { left: 'Left', right: 'Right' }

// Uncontrolled `<input type="color">` that commits only on the native `change` event (fires once,
// when the picker closes) rather than React's `onChange`, which for this input type is normalized
// from the native `input` event and would fire on every drag frame inside the picker — the same
// "commit on close, not per keystroke/drag" reasoning TextSettings.tsx applies to its textarea, just
// via a native listener since React has no `onChange`-vs-`onInput` distinction for this element type.
// `key={value}` on the caller side remounts it (re-seeding `defaultValue`) whenever the committed
// value changes from elsewhere (another session, an undo).
function ColorField({ value, onCommit }: { value: string; onCommit: (next: string) => void }) {
    const ref = useRef<HTMLInputElement | null>(null)
    useEffect(() => {
        const el = ref.current
        if (!el) return
        function handleChange() {
            if (el) onCommit(el.value)
        }
        el.addEventListener('change', handleChange)
        return () => el.removeEventListener('change', handleChange)
    }, [onCommit])

    return (
        <input
            ref={ref}
            type="color"
            className="form-control form-control-color form-control-sm"
            defaultValue={value}
        />
    )
}

// Sample values for the preview chip (see header: no live data in the controls page).
const SAMPLE_VALUES: Record<WidgetId, string> = {
    pick2: '$15',
    stashorpass: '$10',
    name: 'Series name',
    boxesPerBreak: '6',
    boxesLeft: '24',
    chasersLeft: '3 / 25%', // with the percentage, so the "/" colour is previewed
}

function TickerSlotCard({
    widgetId,
    slot,
    onToggle,
    onLabelCommit,
    onLabelColor,
    onValueColor,
    onSlashColor,
    onShowPctMin,
    children,
}: {
    widgetId: WidgetId
    slot: TickerSlot
    onToggle: (enabled: boolean) => void
    onLabelCommit: (label: string) => void
    onLabelColor: (color: string) => void
    onValueColor: (color: string) => void
    // chasersLeft only; omitted for every other slot, which hides the picker.
    onSlashColor?: (color: string) => void
    // chasersLeft only, like onSlashColor.
    onShowPctMin?: (value: number) => void
    children: ReactNode
}) {
    const defaultLabel = DEFAULT_TICKER_LABELS[widgetId]
    const label = slot.label || defaultLabel
    const labelColor = slot.labelColor ?? DEFAULT_LABEL_COLOR
    const valueColor = slot.valueColor ?? DEFAULT_VALUE_COLOR
    const slashColor = slot.slashColor ?? valueColor

    // Draft-then-commit label (TextSettings.tsx's convention): typing a label is prose, not a
    // number nudge, so it saves on blur/Enter rather than per keystroke.
    const savedLabel = slot.label ?? ''
    const [labelDraft, setLabelDraft] = useState(savedLabel)
    useEffect(() => setLabelDraft(savedLabel), [savedLabel])

    function commitLabel() {
        if (labelDraft !== savedLabel) onLabelCommit(labelDraft)
    }

    const switchId = `tkr-slot-enabled-${widgetId}`

    return (
        <div className="card" style={{ opacity: slot.enabled ? 1 : 0.6 }}>
            <div className="card-body py-2">
                <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <div className="form-check form-switch mb-0">
                        <input
                            type="checkbox"
                            className="form-check-input"
                            id={switchId}
                            checked={slot.enabled}
                            onChange={(e) => onToggle(e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor={switchId}>
                            {defaultLabel}
                        </label>
                    </div>
                    <span className="badge text-bg-dark border" style={{ borderColor: labelColor }} title="Preview with a sample value">
                        <span style={{ color: labelColor }}>{label}: </span>
                        {widgetId === 'chasersLeft' ? (
                            <>
                                <span style={{ color: valueColor }}>3</span>
                                <span style={{ color: slashColor }}> / </span>
                                <span style={{ color: valueColor }}>25%</span>
                            </>
                        ) : (
                            <span style={{ color: valueColor }}>{SAMPLE_VALUES[widgetId]}</span>
                        )}
                    </span>
                </div>

                <div className="d-flex flex-wrap align-items-end gap-3 mt-2">
                    <div>
                        <label className="form-label mb-0 small">Label</label>
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            style={{ width: '160px' }}
                            placeholder={defaultLabel}
                            maxLength={40}
                            value={labelDraft}
                            onChange={(e) => setLabelDraft(e.target.value)}
                            onBlur={commitLabel}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitLabel()
                            }}
                        />
                    </div>
                    <div>
                        <label className="form-label mb-0 small d-block">Label colour</label>
                        <ColorField key={labelColor} value={labelColor} onCommit={onLabelColor} />
                    </div>
                    <div>
                        <label className="form-label mb-0 small d-block">Value colour</label>
                        <ColorField key={valueColor} value={valueColor} onCommit={onValueColor} />
                    </div>
                    {onSlashColor && (
                        <div>
                            <label className="form-label mb-0 small d-block" title='The "/" in "3 / 25%". Shown only when the percentage is.'>
                                &quot;/&quot; colour
                            </label>
                            <ColorField key={slashColor} value={slashColor} onCommit={onSlashColor} />
                        </div>
                    )}
                    {onShowPctMin && (
                        <div>
                            <label
                                className="form-label mb-0 small d-block"
                                title="Below this percentage only the card count is shown. Also needs Show percentage on (below)."
                            >
                                Show % from
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={100}
                                step={1}
                                className="form-control form-control-sm"
                                style={{ width: '80px' }}
                                value={slot.showPctMin ?? DEFAULT_SHOW_PCT_MIN}
                                onChange={(e) => {
                                    const parsed = parseInt(e.target.value, 10)
                                    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) onShowPctMin(parsed)
                                }}
                            />
                        </div>
                    )}
                </div>

                <div className="mt-2">{children}</div>
            </div>
        </div>
    )
}

export default function TickerSettings({ channelId, seriesId, elementKey, element, onPatchElement, onFireCue }: Props) {
    const tk = element.kind === 'ticker' ? element : null

    const separator = tk?.separator ?? DEFAULT_TICKER_SEPARATOR
    const fontSize = tk?.fontSize ?? DEFAULT_TICKER_FONT_SIZE
    const speed = tk?.speed ?? DEFAULT_TICKER_SPEED
    const direction = tk?.direction ?? DEFAULT_TICKER_DIRECTION

    // Draft-then-commit separator (TextSettings.tsx's convention — same reasoning as the slot
    // labels above).
    const [separatorDraft, setSeparatorDraft] = useState(separator)
    useEffect(() => setSeparatorDraft(separator), [separator])

    function commitSeparator() {
        if (separatorDraft !== separator) onPatchElement(elementKey, { separator: separatorDraft })
    }

    if (!tk) return null

    function patchSlot(id: WidgetId, patch: Partial<TickerSlot>) {
        onPatchElement(elementKey, { slots: { ...tk!.slots, [id]: { ...tk!.slots[id], ...patch } } })
    }

    return (
        <div className="d-flex flex-column gap-3">
            <div className="d-flex flex-wrap align-items-end gap-3">
                <div>
                    <label className="form-label mb-0 small">Separator</label>
                    <input
                        type="text"
                        className="form-control form-control-sm"
                        style={{ width: '140px' }}
                        value={separatorDraft}
                        onChange={(e) => setSeparatorDraft(e.target.value)}
                        onBlur={commitSeparator}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') commitSeparator()
                        }}
                    />
                </div>
                <div>
                    <label className="form-label mb-0 small">Font size (px)</label>
                    <input
                        type="number"
                        min={8}
                        max={300}
                        step={1}
                        className="form-control form-control-sm"
                        style={{ width: '90px' }}
                        value={fontSize}
                        onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10)
                            if (Number.isFinite(parsed) && parsed >= 8 && parsed <= 300) {
                                onPatchElement(elementKey, { fontSize: parsed })
                            }
                        }}
                    />
                </div>
                <div>
                    <label className="form-label mb-0 small">Speed (px/s, 0 = static)</label>
                    <input
                        type="number"
                        min={0}
                        max={600}
                        step={1}
                        className="form-control form-control-sm"
                        style={{ width: '90px' }}
                        value={speed}
                        onChange={(e) => {
                            const parsed = parseInt(e.target.value, 10)
                            if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 600) {
                                onPatchElement(elementKey, { speed: parsed })
                            }
                        }}
                    />
                </div>
                <div>
                    <label className="form-label mb-0 small d-block">Direction</label>
                    <div className="btn-group btn-group-sm" role="group">
                        {TICKER_DIRECTIONS.map((dir) => (
                            <button
                                key={dir}
                                type="button"
                                className={`btn btn-outline-primary${direction === dir ? ' active' : ''}`}
                                onClick={() => onPatchElement(elementKey, { direction: dir })}
                            >
                                {DIRECTION_LABELS[dir]}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Column count follows the global Columns slider inversely (controls.css .ctl-el-inner-grid). */}
            <div className="ctl-el-inner-grid">
                {WIDGET_IDS.map((id) => (
                    <TickerSlotCard
                        key={id}
                        widgetId={id}
                        slot={tk.slots[id]}
                        onToggle={(enabled) => patchSlot(id, { enabled })}
                        onLabelCommit={(label) => patchSlot(id, { label: label || undefined })}
                        onLabelColor={(labelColor) => patchSlot(id, { labelColor })}
                        onValueColor={(valueColor) => patchSlot(id, { valueColor })}
                        onSlashColor={id === 'chasersLeft' ? (slashColor) => patchSlot(id, { slashColor }) : undefined}
                        onShowPctMin={id === 'chasersLeft' ? (showPctMin) => patchSlot(id, { showPctMin }) : undefined}
                    >
                        {id === 'pick2' && <Pick2Settings channelId={channelId} onFireCue={onFireCue} />}
                        {id === 'stashorpass' && <StashOrPassSettings channelId={channelId} onFireCue={onFireCue} />}
                        {id === 'name' && <NameSettings seriesId={seriesId} onFireCue={onFireCue} />}
                        {id === 'boxesPerBreak' && <BoxesPerBreakSettings seriesId={seriesId} onFireCue={onFireCue} />}
                        {id === 'boxesLeft' && (
                            <div className="text-secondary small">Counts are edited under Chasers left.</div>
                        )}
                        {id === 'chasersLeft' && (
                            <CountSettings channelId={channelId} elementKey={elementKey} seriesId={seriesId} onFireCue={onFireCue} />
                        )}
                    </TickerSlotCard>
                ))}
            </div>
        </div>
    )
}
