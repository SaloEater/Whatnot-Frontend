'use client'

// Named, per-channel layout snapshots (obs-layout-presets-plan.md). Lives in its own "Presets" tab
// in the controls page's side panel, next to "OBS" and "Stages" — a preset is a whole-layout
// (stages + elements) save point the operator can return to, distinct from the Stages tab's
// editing of the stage LIST itself.
//
// Same horizontal two-group shape as StagesPanel: list on the left, "save current layout as…" form
// on the right — reusing its `ctl-stages-*` layout classes rather than duplicating them, since the
// shape (list | divider | form) is identical, only the content differs.

import {useCallback, useEffect, useRef, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {LayoutConfig, LayoutPreset} from '@/app/obs/layout/schema'
import type {PresetOverrides} from '@/app/obs/layout/config'
import {applyPreset, makePresetPayload, summarizePreset} from '@/app/obs/layout/config'
import type {useControls} from '@/app/obs/controls/useControls'

const MAX_PRESET_NAME_LENGTH = 60

// post()/get() never throw for HTTP/network failures — they resolve `{error: ...}` instead
// (lib/backend.ts). Same shape check as useSettingWrite.ts's isErrorResponse / useControls.ts's
// isBackendFailure, duplicated locally rather than imported since neither is exported.
function isErrorResponse(v: unknown): v is {error: string} {
    return typeof v === 'object' && v !== null && 'error' in (v as Record<string, unknown>)
}

// "N elements · M stages", read off the stored blob without running it through migrate+validate —
// this is a list-row summary, not a load, and a preset saved under an older schema should still
// show a count instead of forcing a load attempt to find out. `summarizePreset` understands both
// stored shapes (the v2 envelope and the bare LayoutConfig written before it).
function summarize(stored: unknown): string {
    const counts = summarizePreset(stored)
    return counts ? `${counts.elements} elements · ${counts.stages} stages` : 'unreadable'
}

type Controls = ReturnType<typeof useControls>

type Props = {
    controls: Controls
    channelId: number
    onPushResult?: (result: {error?: string; warning?: string}) => void
}

export default function PresetsPanel({controls, channelId, onPushResult}: Props) {
    const [presets, setPresets] = useState<LayoutPreset[]>([])
    const [listError, setListError] = useState<string | null>(null)
    const [nameDraft, setNameDraft] = useState('')
    const [saveError, setSaveError] = useState<string | null>(null)
    const [saveStatus, setSaveStatus] = useState<'idle' | 'ok'>('idle')

    // Load-flow error surface: either applyPreset's validation errors (a preset that no longer
    // fits the current schema) or a pushConfig failure. Shared by Load/Overwrite/Delete/Undo since
    // they're mutually exclusive user actions in this one tab.
    const [actionError, setActionError] = useState<string | null>(null)

    // Single-level "Undo load" (obs-layout-presets-plan.md §P.3): ElementsPanel's undo/redo stack
    // is component-local `useState`, so a preset load — which can originate from this entirely
    // separate tab — can't be pushed onto it without lifting that history out of the panel. Rather
    // than do that now, this tab keeps exactly ONE previous live config in a ref: enough to back
    // out of the common "loaded the wrong thing" mistake with no dialog, without building a real
    // history stack for a case that isn't asked for yet. If a third panel ever needs undo, lift
    // ElementsPanel's stack into a shared hook then.
    const prevLiveRef = useRef<{config: LayoutConfig; overrides: PresetOverrides} | null>(null)
    const [undoAvailable, setUndoAvailable] = useState(false)

    const fetchPresets = useCallback(async () => {
        const resp = await post(getEndpoints().layout_preset_list, {channel_id: channelId})
        if (isErrorResponse(resp)) {
            setListError(resp.error ?? 'Failed to load presets')
            return
        }
        setListError(null)
        setPresets((resp as {presets: LayoutPreset[]}).presets ?? [])
    }, [channelId])

    // Fetch on mount only — presets change exclusively from this tab's own actions (create/
    // update/delete below all re-fetch themselves), so there is nothing else to poll for.
    useEffect(() => {
        void fetchPresets()
    }, [fetchPresets])

    // Clear the undo stash whenever this tab unmounts (folded away) or the channel changes under
    // it — a stashed config from a different channel/session is never a valid thing to push back.
    useEffect(() => {
        return () => {
            prevLiveRef.current = null
        }
    }, [channelId])

    /**
     * Push a saved layout back: its config AND the per-element visibility that went with it.
     *
     * Visibility is state, not config, so it takes a separate `apply()` — done FIRST, because
     * `pushConfig()` re-applies whatever state is current in order to give OBS a fresh seq, so
     * anything applied here rides out on that same final emit rather than needing one of its own.
     *
     * `overrides` REPLACES rather than merges: a preset is "the layout as it looked", and merging
     * would leave an element the operator hid a moment ago still hidden after loading a preset that
     * had it visible — the one thing a restore must not do. Dropping keys for elements outside the
     * preset is safe; `isVisible` reads by key and defaults to visible.
     */
    async function reconcileAndPush(next: LayoutConfig, overrides: PresetOverrides) {
        // Mirrors StagesPanel.deleteStage: pushConfig() must not hand OBS a phase the new config
        // has no placement for, so move off it before the push if the preset lacks it.
        const phase = next.stages.some((s) => s.id === controls.state.phase)
            ? controls.state.phase
            : next.stages[0].id
        await controls.apply({
            ...controls.state,
            phase,
            ...(phase === controls.state.phase ? {} : {phaseData: undefined}),
            overrides,
        })
        const r = await controls.pushConfig(next)
        onPushResult?.(r)
        return r
    }

    async function loadPreset(preset: LayoutPreset) {
        const result = applyPreset(preset.config, controls.config)
        if (!result.ok) {
            setActionError(result.errors.join('; '))
            return
        }
        setActionError(null)

        // Stash the live layout BEFORE pushing, so "Undo load" restores exactly what was live a
        // moment ago — visibility included, or undo would hand back the config with every element
        // shown.
        prevLiveRef.current = {config: controls.config, overrides: controls.state.overrides ?? {}}

        const r = await reconcileAndPush(result.config, result.overrides)
        if (r.error) {
            // The push was refused, so the live layout was never replaced — offering "Undo load"
            // here would just re-push the config that is already live.
            setActionError(r.error)
            prevLiveRef.current = null
            return
        }
        setUndoAvailable(true)
    }

    async function undoLoad() {
        const prev = prevLiveRef.current
        if (!prev) return
        // Clear the stash before pushing, not after: this is a single-level undo, not a redo
        // stack, so a second click on a link that's about to disappear anyway must not resurrect
        // the load it just reverted.
        prevLiveRef.current = null
        setUndoAvailable(false)
        setActionError(null)
        const r = await reconcileAndPush(prev.config, prev.overrides)
        if (r.error) setActionError(r.error)
    }

    async function overwrite(preset: LayoutPreset) {
        if (!window.confirm(`Overwrite preset "${preset.name}" with the current layout?`)) return
        const resp = await post(getEndpoints().layout_preset_update, {
            id: preset.id,
            config: makePresetPayload(controls.config, controls.state),
        })
        if (isErrorResponse(resp)) {
            setActionError(resp.error ?? 'Failed to overwrite preset')
            return
        }
        setActionError(null)
        await fetchPresets()
    }

    async function deletePreset(preset: LayoutPreset) {
        if (!window.confirm(`Delete preset "${preset.name}"?`)) return
        const resp = await post(getEndpoints().layout_preset_delete, {id: preset.id})
        if (isErrorResponse(resp)) {
            setActionError(resp.error ?? 'Failed to delete preset')
            return
        }
        setActionError(null)
        await fetchPresets()
    }

    async function saveAsPreset() {
        const name = nameDraft.trim()
        if (!name) return
        setSaveStatus('idle')
        const resp = await post(getEndpoints().layout_preset_create, {
            channel_id: channelId,
            name,
            config: makePresetPayload(controls.config, controls.state),
        })
        if (isErrorResponse(resp)) {
            // This is how a duplicate name or the 30-preset cap surfaces — the backend's own
            // readable error, shown as-is.
            setSaveError(resp.error ?? 'Failed to save preset')
            return
        }
        setSaveError(null)
        setSaveStatus('ok')
        setNameDraft('')
        await fetchPresets()
    }

    return (
        <div className="ctl-stages-tab">
            <div className="ctl-stages-list">
                <h6 className="mb-2">Presets</h6>

                {listError && <div className="alert alert-danger py-2 small mb-2">{listError}</div>}
                {actionError && <div className="alert alert-danger py-2 small mb-2">{actionError}</div>}

                {presets.length === 0 && !listError ? (
                    <div className="text-secondary small">No presets yet.</div>
                ) : (
                    <ul className="list-group list-group-flush mb-0">
                        {presets.map((preset) => (
                            <li key={preset.id} className="list-group-item d-flex align-items-center gap-2 px-0 py-1">
                                <div className="flex-grow-1">
                                    <div className="small">{preset.name}</div>
                                    <div className="text-secondary" style={{fontSize: '0.75rem'}}>
                                        {summarize(preset.config)} · updated {new Date(preset.updated_at).toLocaleString()}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => loadPreset(preset)}
                                    title="Load this preset"
                                >
                                    Load
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary"
                                    onClick={() => overwrite(preset)}
                                    title="Overwrite this preset with the current layout"
                                >
                                    Overwrite
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => deletePreset(preset)}
                                    title="Delete this preset"
                                    aria-label={`Delete ${preset.name}`}
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {undoAvailable && (
                    <div className="small mt-2">
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={undoLoad}>
                            Undo load
                        </button>
                    </div>
                )}
            </div>

            <div className="ctl-stages-add">
                <h6 className="mb-2">Save current layout as…</h6>
                <div className="d-flex gap-2">
                    <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Preset name…"
                        maxLength={MAX_PRESET_NAME_LENGTH}
                        value={nameDraft}
                        onChange={(e) => { setNameDraft(e.target.value); setSaveStatus('idle') }}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveAsPreset() }}
                    />
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary text-nowrap"
                        onClick={saveAsPreset}
                        disabled={!nameDraft.trim()}
                    >
                        Save as preset
                    </button>
                </div>
                {saveError && <div className="text-danger small mt-1">{saveError}</div>}
                {saveStatus === 'ok' && <div className="text-success small mt-1">Saved</div>}
            </div>
        </div>
    )
}
