'use client'

// One collapsible block per config.elements entry in the controls page's Elements section
// (see obs-layout-plan.md §1.6/§1.7, now folded into the controls page). Replaces the table row
// this element used to be in the old channel/[id]/widgets LayoutBuilder.

import type {Box, Cue, Element, LayoutConfig, PlacementKey, Phase} from '@/app/obs/layout/schema'
import {CANVAS} from '@/app/obs/layout/schema'
import {REGISTRY, registryIdOf} from '@/app/obs/layout/registry'
import {resolveBox} from '@/app/obs/layout/config'
import {SCENE_EVENTS} from '@/app/obs/layout/sceneEvents'
import type {SceneEventName} from '@/app/obs/layout/sceneEvents'
import ElementSettings from './ElementSettings'
import {useFoldState} from './useFoldState'

const SCENE_EVENT_LABELS: Record<SceneEventName, string> = Object.fromEntries(
    SCENE_EVENTS.map((e) => [e.name, e.label])
) as Record<SceneEventName, string>

export type SetPlacement = (key: string, phase: PlacementKey, box: Box | null, opts?: { debounce?: boolean }) => void
export type SetPersistent = (key: string, persistent: boolean) => void
export type PatchElement = (key: string, patch: Record<string, unknown>) => void

type Props = {
    elementKey: string
    element: Element
    currentPhase: Phase
    channelId: number
    seriesId?: number | null
    config: LayoutConfig
    onSetPlacement: SetPlacement
    onSetPersistent: SetPersistent
    onPatchElement: PatchElement
    onRemove: (key: string) => void
    visible: boolean
    onSetVisible: (key: string, visible: boolean) => void
    onMove: (key: string, direction: -1 | 1) => void
    canMoveUp: boolean
    canMoveDown: boolean
    onFireCue?: (cue: Cue) => void
}

