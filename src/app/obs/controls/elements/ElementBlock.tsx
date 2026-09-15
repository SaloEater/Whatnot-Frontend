'use client'

// One collapsible block per config.elements entry in the controls page's Elements section
// (see obs-layout-plan.md §1.6/§1.7, now folded into the controls page). Replaces the table row
// this element used to be in the old channel/[id]/widgets LayoutBuilder.

import type {Box, DurableCue, Element, LayoutConfig, PlacementKey, Phase, TransientCue} from '@/app/obs/layout/schema'
import {MIRRORABLE_KINDS} from '@/app/obs/layout/schema'
import {CANVAS} from '@/app/obs/layout/schema'
import {REGISTRY, registryIdOf} from '@/app/obs/layout/registry'
import {resolveEffective} from '@/app/obs/layout/config'
import {SCENE_EVENTS} from '@/app/obs/layout/sceneEvents'
import type {SceneEventName} from '@/app/obs/layout/sceneEvents'
import {useRef, useState} from 'react'
import ElementSettings from './ElementSettings'
import BoxEditorModal from './BoxEditorModal'
import {useFoldState} from './useFoldState'

const SCENE_EVENT_LABELS: Record<SceneEventName, string> = Object.fromEntries(
    SCENE_EVENTS.map((e) => [e.name, e.label])
) as Record<SceneEventName, string>

