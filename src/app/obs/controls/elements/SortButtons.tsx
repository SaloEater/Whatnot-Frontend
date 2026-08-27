'use client'

// Sort picker shared by the `results` and `resultsThin` settings panels. A button group rather
// than a <select> so the available modes and the current one are both readable without opening
// anything — the operator is scanning this panel mid-stream, not filling in a form.
//
// The options live here rather than in each panel so the two elements can never drift apart on
// labels or ordering.

import type { ResultsSort } from '@/app/obs/layout/schema'

const OPTIONS: ReadonlyArray<{ value: ResultsSort; label: string; title: string }> = [
    {
        value: 'alphabetical',
        label: 'Alphabetical',
        title: 'Team name A-Z; special spots after the teams',
    },
    {
        value: 'customer',
        label: 'By customer',
        title: "Group each buyer's slots together, then team name within a buyer; unsold last",
    },
]

export default function SortButtons({
    value,
    onChange,
}: {
    value: ResultsSort
    onChange: (next: ResultsSort) => void
}) {
    return (
        <div className="mb-2">
            <label className="form-label mb-0 small d-block">Sort</label>
            <div className="btn-group btn-group-sm" role="group" aria-label="Sort order">
                {OPTIONS.map((option) => {
                    const active = option.value === value
                    return (
                        <button
                            key={option.value}
                            type="button"
                            className={`btn ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                            aria-pressed={active}
                            title={option.title}
                            onClick={() => onChange(option.value)}
                        >
                            {option.label}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}
