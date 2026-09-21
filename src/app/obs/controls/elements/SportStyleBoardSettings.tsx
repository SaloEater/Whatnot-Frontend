'use client'

// Settings for `board:sport_style` (sport-style-board-plan.md §5): the operator edits only the box
// WIDTH (in the Box section every element block already has) and Cells per row here — height and
// cell size are derived (SportStyleBoard.tsx §4.2). Everything below goes through `onPatchElement`
// (ElementsPanel's `mutate` -> debounced `pushConfig`, same path every other config-stored setting
// uses) — no `useSettingWrite`, since the config path already pushes to OBS and none of this lives
// on the backend.
//
// Turf recipe / patch style are opaque JSON blobs (schema.ts: `turf?: unknown; patch?: unknown`) —
// this panel is deliberately copy/paste, not a knob-by-knob editor: paste the Export output from
// /obs/setup/sport_style/board or /obs/setup/sport_style/team verbatim. Apply only ever checks that
// the pasted text is valid JSON for a plain object; it never validates individual fields (an odd or
// missing key is the running element's problem to cope with via its own merge-over-defaults, not
// this panel's).

import {useEffect, useRef, useState} from 'react'
import type {Element, Phase, TransientCue} from '@/app/obs/layout/schema'
import {DEFAULT_COLS, DEFAULT_PATCH, DEFAULT_TURF, FIELD} from '@/app/obs/sport_style/fieldConstants'
import type {PatchElement} from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    currentPhase: Phase
    onPatchElement: PatchElement
    onEmitCue?: (cue: TransientCue) => void
}

const DEFAULT_SLOTS = 40
const MIN_COLS = 1
const MAX_COLS = 20
const MIN_MARGIN = 0
const MAX_MARGIN = 200

/** The same height formula SportStyleBoard.tsx's geometry uses (sport-style-board-plan.md §4.2,
 *  R1 fix 5), fed by a display-only slot count rather than the break's real event count — this
 *  panel has no access to `events` (it isn't rendered inside a `<LayoutDataProvider>` the way the
 *  board is). `margin` is a transparent outer band; `edgeGap` comes from the turf blob (R1 fix 5, revised). */
function fieldHeightFor(boxW: number, cols: number, slots: number, margin: number, edgeGap: number): {rows: number; height: number} {
    const rows = slots > 0 ? Math.ceil(slots / cols) : 0
    const cellPx = rows > 0 ? Math.max(1, Math.floor((boxW - 2 * margin - 2 * edgeGap) / cols)) : 0
    const height = rows > 0 ? rows * cellPx + 2 * edgeGap + 2 * margin : 2 * edgeGap + 2 * margin
    return {rows, height}
}

type JsonFieldProps = {
    label: string
    value: unknown
    defaultValue: unknown
    onApply: (parsed: object) => void
}

/** One draft textarea with the Apply/Copy/Discard pattern (TextSettings.tsx's draft convention,
 *  the same Apply/Copy shape the two sport_style playgrounds already use for their own JSON
 *  export/import). Apply does `JSON.parse` only — a syntax error (or non-object JSON) is shown
 *  inline and nothing is written; any parsable object is accepted as-is (sport-style-board-plan.md
 *  §5: "this is not content validation"). */
function JsonField({label, value, defaultValue, onApply}: JsonFieldProps) {
    const savedText = JSON.stringify(value ?? defaultValue, null, 2)
    const [draft, setDraft] = useState(savedText)
    const [error, setError] = useState<string | null>(null)
    const [copyFeedback, setCopyFeedback] = useState(false)
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Re-seed when the stored value changes underneath (another session, an undo, a preset) —
    // same convention as TextSettings.tsx.
    useEffect(() => {
        setDraft(savedText)
        setError(null)
    }, [savedText])

    const dirty = draft !== savedText

    function apply() {
        let parsed: unknown
        try {
            parsed = JSON.parse(draft)
        } catch (err) {
            setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
            return
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            setError('JSON must be an object')
            return
        }
        setError(null)
        onApply(parsed)
    }

    function discard() {
        setDraft(savedText)
        setError(null)
    }

    async function copy() {
        try {
            await navigator.clipboard.writeText(draft)
            setCopyFeedback(true)
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
            copyTimeoutRef.current = setTimeout(() => setCopyFeedback(false), 1500)
        } catch {
            // clipboard API can throw (permissions, insecure context, etc.) — nothing to recover,
            // just skip the "Copied" feedback.
        }
    }

    return (
        <div className="mb-3">
            <label className="form-label mb-0 small">{label}</label>
            <textarea
                className="form-control form-control-sm font-monospace"
                rows={10}
                spellCheck={false}
                value={draft}
                onChange={(e) => {
                    setDraft(e.target.value)
                    setError(null)
                }}
            />
            <div className="d-flex align-items-center gap-2 mt-1">
                <button type="button" className="btn btn-sm btn-primary" disabled={!dirty} onClick={apply}>
                    Apply
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={copy}>
                    Copy
                </button>
                {copyFeedback && <span className="small text-success">Copied</span>}
                {dirty && (
                    <button type="button" className="btn btn-sm btn-link p-0" onClick={discard}>
                        Discard
                    </button>
                )}
            </div>
            {error && <div className="small text-danger mt-1">{error}</div>}
        </div>
    )
}

