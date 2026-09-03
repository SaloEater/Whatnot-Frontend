'use client'

// Stage manager: create/delete/reorder for `config.stages` (obs/layout/schema.ts's `Stage[]`).
// Lives in its own "Stages" tab in the controls page's side panel, next to "OBS" — the stage
// BLOCK on the main column (prev/dropdown/next, in controls/[id]/page.tsx) only lets the operator
// switch between existing stages; this is where the list itself is edited.
//
// Every edit here goes straight through controls.pushConfig, exactly like any other config change
// (ElementsPanel's add/remove/reorder), so it validates, saves, and reaches OBS the same way.
//
// Rules (decided, not open to reinterpretation here):
//   - The three built-in stages (selling/results/ripping) can never be deleted — they CAN be
//     reordered like any other stage.
//   - Create and delete only. No renaming: a stage's `id` is what every element's `placements` key
//     on, so changing it would orphan them. The operator only ever supplies a LABEL; the id is
//     derived once, at creation, and is immutable after that.
//   - 'all' is reserved (it's the persistent-placement key) and can never be a stage id — enforced
//     by `uniqueStageId` below, which is written so slugifying a label can never produce it.

import {useState} from 'react'
import type {Element, LayoutConfig, Stage} from '@/app/obs/layout/schema'
import {BUILT_IN_STAGES} from '@/app/obs/layout/schema'
import type {useControls} from '@/app/obs/controls/useControls'

const BUILT_IN_IDS = new Set(BUILT_IN_STAGES.map((s) => s.id))

/** lowercase, non-alphanumerics collapsed to a single '-', trimmed of leading/trailing '-'. Falls
 * back to 'stage' if that leaves nothing (e.g. a label of just punctuation/emoji). */
function slugify(label: string): string {
    const base = label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return base || 'stage'
}

/** Dedupes a candidate stage id against the ids already in the config, and against the reserved
 * 'all' key, appending "-2", "-3", … until it lands on something unique. */
function uniqueStageId(base: string, existingIds: Set<string>): string {
    if (base !== 'all' && !existingIds.has(base)) return base
    let n = 2
    let candidate = `${base}-${n}`
    while (candidate === 'all' || existingIds.has(candidate)) {
        n++
        candidate = `${base}-${n}`
    }
    return candidate
}

/** Removes every placement — and, for `frame` elements, every border — keyed to the stage being
 * deleted. Bundled into the SAME config mutation as the stage removal itself (obs-layout-plan
 * follow-up rule: "deleting a stage deletes its placements too") — a `frame`'s `borders` isn't a
 * `placements` entry, but it's keyed by the exact same PlacementKey vocabulary, and leaving a
 * border keyed to a stage id that no longer exists would make config.ts's `validateBorders` reject
 * the whole config on the very next validate, which would silently un-delete the stage. */
function stripStageFromElements(elements: Record<string, Element>, stageId: string): Record<string, Element> {
    const next: Record<string, Element> = {}
    for (const [key, el] of Object.entries(elements)) {
        const placements = {...el.placements}
        delete placements[stageId]
        let nextEl: Element = {...el, placements} as Element
        if (nextEl.kind === 'frame' && nextEl.borders && stageId in nextEl.borders) {
            const borders = {...nextEl.borders}
            delete borders[stageId]
            nextEl = {...nextEl, borders}
        }
        next[key] = nextEl
    }
    return next
}

type Controls = ReturnType<typeof useControls>

type Props = {
    controls: Controls
    onPushResult?: (result: {error?: string; warning?: string}) => void
}

export default function StagesPanel({controls, onPushResult}: Props) {
    const {config, state, apply, pushConfig} = controls
    const [labelDraft, setLabelDraft] = useState('')
    const [pushError, setPushError] = useState<string | null>(null)

    async function push(next: LayoutConfig) {
        const result = await pushConfig(next)
        setPushError(result.error ?? null)
        onPushResult?.(result)
    }

    async function addStage() {
        const label = labelDraft.trim()
        if (!label) return
        const existingIds = new Set(config.stages.map((s) => s.id))
        const id = uniqueStageId(slugify(label), existingIds)
        await push({...config, stages: [...config.stages, {id, label}]})
        setLabelDraft('')
    }

    async function deleteStage(stage: Stage) {
        if (BUILT_IN_IDS.has(stage.id)) return
        if (!window.confirm(`Delete stage "${stage.label}"? Every element's placement in this stage is removed too.`)) {
            return
        }

        const nextStages = config.stages.filter((s) => s.id !== stage.id)
        const nextElements = stripStageFromElements(config.elements, stage.id)

        // The stage being deleted may be the one currently live. pushConfig() re-applies the
        // CURRENT state as-is to give OBS a fresh seq — if that state's phase is the stage we're
        // about to remove, move off it first so the bus payload the push emits doesn't hand OBS a
        // phase the new config no longer has even a placement for.
        if (state.phase === stage.id) {
            await apply({...state, phase: nextStages[0].id, phaseData: undefined})
        }

        await push({...config, stages: nextStages, elements: nextElements})
    }

    function moveStage(id: string, direction: -1 | 1) {
        const idx = config.stages.findIndex((s) => s.id === id)
        const target = idx + direction
        if (idx < 0 || target < 0 || target >= config.stages.length) return
        const next = [...config.stages]
        ;[next[idx], next[target]] = [next[target], next[idx]]
        void push({...config, stages: next})
    }

    return (
        <div className="ctl-stages-tab">
            <div className="ctl-stages-list">
                <h6 className="mb-2">Stages</h6>

                {pushError && (
                    <div className="alert alert-danger py-2 small mb-2">{pushError}</div>
                )}

                <ul className="list-group list-group-flush mb-0">
                    {config.stages.map((stage, i) => (
                        <li key={stage.id} className="list-group-item d-flex align-items-center gap-2 px-0 py-1">
                            <div className="d-flex flex-column">
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary py-0 px-1"
                                    disabled={i === 0}
                                    onClick={() => moveStage(stage.id, -1)}
                                    title="Move up one place"
                                    aria-label={`Move ${stage.label} up`}
                                >
                                    ▲
                                </button>
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary py-0 px-1"
                                    disabled={i === config.stages.length - 1}
                                    onClick={() => moveStage(stage.id, 1)}
                                    title="Move down one place"
                                    aria-label={`Move ${stage.label} down`}
                                >
                                    ▼
                                </button>
                            </div>
                            <div className="flex-grow-1">
                                <div className="small">{stage.label}</div>
                                <div className="text-secondary" style={{fontSize: '0.75rem'}}>{stage.id}</div>
                            </div>
                            {BUILT_IN_IDS.has(stage.id) ? (
                                <span className="badge bg-secondary-subtle text-secondary-emphasis">built-in</span>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => deleteStage(stage)}
                                    title="Delete stage"
                                    aria-label={`Delete ${stage.label}`}
                                >
                                    ×
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </div>

            <div className="ctl-stages-add">
                <h6 className="mb-2">Add a stage</h6>
                <div className="small text-secondary mb-2">
                    Selling / Results / Ripping are built in and can be reordered but not removed.
            </div>
            <div className="d-flex gap-2">
                <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="New stage label…"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addStage() }}
                />
                <button
                    type="button"
                    className="btn btn-sm btn-outline-primary text-nowrap"
                    onClick={addStage}
                    disabled={!labelDraft.trim()}
                >
                    Add stage
                </button>
            </div>
            </div>
        </div>
    )
}