export type SetPlacement = (
    key: string,
    phase: PlacementKey,
    box: Box | null,
    opts?: { debounce?: boolean; history?: boolean; commit?: boolean }
) => void
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
    /** `Mirror` button (obs-layout-text-mirror-plan.md M.4) — creates a new text element bound to
     *  this one via `mirrorOf`. Only ever invoked from a source's own block. */
    onAddMirror: (key: string) => void
    /** How many elements mirror this one (0 for a mirror itself, or a source with none) — drives
     *  the "N mirrors" badge, the remove-confirm wording, and whether Persistent is disabled. */
    mirrorCount: number
    visible: boolean
    onSetVisible: (key: string, visible: boolean) => void
    onMove: (key: string, direction: -1 | 1) => void
    canMoveUp: boolean
    canMoveDown: boolean
    onFireCue?: (cue: DurableCue) => void
    /** Transient, backend-free cue emit (useControls.emitCue) — for signals fired by mouse
     *  movement, where onFireCue's state write per emit would be absurd. */
    onEmitCue?: (cue: TransientCue) => void
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
    onAddMirror,
    mirrorCount,
    visible,
    onSetVisible,
    onMove,
    canMoveUp,
    canMoveDown,
    onFireCue,
    onEmitCue,
}: Props) {
    // Folded/open is remembered per channel + stage in localStorage (useFoldState).
    const [open, setOpen] = useFoldState(channelId, currentPhase, elementKey)
    // Box is collapsed by default: positions are set once when a layout is built and rarely touched
    // again, while the widget's own settings below are what an operator actually reaches for.
    const [boxOpen, setBoxOpen] = useFoldState(channelId, currentPhase, elementKey, {
        suffix: 'box',
        defaultOpen: false,
    })
    // The wireframe box editor popup (obs-layout-box-editor-plan.md E.1/E.2) — a dead button
    // until BoxEditorModal exists, added alongside it.
    const [editorOpen, setEditorOpen] = useState(false)
    // Focus target the modal restores to on close (E.2's "Focus" rule).
    const editButtonRef = useRef<HTMLButtonElement>(null)

    const regId = registryIdOf(element)
    const entry = REGISTRY[regId]
    const placements = element.placements
    const persistent = !!placements.all
    const overrideBox = placements[currentPhase]
    // Every box the block shows comes from resolveEffective, not the raw element (obs-layout-
    // text-mirror-plan.md M.4) — for a mirror this is {x, y} from its own placement, {w, h}
    // inherited from its source; for anything else it is identical to the old resolveBox call.
    const resolvedBox = resolveEffective(config, elementKey, currentPhase).box
    const z = element.z ?? 0

    // Mirror/source policy reads `mirrorOf` directly (never to merge — that's resolveEffective's
    // job alone, see schema.ts's comment on the field).
    const isMirror = !!element.mirrorOf
    const mirrorOfKey = element.mirrorOf
    // The Mirror button appears only on kinds in MIRRORABLE_KINDS (schema.ts — the single place
    // that decides), and only while the element is a plain (non-mirror), non-persistent one
    // actually placed in the current stage — an unplaced element has nothing to offset from.
    const mirrorable = (MIRRORABLE_KINDS as readonly string[]).includes(element.kind)
    const canMirror = mirrorable && !isMirror && !persistent && !!resolvedBox

    function removeFromStage() {
        if (window.confirm(`Remove "${elementKey}" from the ${currentPhase} stage?`)) {
            onSetPlacement(elementKey, currentPhase, null)
        }
    }

    function togglePersistent(next: boolean) {
        onSetPersistent(elementKey, next)
    }

    // The persistent/override rule, shared by every write path (obs-layout-box-editor-plan.md
    // E.1): while persistent, an existing per-stage override edits that override; otherwise edits
    // are made to the shared `all` box (obs-layout-plan.md §1.7). `setBoxField` uses it for the
    // Box section's own inputs (debounced, global history); the box editor popup uses it via
    // `commitBox` (immediate, popup-local history — the popup controls its own cadence and undo).
    function targetPhaseFor(): PlacementKey {
        return persistent && !overrideBox ? 'all' : currentPhase
    }

    function setBoxField(field: keyof Box, value: number, opts?: {debounce?: boolean}) {
        if (!resolvedBox) return
        const nextBox = {...resolvedBox, [field]: value}
        onSetPlacement(elementKey, targetPhaseFor(), nextBox, {debounce: opts?.debounce ?? true})
    }

    function commitBox(box: Box) {
        onSetPlacement(elementKey, targetPhaseFor(), box, {debounce: false, history: false})
    }

    // Mid-gesture position from the popup: shown everywhere immediately, written nowhere. Same
    // placement rule as commitBox — only the persistence differs (see ElementsPanel.setPlacement).
    function draftBox(box: Box) {
        onSetPlacement(elementKey, targetPhaseFor(), box, {debounce: false, history: false, commit: false})
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
        // Deleting a source deletes its mirrors too (obs-layout-text-mirror-plan.md M.3) — say so
        // up front rather than have them silently vanish after confirming.
        const mirrorNote =
            mirrorCount > 0 ? ` and its ${mirrorCount} mirror${mirrorCount === 1 ? '' : 's'}` : ''
        if (window.confirm(`Remove element "${elementKey}"${mirrorNote}?`)) onRemove(elementKey)
    }

    return (
        <div
            className={`ctl-el-block${visible ? '' : ' ctl-el-block--hidden'}${entry.wideBlock ? ' ctl-el-block--wide' : ''}`}
        >
            <div className="ctl-el-header">
                {/* Row 1: identity and controls. Row 2: the two state toggles. Splitting them keeps
                    the name and the destructive controls on one scannable line instead of the
                    checkboxes pushing them around as labels change length. */}
                <div className="ctl-el-header-row">
                    <button type="button" className="btn btn-sm btn-link ctl-el-chevron" onClick={() => setOpen(!open)}>
                        {open ? '▾' : '▸'}
                    </button>
                    <span className="ctl-el-label">
                        {entry.label}
                        {isMirror && <span className="text-secondary"> · mirror of {mirrorOfKey}</span>}
                    </span>
                    <span className="ctl-el-key text-secondary small">{elementKey}</span>
                    {mirrorCount > 0 && (
                        <span
                            className="badge bg-secondary-subtle text-secondary-emphasis ctl-el-badge"
                            title="Text elements mirroring this one"
                        >
                            {mirrorCount} mirror{mirrorCount === 1 ? '' : 's'}
                        </span>
                    )}
                    {canMirror && (
                        <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => onAddMirror(elementKey)}
                            title="Add a copy of this text, bound to it, at another position on this stage"
                        >
                            Mirror
                        </button>
                    )}
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
                <div className="ctl-el-header-row ctl-el-header-row--toggles">
                    <div className="form-check form-check-inline ctl-el-visible">
                        <input
                            type="checkbox"
                            className="form-check-input"
                            id={`ctl-visible-${elementKey}`}
                            checked={visible}
                            disabled={isMirror}
                            title={isMirror
                                ? `Inherited from ${mirrorOfKey} — hide that element instead`
                                : 'Hide this element without removing it — it keeps its placement and stays in this list'}
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
                            disabled={isMirror || mirrorCount > 0}
                            title={
                                isMirror
                                    ? "Mirrors can't be persistent"
                                    : mirrorCount > 0
                                        ? 'Has mirrors — remove them first'
                                        : undefined
                            }
                            onChange={(e) => togglePersistent(e.target.checked)}
                        />
                        <label className="form-check-label small" htmlFor={`ctl-persistent-${elementKey}`}>
                            Persistent
                        </label>
                    </div>
                    {persistent && (
                        <span className="badge bg-info-subtle text-info-emphasis ctl-el-badge">persistent</span>
                    )}
                </div>
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
                                            <div className="ctl-box-col-title">
                                                Size
                                                {/* W/H are inherited from the source (resolveEffective) and never a
                                                    mirror's own — obs-layout-text-mirror-plan.md M.4. */}
                                                {isMirror && (
                                                    <span className="text-secondary small"> — inherited from {mirrorOfKey}</span>
                                                )}
                                            </div>
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
                                                        disabled={isMirror}
                                                        title={isMirror ? `Inherited from ${mirrorOfKey}` : undefined}
                                                        onChange={(e) => setBoxField(field, parseInt(e.target.value) || 0)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            type="button"
                                            ref={editButtonRef}
                                            className="btn btn-sm btn-outline-secondary ctl-box-edit-btn"
                                            onClick={() => setEditorOpen(true)}
                                        >
                                            Edit
                                        </button>
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
                        {/* No Layer input for a mirror (obs-layout-text-mirror-plan.md M.4) — its
                            render order is the source's `z`, inherited via resolveEffective, not
                            its own to set. */}
                        {boxOpen && !isMirror && (
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
                        {/* A mirror has no settings of its own — every value its panel would
                            show is read off the source by resolveEffective, so editing it here
                            would be editing dead data. Kind-agnostic: whichever kind is mirrored,
                            its settings panel is replaced by this pointer. */}
                        {isMirror ? (
                            <div className="small text-secondary">
                                Mirror of <strong>{mirrorOfKey}</strong> — edit that element to change its settings, size and layer.
                            </div>
                        ) : (
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
                                onEmitCue={onEmitCue}
                            />
                        )}
                    </div>
                </div>
            )}
            {editorOpen && resolvedBox && (
                <BoxEditorModal
                    elementKey={elementKey}
                    label={entry.label}
                    config={config}
                    currentPhase={currentPhase}
                    box={resolvedBox}
                    isMirror={isMirror}
                    channelId={channelId}
                    onCommit={commitBox}
                    onDraft={draftBox}
                    onClose={() => {
                        setEditorOpen(false)
                        editButtonRef.current?.focus()
                    }}
                />
            )}
        </div>
    )
}
