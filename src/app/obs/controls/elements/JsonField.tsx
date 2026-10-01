'use client'

// `JsonField` / `isCustomBlob`, moved unchanged out of SportStyleBoardSettings.tsx so the `ripsScene`
// panel (RipsSceneSettings.tsx, rips-scene-plan.md §6) can share the same paste-JSON editor.

import {useEffect, useRef, useState} from 'react'

/** Whether an element's blob (`turf`/`patch`) has actually been customised, for the collapsed
 *  editor's summary line — a plain deep-equal-by-string-compare against the built-in default,
 *  since `undefined`/`null` (never touched) and a value round-tripped back to the exact default
 *  should both read as "default", not "custom". */
export function isCustomBlob(value: unknown, defaultValue: unknown): boolean {
    if (value === undefined || value === null) return false
    return JSON.stringify(value) !== JSON.stringify(defaultValue)
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
export function JsonField({label, value, defaultValue, onApply}: JsonFieldProps) {
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
