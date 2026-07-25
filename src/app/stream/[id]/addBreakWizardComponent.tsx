'use client'

import {FC, useState} from "react";
import {TYPE_NAMES} from "@/app/break/[id]/addNewCardComponent";

interface AddBreakWizardProps {
    onAdd: (name: string, customSpots: string[]) => Promise<void>
}

type AddMode = 'count' | 'name'

interface CustomSpotRow {
    chosen: boolean
    text: string
    count: number
}

const CUSTOM_SPOT_OPTION = 'Custom…'
const SPOT_OPTIONS = [...Object.values(TYPE_NAMES), 'Chaser']
const SPOT_SELECT_OPTIONS = [...SPOT_OPTIONS, CUSTOM_SPOT_OPTION]

function emptyRow(): CustomSpotRow {
    return {chosen: false, text: '', count: 1}
}

export const AddBreakWizardComponent: FC<AddBreakWizardProps> = ({onAdd}) => {
    const [isOpen, setIsOpen] = useState(false)
    const [mode, setMode] = useState<AddMode>('count')
    const [count, setCount] = useState(1)
    const [name, setName] = useState('')
    const [customSpotsEnabled, setCustomSpotsEnabled] = useState(false)
    const [customSpotRows, setCustomSpotRows] = useState<CustomSpotRow[]>([emptyRow()])
    const [isAdding, setIsAdding] = useState(false)

    function getCustomSpots(): string[] {
        if (!customSpotsEnabled) return []
        return customSpotRows.flatMap(row => {
            if (!row.chosen) return []
            const effectiveName = row.text.trim()
            if (!effectiveName) return []
            const count = Math.max(1, row.count)
            if (effectiveName === 'Miscellaneous') {
                return Array(count).fill(effectiveName)
            }
            if (count === 1) return [effectiveName]
            return Array.from({length: count}, (_, idx) => `${effectiveName} ${idx + 1}`)
        })
    }

    function hasInvalidCustomRow(): boolean {
        return customSpotsEnabled && customSpotRows.some(row => !row.chosen || !row.text.trim())
    }

    function addRow() {
        setCustomSpotRows(rows => [...rows, emptyRow()])
    }

    function removeRow(i: number) {
        setCustomSpotRows(rows => rows.filter((_, idx) => idx !== i))
    }

    function chooseRowOption(i: number, option: string) {
        const text = option === CUSTOM_SPOT_OPTION ? '' : option
        setCustomSpotRows(rows => rows.map((row, idx) => idx === i ? {...row, chosen: true, text} : row))
    }

    function resetRow(i: number) {
        setCustomSpotRows(rows => rows.map((row, idx) => idx === i ? {...row, chosen: false, text: ''} : row))
    }

    function updateRow(i: number, field: keyof CustomSpotRow, value: string | number) {
        setCustomSpotRows(rows => rows.map((row, idx) => idx === i ? {...row, [field]: value} : row))
    }

    async function handleAdd() {
        const spots = getCustomSpots()
        setIsAdding(true)
        try {
            if (mode === 'count') {
                for (let i = 1; i <= count; i++) {
                    await onAdd(`Break ${i}`, spots)
                }
            } else {
                await onAdd(name, spots)
                setName('')
            }
        } finally {
            setIsAdding(false)
            setIsOpen(false)
        }
    }

    return (
        <div className="mt-2">
            <button className="btn btn-primary btn-sm" onClick={() => setIsOpen(o => !o)}>
                Add Breaks
            </button>
            {isOpen && (
                <div className="border border-primary rounded p-3 mt-2">
                    <div className="d-flex gap-3 mb-3">
                        <div className="form-check">
                            <input className="form-check-input" type="radio" id="modeCount" checked={mode === 'count'} onChange={() => setMode('count')}/>
                            <label className="form-check-label" htmlFor="modeCount">Add by count</label>
                        </div>
                        <div className="form-check">
                            <input className="form-check-input" type="radio" id="modeName" checked={mode === 'name'} onChange={() => setMode('name')}/>
                            <label className="form-check-label" htmlFor="modeName">Add by name</label>
                        </div>
                    </div>

                    {mode === 'count' && (
                        <div className="mb-3">
                            <label className="form-label">Amount</label>
                            <input
                                type="number"
                                className="form-control"
                                min={1}
                                value={count}
                                onChange={e => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                        </div>
                    )}

                    {mode === 'name' && (
                        <div className="mb-3">
                            <label className="form-label">Name</label>
                            <input
                                type="text"
                                className="form-control"
                                placeholder="Enter break name"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && name) handleAdd() }}
                            />
                        </div>
                    )}

                    <div className="mb-3">
                        <div className="form-check mb-2">
                            <input className="form-check-input" type="checkbox" id="customSpotsCheck" checked={customSpotsEnabled} onChange={e => setCustomSpotsEnabled(e.target.checked)}/>
                            <label className="form-check-label" htmlFor="customSpotsCheck">Add custom spots</label>
                        </div>
                        {customSpotsEnabled && (
                            <>
                                <table className="table table-sm mb-1">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Count</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {customSpotRows.map((row, i) => (
                                            <tr key={i}>
                                                <td>
                                                    {row.chosen ? (
                                                        <div className="d-flex gap-1">
                                                            <input
                                                                type="text"
                                                                className="form-control form-control-sm"
                                                                placeholder="Spot name"
                                                                value={row.text}
                                                                onChange={e => updateRow(i, 'text', e.target.value)}
                                                            />
                                                            <button
                                                                type="button"
                                                                className="btn btn-sm btn-outline-secondary"
                                                                title="Choose another type"
                                                                onClick={() => resetRow(i)}
                                                            >
                                                                ↺
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value=""
                                                            onChange={e => chooseRowOption(i, e.target.value)}
                                                        >
                                                            <option value="" disabled>Choose type…</option>
                                                            {SPOT_SELECT_OPTIONS.map(opt => (
                                                                <option key={opt} value={opt}>{opt}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </td>
                                                <td>
                                                    <input
                                                        type="number"
                                                        className="form-control form-control-sm"
                                                        min={1}
                                                        value={row.count}
                                                        onChange={e => updateRow(i, 'count', Math.max(1, parseInt(e.target.value) || 1))}
                                                    />
                                                </td>
                                                <td>
                                                    <button className="btn btn-sm btn-outline-danger" onClick={() => removeRow(i)}>×</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <button className="btn btn-sm btn-outline-secondary" onClick={addRow}>+ Add row</button>
                            </>
                        )}
                    </div>

                    <div className="d-flex justify-content-end gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => setIsOpen(false)} disabled={isAdding}>Cancel</button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleAdd}
                            disabled={isAdding || (mode === 'name' && !name) || hasInvalidCustomRow()}
                        >
                            {isAdding ? 'Adding…' : 'Add'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
