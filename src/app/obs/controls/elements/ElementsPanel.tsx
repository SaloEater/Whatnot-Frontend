'use client'

// Elements section of the controls page main column (folded in from the old channel/[id]/widgets
// LayoutBuilder tab — see obs-layout-plan.md §1.6/§1.7). Owns add/remove/undo/redo/reset for
// config.elements and auto-saves every change through controls.pushConfig().

import {useRef, useState} from 'react'
import type {Box, Element, LayoutConfig, PlacementKey} from '@/app/obs/layout/schema'
import {REGISTRY, makeElement, registryIdOf} from '@/app/obs/layout/registry'
import type {RegistryId} from '@/app/obs/layout/registry'
import {defaultConfig, resolveBox} from '@/app/obs/layout/config'
import type {useControls} from '@/app/obs/controls/useControls'
import ElementBlock from './ElementBlock'

function baseKeyFor(regId: RegistryId): string {
    const parts = regId.split(':')
    return parts.length > 1 ? parts[1] : parts[0]
}

type Controls = ReturnType<typeof useControls>

type Props = {
    controls: Controls
    channelId: number
    seriesId?: number | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function ElementsPanel({controls, channelId, seriesId}: Props) {
    const {config, setConfigLocal, pushConfig, state} = controls
    const currentPhase = state.phase

    const [addChoice, setAddChoice] = useState<string>('')
    const [undoStack, setUndoStack] = useState<LayoutConfig[]>([])
    const [redoStack, setRedoStack] = useState<LayoutConfig[]>([])
    const [saveState, setSaveState] = useState<SaveState>('idle')
    const [saveErrors, setSaveErrors] = useState<string[] | undefined>(undefined)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    async function doPush(next: LayoutConfig) {
        const result = await pushConfig(next)
        if (result.error) {
            setSaveState('error')
            setSaveErrors(result.errors ?? [result.error])
        } else {
            setSaveState('saved')
            setSaveErrors(undefined)
        }
    }

    function commit(next: LayoutConfig, opts?: { debounce?: boolean }) {
        setConfigLocal(next)
        if (debounceRef.current) {
            clearTimeout(debounceRef.current)
            debounceRef.current = null
        }
        setSaveState('saving')
        if (opts?.debounce) {
            debounceRef.current = setTimeout(() => { doPush(next) }, 400)
        } else {
            doPush(next)
        }
    }

    // Reads `config` from the closure at call time (current render), same as pushHistory() in the
    // old LayoutBuilder did — fine here since every mutating handler below is called from a fresh
    // event handler bound to the latest render.
    function mutate(updater: (c: LayoutConfig) => LayoutConfig, opts?: { debounce?: boolean }) {
        setUndoStack(prev => [...prev, config])
        setRedoStack([])
        commit(updater(config), opts)
    }

    function undo() {
        setUndoStack(prev => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]
            setRedoStack(r => [...r, config])
            commit(last)
            return prev.slice(0, -1)
        })
    }

    function redo() {
        setRedoStack(prev => {
            if (prev.length === 0) return prev
            const last = prev[prev.length - 1]
            setUndoStack(u => [...u, config])
            commit(last)
            return prev.slice(0, -1)
        })
    }

    function resetToDefault() {
        if (!window.confirm('Reset layout to default? This clears all elements and OBS bindings.')) return
        mutate(() => defaultConfig())
    }

    function isSingletonBlocked(entry: (typeof REGISTRY)[RegistryId]): boolean {
        if (!entry.singleton) return false
        return Object.values(config.elements).some(
            el => REGISTRY[registryIdOf(el)].singletonGroup === entry.singletonGroup
        )
    }

    /** Elements already in the layout but with no resolved box for the current stage. */
    const existingNotInPhase = Object.entries(config.elements).filter(([, el]) =>
        !resolveBox(el, currentPhase)
    )

    function boxForPhase(el: Element, regId: RegistryId): Box {
        if ('placements' in el) {
            const any = Object.values(el.placements)[0]
            if (any) return {...any}
        }
        return {...REGISTRY[regId].defaultBox}
    }

    /** Elements resolved (directly or via `all`) in the current stage. */
    const isPersistent = ([, el]: [string, Element]) => !!el.placements.all
    const elementsInPhase = Object.entries(config.elements)
        .filter(([, el]) => !!resolveBox(el, currentPhase))
        // Stage-specific elements first, persistent ones below (stable within each group).
        .sort((a, b) => Number(isPersistent(a)) - Number(isPersistent(b)))

    function addElement() {
        if (!addChoice) return
        if (addChoice.startsWith('existing:')) {
            const key = addChoice.slice('existing:'.length)
            const el = config.elements[key]
            if (!el || !('placements' in el)) return
            setPlacement(key, currentPhase, boxForPhase(el, registryIdOf(el)))
            setAddChoice('')
            return
        }
        const regId = addChoice.slice('new:'.length) as RegistryId
        const entry = REGISTRY[regId]
        if (!entry || isSingletonBlocked(entry)) return

        const base = baseKeyFor(regId)
        let key = base
        let n = 2
        while (config.elements[key]) {
            key = `${base}-${n}`
            n++
        }

        const el = makeElement(regId)
        // Elements born persistent (e.g. the frame) already cover this stage via `all`.
        if ('placements' in el && !el.placements.all) {
            el.placements = {...el.placements, [currentPhase]: boxForPhase(el, regId)}
        }
        mutate(c => ({...c, elements: {...c.elements, [key]: el}}))
        setAddChoice('')
    }

    /** "Add to all stages": new elements get `all` = defaultBox; existing elements from the
     * "Already in layout" group get `all` = their first existing box (kept alongside any
     * per-stage overrides they already have). */
    function addElementToAllStages() {
        if (!addChoice) return
        if (addChoice.startsWith('existing:')) {
            const key = addChoice.slice('existing:'.length)
            const el = config.elements[key]
            if (!el || !('placements' in el)) return
            const anyBox = Object.values(el.placements)[0] ?? REGISTRY[registryIdOf(el)].defaultBox
            setPlacement(key, 'all', {...anyBox})
            setAddChoice('')
            return
        }
        const regId = addChoice.slice('new:'.length) as RegistryId
        const entry = REGISTRY[regId]
        if (!entry || isSingletonBlocked(entry)) return

        const base = baseKeyFor(regId)
        let key = base
        let n = 2
        while (config.elements[key]) {
            key = `${base}-${n}`
            n++
        }

        const el = makeElement(regId)
        if ('placements' in el) {
            el.placements = {all: {...entry.defaultBox}}
        }
        mutate(c => ({...c, elements: {...c.elements, [key]: el}}))
        setAddChoice('')
    }

    function removeElement(key: string) {
        mutate(c => {
            const rest = {...c.elements}
            delete rest[key]
            return {...c, elements: rest}
        })
    }

    function setPlacement(key: string, phase: PlacementKey, box: Box | null, opts?: { debounce?: boolean }) {
        mutate(c => {
            const el = c.elements[key]
            if (!el) return c
            const placements = {...el.placements}
            if (box) placements[phase] = box
            else delete placements[phase]
            return {...c, elements: {...c.elements, [key]: {...el, placements} as Element}}
        }, opts)
    }

    /** Persistent checkbox (obs-layout-plan.md §1.7): on moves the current (or any existing, else
     * default) box into `all` and drops every per-stage box; off copies `all` into the current
     * stage only and drops `all`. */
    function setPersistent(key: string, persistent: boolean) {
        mutate(c => {
            const el = c.elements[key]
            if (!el) return c
            const placements = el.placements
            if (persistent) {
                const current = placements[currentPhase]
                    ?? Object.values(placements)[0]
                    ?? REGISTRY[registryIdOf(el)].defaultBox
                const newPlacements: Partial<Record<PlacementKey, Box>> = {all: {...current}}
                return {...c, elements: {...c.elements, [key]: {...el, placements: newPlacements} as Element}}
            }
            const allBox = placements.all
            const newPlacements: Partial<Record<PlacementKey, Box>> = {}
            if (allBox) newPlacements[currentPhase] = {...allBox}
            return {...c, elements: {...c.elements, [key]: {...el, placements: newPlacements} as Element}}
        })
    }

    /** Generic element mutation for settings that live on the element itself rather than in
     * `placements` — today: `frame`'s `image` and every element's `z` (obs-layout-plan.md §1.7). */
    function patchElement(key: string, patch: Record<string, unknown>) {
        mutate(c => {
            const el = c.elements[key]
            if (!el) return c
            return {...c, elements: {...c.elements, [key]: {...el, ...patch} as Element}}
        }, {debounce: true})
    }

    const addableEntries = Object.values(REGISTRY).filter(e => e.available !== false)

    return (
        <div className="ctl-elements-section">
            <h5 className="mb-2">Elements</h5>

            <div className="ctl-elements-toolbar d-flex flex-wrap align-items-center gap-2 mb-2">
                <select
                    className="form-select form-select-sm"
                    style={{width: '260px'}}
                    value={addChoice}
                    onChange={(e) => setAddChoice(e.target.value)}
                >
                    <option value="">Add element to this stage…</option>
                    {existingNotInPhase.length > 0 && (
                        <optgroup label="Already in layout">
                            {existingNotInPhase.map(([key, el]) => (
                                <option key={key} value={`existing:${key}`}>
                                    {REGISTRY[registryIdOf(el)].label} ({key})
                                </option>
                            ))}
                        </optgroup>
                    )}
                    <optgroup label="New">
                        {addableEntries.map(entry => (
                            <option key={entry.id} value={`new:${entry.id}`} disabled={isSingletonBlocked(entry)}>
                                {entry.label}{isSingletonBlocked(entry) ? ' (already added)' : ''}
                            </option>
                        ))}
                    </optgroup>
                </select>
                <button className="btn btn-outline-primary btn-sm" onClick={addElement} disabled={!addChoice}>
                    Add element
                </button>
                <button className="btn btn-outline-primary btn-sm" onClick={addElementToAllStages} disabled={!addChoice}>
                    Add to all stages
                </button>

                <div className="ms-auto d-flex align-items-center gap-2">
                    <span className={`ctl-save-indicator small ctl-save-${saveState}`}>
                        {saveState === 'saving' && 'saving…'}
                        {saveState === 'saved' && 'saved'}
                        {saveState === 'error' && 'error'}
                    </span>
                    <button className="btn btn-outline-secondary btn-sm" onClick={undo} disabled={undoStack.length === 0}>
                        Undo
                    </button>
                    <button className="btn btn-outline-secondary btn-sm" onClick={redo} disabled={redoStack.length === 0}>
                        Redo
                    </button>
                    <button className="btn btn-outline-danger btn-sm" onClick={resetToDefault}>
                        Reset to default
                    </button>
                </div>
            </div>

            {saveErrors && saveErrors.length > 0 && (
                <div className="alert alert-danger py-2 small mb-2">
                    <div className="fw-bold">Invalid config:</div>
                    <ul className="mb-0">
                        {saveErrors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                </div>
            )}

            <div className="ctl-el-list">
                {elementsInPhase.map(([key, el]) => (
                    <ElementBlock
                        key={key}
                        elementKey={key}
                        element={el}
                        currentPhase={currentPhase}
                        channelId={channelId}
                        seriesId={seriesId}
                        config={config}
                        onSetPlacement={setPlacement}
                        onSetPersistent={setPersistent}
                        onPatchElement={patchElement}
                        onRemove={removeElement}
                    />
                ))}
                {elementsInPhase.length === 0 && (
                    <div className="text-secondary small">No elements in this stage.</div>
                )}
            </div>
        </div>
    )
}
