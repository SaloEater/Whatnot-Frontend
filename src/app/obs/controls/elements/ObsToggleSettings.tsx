'use client'

// Settings for `obsToggle` (obs-visibility-toggle-plan.md §8). Every write is
// `onPatchElement(elementKey, { sources })` with the full next array — the config path already
// pushes to OBS via the stage-hooks mount (elements/obs-toggle/mount.ts), so there is no
// `useSettingWrite` here, same reasoning as CameraShelfSettings.tsx. `obs.getProgramSceneItemNames()`
// (fetch/effect copied from CameraShelfSettings.refreshSources, per ADDING_AN_ELEMENT.md's copy
// rule) is the one thing that talks to OBS directly, outside that push.

import { useEffect, useState } from 'react'
import type { Element } from '@/app/obs/layout/schema'
import type { MyOBSWebsocket } from '@/app/entity/my_obs_websocket'
import type { PatchElement } from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
    obs: MyOBSWebsocket | null
    isConnected: boolean
}

export default function ObsToggleSettings({ elementKey, element, onPatchElement, obs, isConnected }: Props) {
    const toggle = element.kind === 'obsToggle' ? element : null
    const sources = toggle?.sources ?? []

    // OBS-source names, refetched on connect and by the Refresh button — copied from
    // CameraShelfSettings.refreshSources.
    const [sourceNames, setSourceNames] = useState<string[]>([])

    function refreshSources() {
        if (!obs || !isConnected) {
            setSourceNames([])
            return
        }
        obs.getProgramSceneItemNames().then(setSourceNames).catch(() => setSourceNames([]))
    }
    useEffect(() => {
        refreshSources()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, obs])

    // Free-text drafts, one per row index, so typing doesn't fight the committed array on every
    // keystroke — same draft-per-row convention as the shelf's single free-text fallback, just
    // keyed by index here since there can be any number of rows.
    const [drafts, setDrafts] = useState<string[]>(sources)
    useEffect(() => {
        setDrafts(sources)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(sources)])

    if (!toggle) return null

    function commit(next: string[]) {
        onPatchElement(elementKey, { sources: next.length > 0 ? next : undefined })
    }

    function setRow(index: number, value: string) {
        const trimmed = value.trim()
        const next = sources.slice()
        next[index] = trimmed
        commit(next)
    }

    function removeRow(index: number) {
        const next = sources.slice()
        next.splice(index, 1)
        commit(next)
    }

    function addRow() {
        commit([...sources, ''])
    }

    return (
        <div className="d-flex flex-column gap-2">
            <div className="small text-secondary">
                Listed OBS sources are shown when a stage with this element is entered and hidden when
                such a stage is left for one without it. Add this element to every stage where the
                sources should stay visible, or tick Persistent for always-on.
            </div>

            <div className="d-flex flex-column gap-2">
                {sources.map((source, index) => {
                    const draft = drafts[index] ?? source
                    const extraOption = source && !sourceNames.includes(source) ? source : null
                    return (
                        <div key={index} className="d-flex flex-column gap-1 border rounded p-2">
                            <div className="d-flex align-items-center gap-2">
                                <select
                                    className="form-select form-select-sm"
                                    style={{ width: '220px' }}
                                    disabled={sourceNames.length === 0}
                                    value={source}
                                    onChange={(e) => setRow(index, e.target.value)}
                                >
                                    <option value="">
                                        {sourceNames.length === 0
                                            ? isConnected
                                                ? 'No scene items found'
                                                : 'Connect to OBS to choose'
                                            : 'Select source'}
                                    </option>
                                    {extraOption && (
                                        <option value={extraOption}>{`${extraOption} (not in program scene)`}</option>
                                    )}
                                    {sourceNames.map((name) => (
                                        <option key={name} value={name}>
                                            {name}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => removeRow(index)}
                                >
                                    Remove
                                </button>
                            </div>
                            {/* Free-text fallback that always works, regardless of connection state —
                                same always-available-input shape as CameraShelfSettings' OBS source
                                field. */}
                            <input
                                type="text"
                                className="form-control form-control-sm"
                                value={draft}
                                onChange={(e) => {
                                    const next = drafts.slice()
                                    next[index] = e.target.value
                                    setDrafts(next)
                                }}
                                onBlur={(e) => setRow(index, e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                }}
                            />
                        </div>
                    )
                })}
            </div>

            <div className="d-flex align-items-center gap-2">
                <button type="button" className="btn btn-sm btn-outline-primary" onClick={addRow}>
                    Add source
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={refreshSources}>
                    Refresh
                </button>
            </div>

            <div className="small text-secondary">
                If two <code>obsToggle</code> elements name the same source, the last stage change
                wins.
            </div>
        </div>
    )
}