export default function ElementBlock({
    elementKey,
    element,
    currentPhase,
    channelId,
    seriesId,
    config,
    onSetPlacement,
    onSetPersistent,
    onPatchElement,
    onRemove,
    visible,
    onSetVisible,
    onMove,
    canMoveUp,
    canMoveDown,
    onFireCue,
}: Props) {
    // Folded/open is remembered per channel + stage in localStorage (useFoldState).
    const [open, setOpen] = useFoldState(channelId, currentPhase, elementKey)
    // Box is collapsed by default: positions are set once when a layout is built and rarely touched
    // again, while the widget's own settings below are what an operator actually reaches for.
    const [boxOpen, setBoxOpen] = useFoldState(channelId, currentPhase, elementKey, {
        suffix: 'box',
        defaultOpen: false,
    })

    const regId = registryIdOf(element)
    const entry = REGISTRY[regId]
    const placements = element.placements
    const persistent = !!placements.all
    const overrideBox = placements[currentPhase]
    const resolvedBox = resolveBox(element, currentPhase)
    const z = element.z ?? 0

    function removeFromStage() {
        if (window.confirm(`Remove "${elementKey}" from the ${currentPhase} stage?`)) {
            onSetPlacement(elementKey, currentPhase, null)
        }
    }

    function togglePersistent(next: boolean) {
        onSetPersistent(elementKey, next)
    }

    function setBoxField(field: keyof Box, value: number, opts?: {debounce?: boolean}) {
        if (!resolvedBox) return
        const nextBox = {...resolvedBox, [field]: value}
        // While persistent: an existing per-stage override edits that override; otherwise edits
        // are made to the shared `all` box (obs-layout-plan.md §1.7).
        const targetPhase: PlacementKey = persistent && !overrideBox ? 'all' : currentPhase
        onSetPlacement(elementKey, targetPhase, nextBox, {debounce: opts?.debounce ?? true})
    }

    /** Centre the element on one axis of the 1080x1920 canvas. Applied immediately, not debounced
     *  — it is a single deliberate click, not typing. */
    function centerAxis(axis: 'x' | 'y') {
        if (!resolvedBox) return
        const value =
            axis === 'x'
                ? Math.round((CANVAS.w - resolvedBox.w) / 2)
                : Math.round((CANVAS.h - resolvedBox.h) / 2)
        setBoxField(axis, value, {debounce: false})
    }

    function overrideForStage() {
        if (!resolvedBox) return
        onSetPlacement(elementKey, currentPhase, {...resolvedBox})
    }

    function useSharedBox() {
        onSetPlacement(elementKey, currentPhase, null)
    }

    function setZ(value: number) {
        onPatchElement(elementKey, {z: value})
    }

    // "Reacts to" row (obs-layout-plan.md §1.9): default (key absent) is "reacts", matching the
    // registry's declared `reactsTo` — unchecking writes an explicit `false` override; checking
    // it back removes the override rather than writing `true`, keeping `reactions` minimal.
    function toggleReaction(name: SceneEventName, checked: boolean) {
        const reactions = {...(element.reactions ?? {})}
        if (checked) {
            delete reactions[name]
        } else {
            reactions[name] = false
        }
        onPatchElement(elementKey, {reactions: Object.keys(reactions).length > 0 ? reactions : undefined})
    }

    function handleRemove() {
        if (window.confirm(`Remove element "${elementKey}"?`)) onRemove(elementKey)
    }

    return (
        <div
            className={`ctl-el-block${visible ? '' : ' ctl-el-block--hidden'}${entry.wideBlock ? ' ctl-el-block--wide' : ''}`}
        >
            <div className="ctl-el-header">
                <button type="button" className="btn btn-sm btn-link ctl-el-chevron" onClick={() => setOpen(!open)}>
                    {open ? '▾' : '▸'}
                </button>
                <div className="form-check form-check-inline ctl-el-visible">
                    <input
                        type="checkbox"
                        className="form-check-input"
                        id={`ctl-visible-${elementKey}`}
                        checked={visible}
                        title="Hide this element without removing it — it keeps its placement and stays in this list"
                        onChange={(e) => onSetVisible(elementKey, e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor={`ctl-visible-${elementKey}`}>
                        Visible
                    </label>
                </div>
                <div className="form-check form-check-inline ctl-el-persistent">
                    <input
                        type="checkbox"
                        className="form-check-input"
                        id={`ctl-persistent-${elementKey}`}
                        checked={persistent}
                        onChange={(e) => togglePersistent(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor={`ctl-persistent-${elementKey}`}>
                        Persistent
                    </label>
                </div>
                <span className="ctl-el-label">{entry.label}</span>
                {persistent && <span className="badge bg-info-subtle text-info-emphasis ctl-el-badge">persistent</span>}
                <span className="ctl-el-key text-secondary small">{elementKey}</span>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary ctl-el-move"
                    onClick={() => onMove(elementKey, -1)}
                    disabled={!canMoveUp}
                    title="Move up one place"
                    aria-label="Move up"
                >
                    ▲
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary ctl-el-move"
                    onClick={() => onMove(elementKey, 1)}
                    disabled={!canMoveDown}
                    title="Move down one place"
                    aria-label="Move down"
                >
                    ▼
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger ctl-el-remove" onClick={handleRemove} title="Remove element from ALL stages">
                    ×
                </button>
            </div>

            {open && (
                <div className="ctl-el-body">
                    <div className="ctl-el-section">
                        <button
                            type="button"
                            className="ctl-el-section-toggle"
                            aria-expanded={boxOpen}
                            onClick={() => setBoxOpen(!boxOpen)}
                        >
                            <span className="ctl-el-section-title">{boxOpen ? '▾' : '▸'} Box</span>
                        </button>
                        {boxOpen && entry.hasBox && (
                            resolvedBox ? (
                                <>
                                    <div className="ctl-box-grid">
                                        <div className="ctl-box-col">
                                            <div className="ctl-box-col-title">Position</div>
                                            {([
                                                {field: 'x', label: 'X'},
                                                {field: 'y', label: 'Y'},
                                            ] as const).map(({field, label}) => (
                                                <div className="ctl-box-field" key={field}>
                                                    <label className="ctl-box-label" htmlFor={`ctl-box-${elementKey}-${field}`}>
                                                        {label}
                                                    </label>
                                                    <input
                                                        id={`ctl-box-${elementKey}-${field}`}
                                                        type="number"
                                                        className="form-control form-control-sm"
                                                        value={resolvedBox[field]}
                                                        onChange={(e) => setBoxField(field, parseInt(e.target.value) || 0)}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm btn-outline-secondary"
                                                        title={`Centre on the ${label} axis of the canvas`}
                                                        onClick={() => centerAxis(field)}
                                                    >
                                                        Center
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="ctl-box-col">
                                            <div className="ctl-box-col-title">Size</div>
                                            {([
                                                {field: 'w', label: 'W'},
                                                {field: 'h', label: 'H'},
                                            ] as const).map(({field, label}) => (
                                                <div className="ctl-box-field" key={field}>
                                                    <label className="ctl-box-label" htmlFor={`ctl-box-${elementKey}-${field}`}>
                                                        {label}
                                                    </label>
                                                    <input
                                                        id={`ctl-box-${elementKey}-${field}`}
                                                        type="number"
                                                        className="form-control form-control-sm"
                                                        value={resolvedBox[field]}
                                                        onChange={(e) => setBoxField(field, parseInt(e.target.value) || 0)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    {persistent && (
                                        overrideBox ? (
                                            <button type="button" className="btn btn-sm btn-link p-0 mt-1" onClick={useSharedBox}>
                                                Use shared box
                                            </button>
                                        ) : (
                                            <button type="button" className="btn btn-sm btn-link p-0 mt-1" onClick={overrideForStage}>
                                                Override box for this stage
                                            </button>
                                        )
                                    )}
                                </>
                            ) : (
                                <div className="text-secondary small">Not placed in {currentPhase}.</div>
                            )
                        )}
                        {boxOpen && !persistent && (
                            <button
                                type="button"
                                className="btn btn-sm btn-link p-0 mt-1 text-danger d-block"
                                onClick={removeFromStage}
                            >
                                Remove from this stage
                            </button>
                        )}
                        {boxOpen && (
                        <div className="d-flex align-items-center gap-2 mt-2">
                            <label className="form-label mb-0 small" title="Render order — higher draws on top">Layer</label>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '70px'}}
                                value={z}
                                onChange={(e) => setZ(parseInt(e.target.value) || 0)}
                            />
                        </div>
                        )}
                    </div>

                    {entry.reactsTo.length > 0 && (
                        <div className="ctl-el-section">
                            <div className="ctl-el-section-title">Reacts to</div>
                            <div className="d-flex flex-wrap gap-3">
                                {entry.reactsTo.map((name) => {
                                    const checked = element.reactions?.[name] !== false
                                    return (
                                        <div className="form-check form-check-inline" key={name}>
                                            <input
                                                type="checkbox"
                                                className="form-check-input"
                                                id={`ctl-reacts-${elementKey}-${name}`}
                                                checked={checked}
                                                onChange={(e) => toggleReaction(name, e.target.checked)}
                                            />
                                            <label className="form-check-label small" htmlFor={`ctl-reacts-${elementKey}-${name}`}>
                                                {SCENE_EVENT_LABELS[name]}
                                            </label>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    <div className="ctl-el-section">
                        <div className="ctl-el-section-title">Settings</div>
                        <ElementSettings
                            registryId={regId}
                            channelId={channelId}
                            seriesId={seriesId}
                            elementKey={elementKey}
                            element={element}
                            currentPhase={currentPhase}
                            config={config}
                            onPatchElement={onPatchElement}
                            onFireCue={onFireCue}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