export default function SportStyleBoardSettings({elementKey, element, currentPhase, onPatchElement, onEmitCue}: Props) {
    const [slots, setSlots] = useState(DEFAULT_SLOTS)

    if (element.kind !== 'board') return null

    const cols = Math.max(MIN_COLS, Math.min(MAX_COLS, element.cols ?? DEFAULT_COLS))
    const margin = Math.max(MIN_MARGIN, Math.min(MAX_MARGIN, element.margin ?? 0))
    // The field's own edge gap is a key of the turf blob (same as the playground's export); read it
    // leniently, falling back to the default recipe's value.
    const turfBlob = element.turf
    const turfEdgeGap = typeof turfBlob === 'object' && turfBlob !== null && !Array.isArray(turfBlob)
        ? (turfBlob as Record<string, unknown>).edgeGap
        : undefined
    const edgeGap = typeof turfEdgeGap === 'number' && Number.isFinite(turfEdgeGap) ? Math.max(0, turfEdgeGap) : DEFAULT_TURF.edgeGap
    const box = element.placements[currentPhase] ?? element.placements.all
    const {rows, height} = fieldHeightFor(box?.w ?? 0, cols, slots, margin, edgeGap)

    function setCols(next: number) {
        const clamped = Math.max(MIN_COLS, Math.min(MAX_COLS, Math.round(next) || DEFAULT_COLS))
        onPatchElement(elementKey, {cols: clamped})
    }

    // R3.4: two selects, config path like every other setting here — no validation, the component
    // narrows with a default exactly like `cols`/`turf`/`patch`.
    const edgeMode = element.edgeMode === 'tiered' ? 'tiered' : 'plain'
    const sortMode = element.sortMode === 'centered' ? 'centered' : 'alphabetical'

    function setMargin(next: number) {
        // Unlike `setCols` above, 0 is a valid margin — `|| FIELD.edgeGap` would silently replace
        // a deliberate 0 with the default, so only a genuinely non-finite input (an empty field)
        // falls back to it.
        const rounded = Number.isFinite(next) ? Math.round(next) : 0
        const clamped = Math.max(MIN_MARGIN, Math.min(MAX_MARGIN, rounded))
        onPatchElement(elementKey, {margin: clamped})
    }

    function fitHeight() {
        if (!box) return
        onPatchElement(elementKey, {
            placements: {...element.placements, [currentPhase]: {...box, h: height}},
        })
    }

    return (
        <div>
            <div className="d-flex gap-3 mb-2">
                <div>
                    <label className="form-label mb-0 small">Cells per row</label>
                    <input
                        type="number"
                        min={MIN_COLS}
                        max={MAX_COLS}
                        className="form-control form-control-sm"
                        style={{width: '90px'}}
                        value={cols}
                        onChange={(e) => setCols(parseInt(e.target.value, 10))}
                    />
                </div>
                <div>
                    <label className="form-label mb-0 small" title="Transparent band between the element edge and the field. The field's own edge gap (field edge → lines) is the turf recipe's edgeGap key.">Margin</label>
                    <input
                        type="number"
                        min={MIN_MARGIN}
                        max={MAX_MARGIN}
                        className="form-control form-control-sm"
                        style={{width: '90px'}}
                        value={margin}
                        onChange={(e) => setMargin(parseInt(e.target.value, 10))}
                    />
                </div>
                <div>
                    <label className="form-label mb-0 small">Edge</label>
                    <select
                        className="form-select form-select-sm"
                        value={edgeMode}
                        onChange={(e) => onPatchElement(elementKey, {edgeMode: e.target.value as 'plain' | 'tiered'})}
                    >
                        <option value="plain">Plain</option>
                        <option value="tiered">Tiered</option>
                    </select>
                </div>
                <div>
                    <label className="form-label mb-0 small">Sort</label>
                    <select
                        className="form-select form-select-sm"
                        value={sortMode}
                        onChange={(e) => onPatchElement(elementKey, {sortMode: e.target.value as 'alphabetical' | 'centered'})}
                    >
                        <option value="alphabetical">Alphabetical</option>
                        <option value="centered">Centered</option>
                    </select>
                </div>
            </div>
            <div className="mb-2">
                <label className="form-label mb-0 small" title="Display-only — not saved. Feeds the height readout below with a slot count, since this panel has no live event data of its own.">
                    Slots (for height readout)
                </label>
                <input
                    type="number"
                    min={0}
                    className="form-control form-control-sm"
                    style={{width: '90px'}}
                    value={slots}
                    onChange={(e) => setSlots(Math.max(0, parseInt(e.target.value, 10) || 0))}
                />
            </div>
            <div className="small text-muted mb-2">
                Field needs {height}px for {rows} row{rows === 1 ? '' : 's'}
                {box ? ` (current box ${box.h}px)` : ' — not placed in this stage'}
            </div>
            <button type="button" className="btn btn-sm btn-outline-secondary mb-3" onClick={fitHeight} disabled={!box}>
                Fit height
            </button>

            <div className="d-flex gap-2 mb-3">
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => onEmitCue?.({kind: 'sport-style-regenerate', target: 'turf'})}
                >
                    Regenerate turf
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => onEmitCue?.({kind: 'sport-style-regenerate', target: 'wear'})}
                >
                    Regenerate teams
                </button>
            </div>

            <JsonField
                label="Turf recipe (JSON)"
                value={element.turf}
                defaultValue={DEFAULT_TURF}
                onApply={(parsed) => onPatchElement(elementKey, {turf: parsed})}
            />
            <JsonField
                label="Patch style (JSON)"
                value={element.patch}
                defaultValue={DEFAULT_PATCH}
                onApply={(parsed) => onPatchElement(elementKey, {patch: parsed})}
            />
        </div>
    )
}
