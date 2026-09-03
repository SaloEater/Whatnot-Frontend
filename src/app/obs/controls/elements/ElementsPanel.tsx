'use client'

// Elements section of the controls page main column (folded in from the old channel/[id]/widgets
// LayoutBuilder tab — see obs-layout-plan.md §1.6/§1.7). Owns add/remove/undo/redo/reset for
// config.elements and auto-saves every change through controls.pushConfig().

import {useEffect, useRef, useState} from 'react'
import type {Box, Cue, Element, LayoutConfig, PlacementKey} from '@/app/obs/layout/schema'
import {REGISTRY, makeElement, registryIdOf} from '@/app/obs/layout/registry'
import type {RegistryId} from '@/app/obs/layout/registry'
import {defaultConfig, isVisible, resolveBox} from '@/app/obs/layout/config'
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
    /** Reports every save so the page can raise its notice — see doPush(). */
    onPushResult?: (result: {error?: string; warning?: string}) => void
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function ElementsPanel({controls, channelId, seriesId, onPushResult}: Props) {
    const {config, setConfigLocal, pushConfig, apply, state, emitCue} = controls
    const currentPhase = state.phase

    // Lets an element's own settings panel push a cue through the same state-update path the
    // Actions strip uses (obs-layout-plan.md §2.8's cards mark-sold cue is the first caller).
    // State itself is unchanged — only the cue rides along — so this never touches the stage or
    // any override.
    async function fireCue(cue: Cue) {
        onPushResult?.(await apply(state, cue))
    }

    // How many columns the element list itself is laid out in — a view preference, not config, so
    // it lives in localStorage per channel rather than going anywhere near LayoutConfig. Restored
    // after mount (localStorage does not exist during SSR, and reading it in the initialiser would
    // desync server and client markup).
    const listOrderKey = `obs-controls-${channelId}-el-order`
    const listColumnsKey = `obs-controls-${channelId}-el-columns`
    const [listColumns, setListColumns] = useState(1)
    useEffect(() => {
        try {
            const stored = parseInt(localStorage.getItem(listColumnsKey) ?? '', 10)
            if (stored >= 1 && stored <= 3) setListColumns(stored)
        } catch {
            // Storage unavailable — one column for this session.
        }
    }, [listColumnsKey])

    // Display order of the element blocks, as a list of element keys. Kept in localStorage rather
    // than in LayoutConfig for two reasons: it is a view preference (the layout page paints by `z`,
    // not by this), and `config` is stored in a JSONB column, which does not preserve object key
    // order — reordering the keys there would simply be normalised away on the next read.
    const [listOrder, setListOrder] = useState<string[]>([])
    useEffect(() => {
        try {
            const raw = localStorage.getItem(listOrderKey)
            const parsed: unknown = raw ? JSON.parse(raw) : null
            if (Array.isArray(parsed)) setListOrder(parsed.filter((k): k is string => typeof k === 'string'))
        } catch {
            // Unparseable or storage unavailable — fall back to config order.
        }
    }, [listOrderKey])

    function saveListOrder(next: string[]) {
        setListOrder(next)
        try {
            localStorage.setItem(listOrderKey, JSON.stringify(next))
        } catch {
            // View preference only — never worth breaking the panel over.
        }
    }

    function changeListColumns(next: number) {
        setListColumns(next)
        try {
            localStorage.setItem(listColumnsKey, String(next))
        } catch {
            // Same as above: a view preference is never worth breaking the panel over.
        }
    }

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
        // A push can succeed against the backend yet never reach OBS (socket down) — that comes
        // back as `warning`, which used to be dropped here. Hand every result to the page so it
        // raises the same notice an Actions-strip send would.
        onPushResult?.(result)
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
    // Anything the stored order has not seen yet sorts last within its group; `sort` is stable, so
    // those keep their config order relative to each other.
    const orderIndex = (key: string) => {
        const i = listOrder.indexOf(key)
        return i === -1 ? Number.MAX_SAFE_INTEGER : i
    }
    const elementsInPhase = Object.entries(config.elements)
        .filter(([, el]) => !!resolveBox(el, currentPhase))
        // Stage-specific elements first, persistent ones below; within a group, the operator's
        // stored order.
        .sort(
            (a, b) =>
                Number(isPersistent(a)) - Number(isPersistent(b)) || orderIndex(a[0]) - orderIndex(b[0])
        )

    /**
     * Move an element one place up or down the visible list. This rewrites the stored order only —
     * it never touches `config`, so there is no save, no bus emit and nothing for OBS to react to.
     *
     * The list is grouped (stage-specific first, persistent after), so a swap across that boundary
     * would be reordered straight back by the sort and read as a dead button; `canMove` disables
     * the button at each group's edge instead.
     */
    function moveElement(key: string, direction: -1 | 1) {
        const index = elementsInPhase.findIndex(([k]) => k === key)
        const target = elementsInPhase[index + direction]
        if (index < 0 || !target) return
        if (isPersistent(elementsInPhase[index]) !== isPersistent(target)) return

        // Normalise first: the stored list may be missing elements added since it was written, and
        // may still name ones that have been removed.
        const all = Object.keys(config.elements)
        const known = listOrder.filter(k => all.includes(k))
        const seq = [...known, ...all.filter(k => !known.includes(k))]

        const a = seq.indexOf(key)
        const b = seq.indexOf(target[0])
        if (a < 0 || b < 0) return
        const next = [...seq]
        next[a] = target[0]
        next[b] = key
        saveListOrder(next)
    }

    /**
     * Live show/hide. This is STATE, not config: the element keeps its placement and stays in the
     * list, it simply stops being rendered. Removing it from the stage is a different action (the
     * "Remove from this stage" link in the block), and conflating the two is why unchecking used to
     * make the block vanish.
     */
    function setVisible(key: string, visible: boolean) {
        const overrides = {...state.overrides, [key]: {...state.overrides?.[key], visible}}
        void apply({...state, overrides}).then(result => onPushResult?.(result))
    }

    function canMove(key: string, direction: -1 | 1): boolean {
        const index = elementsInPhase.findIndex(([k]) => k === key)
        const target = elementsInPhase[index + direction]
        if (index < 0 || !target) return false
        return isPersistent(elementsInPhase[index]) === isPersistent(target)
    }

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
        // Elements born persistent (e.g. the frame) already cover this stage via `all`. Everything
        // else gets EXACTLY this stage — assigned, not merged: `makeElement` used to pre-seed a
        // default stage, so adding a text box while on a custom stage put it in that stage and in
        // `selling`, and it showed up in both stages' element lists.
        if ('placements' in el && !el.placements.all) {
            el.placements = {[currentPhase]: boxForPhase(el, regId)}
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
            const rest: Record<string, Element> = {}
            for (const [k, el] of Object.entries(c.elements)) {
                if (k === key) continue
                // Clear any `target` that pointed at the element being removed. The validator
                // requires a target to name an existing element, so leaving the stale reference
                // makes the whole config invalid and the removal is refused — which reads as "I
                // can't delete this board" rather than "something still points at it". Dropping
                // the field degrades gracefully: an animation with no target falls back to the
                // first board in the config (see StashOrPassWrap).
                if ('target' in el && el.target === key) {
                    const {target: _removed, ...withoutTarget} = el
                    rest[k] = withoutTarget as Element
                    continue
                }
                rest[k] = el
            }
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
                    <label className="form-label mb-0 small text-nowrap" htmlFor="ctl-el-columns">
                        Columns {listColumns}
                    </label>
                    <input
                        id="ctl-el-columns"
                        type="range"
                        className="form-range ctl-el-columns-range"
                        min={1}
                        max={3}
                        step={1}
                        value={listColumns}
                        onChange={(e) => changeListColumns(parseInt(e.target.value, 10) || 1)}
                    />
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

            <div className="ctl-el-list" style={{'--ctl-el-columns': listColumns} as React.CSSProperties}>
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
                        visible={isVisible(state, key)}
                        onSetVisible={setVisible}
                        onMove={moveElement}
                        canMoveUp={canMove(key, -1)}
                        canMoveDown={canMove(key, 1)}
                        onFireCue={fireCue}
                        onEmitCue={emitCue}
                    />
                ))}
                {elementsInPhase.length === 0 && (
                    <div className="text-secondary small">No elements in this stage.</div>
                )}
            </div>
        </div>
    )
}
