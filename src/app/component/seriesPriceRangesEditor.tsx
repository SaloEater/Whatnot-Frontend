'use client'

// Shared "ranges" table editor for a `price_ranges` series (series-price-ranges-plan.md §3.3/§4.6).
// Used by both the admin series detail page (src/app/series/[id]/priceRangesSeriesView.tsx) and the
// OBS controls settings panel (src/app/obs/controls/elements/PriceRangesSettings.tsx). The component
// itself is generic — it always calls post() to build each write — and the host decides how that
// write is wrapped: the admin page lets it run bare, the controls panel routes it through
// useSettingWrite() (via the `onWrite` prop) so a save also pushes an immediate spine refetch.
//
// One row per price band, ordered by `price_from` ascending (server-authoritative — see
// series-price-ranges-plan.md §1.2). An empty "To" input means open-ended and is sent as `null`;
// it renders as "$500+" everywhere else in the product (OBS render, totals).

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {SeriesPriceRange} from '@/app/entity/entities'

type Props = {
    seriesId: number
    // Lets the host route a write through its own wrapper (e.g. useSettingWrite) instead of
    // letting it run bare. Defaults to just invoking `write()` directly (the admin page's case).
    onWrite?: (write: () => Promise<unknown>) => Promise<unknown>
}

type RowDraft = {
    priceFrom: string
    priceTo: string
    count: string
}

function draftFromRange(r: SeriesPriceRange): RowDraft {
    return {
        priceFrom: String(r.price_from),
        priceTo: r.price_to === null ? '' : String(r.price_to),
        count: String(r.count),
    }
}

function formatRange(priceFrom: number, priceTo: number | null): string {
    return priceTo === null ? `$${priceFrom}+` : `$${priceFrom}–$${priceTo}`
}

function isErrorResponse(v: unknown): boolean {
    return typeof v === 'object' && v !== null && 'error' in (v as Record<string, unknown>)
}

export default function SeriesPriceRangesEditor({seriesId, onWrite}: Props) {
    const [ranges, setRanges] = useState<SeriesPriceRange[]>([])
    const [loading, setLoading] = useState(true)
    const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
    const [savingId, setSavingId] = useState<number | null>(null)
    const [addDraft, setAddDraft] = useState<RowDraft>({priceFrom: '', priceTo: '', count: ''})
    const [adding, setAdding] = useState(false)

    function fetchRanges() {
        return post(getEndpoints().series_price_ranges, {series_id: seriesId}).then((data: SeriesPriceRange[]) => {
            const list = Array.isArray(data) ? data : []
            setRanges(list)
            setDrafts(Object.fromEntries(list.map((r) => [r.id, draftFromRange(r)])))
            setLoading(false)
        })
    }

    useEffect(() => {
        fetchRanges()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [seriesId])

    async function runWrite(write: () => Promise<unknown>) {
        if (onWrite) return onWrite(write)
        return write()
    }

    function updateDraft(id: number, patch: Partial<RowDraft>) {
        setDrafts((old) => ({...old, [id]: {...old[id], ...patch}}))
    }

    async function saveRow(r: SeriesPriceRange) {
        const draft = drafts[r.id]
        if (!draft) return
        const priceFrom = parseInt(draft.priceFrom)
        const priceTo = draft.priceTo.trim() === '' ? null : parseInt(draft.priceTo)
        const count = parseInt(draft.count)
        if (isNaN(priceFrom) || isNaN(count) || (priceTo !== null && isNaN(priceTo))) return

        setSavingId(r.id)
        const resp = await runWrite(() => post(getEndpoints().series_price_ranges_update, {
            id: r.id,
            price_from: priceFrom,
            price_to: priceTo,
            count,
        }))
        setSavingId(null)
        if (!isErrorResponse(resp)) {
            await fetchRanges()
        }
    }

    async function removeRow(id: number) {
        const resp = await runWrite(() => post(getEndpoints().series_price_ranges_delete, {id}))
        if (!isErrorResponse(resp)) {
            await fetchRanges()
        }
    }

    async function addRow() {
        const priceFrom = parseInt(addDraft.priceFrom)
        const priceTo = addDraft.priceTo.trim() === '' ? null : parseInt(addDraft.priceTo)
        const count = parseInt(addDraft.count)
        if (isNaN(priceFrom) || isNaN(count) || (priceTo !== null && isNaN(priceTo))) return

        setAdding(true)
        const resp = await runWrite(() => post(getEndpoints().series_price_ranges_create, {
            series_id: seriesId,
            price_from: priceFrom,
            price_to: priceTo,
            count,
        }))
        setAdding(false)
        if (!isErrorResponse(resp)) {
            setAddDraft({priceFrom: '', priceTo: '', count: ''})
            await fetchRanges()
        }
    }

    const total = ranges.reduce((sum, r) => sum + r.count, 0)

    if (loading) {
        return <div className="text-secondary small">Loading ranges…</div>
    }

    return (
        <div>
            <table className="table table-sm table-dark align-middle" style={{maxWidth: '560px'}}>
                <thead>
                    <tr>
                        <th>From</th>
                        <th>To</th>
                        <th>Count</th>
                        <th></th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {ranges.map((r) => {
                        const draft = drafts[r.id] ?? draftFromRange(r)
                        return (
                            <tr key={r.id}>
                                <td>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        style={{width: '90px'}}
                                        value={draft.priceFrom}
                                        onChange={(e) => updateDraft(r.id, {priceFrom: e.target.value})}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        style={{width: '90px'}}
                                        placeholder="open-ended"
                                        value={draft.priceTo}
                                        onChange={(e) => updateDraft(r.id, {priceTo: e.target.value})}
                                    />
                                </td>
                                <td>
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        style={{width: '80px'}}
                                        value={draft.count}
                                        onChange={(e) => updateDraft(r.id, {count: e.target.value})}
                                    />
                                </td>
                                <td className="text-secondary small text-nowrap">
                                    {formatRange(r.price_from, r.price_to)}
                                </td>
                                <td className="text-nowrap">
                                    <button
                                        className="btn btn-sm btn-success me-1"
                                        disabled={savingId === r.id}
                                        onClick={() => saveRow(r)}
                                    >
                                        {savingId === r.id ? 'Saving…' : 'Save'}
                                    </button>
                                    <button className="btn btn-sm btn-danger" onClick={() => removeRow(r.id)}>
                                        Remove
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                    {ranges.length === 0 && (
                        <tr><td colSpan={5} className="text-secondary">No ranges yet.</td></tr>
                    )}
                    <tr>
                        <td>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '90px'}}
                                placeholder="From"
                                value={addDraft.priceFrom}
                                onChange={(e) => setAddDraft((d) => ({...d, priceFrom: e.target.value}))}
                            />
                        </td>
                        <td>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '90px'}}
                                placeholder="open-ended"
                                value={addDraft.priceTo}
                                onChange={(e) => setAddDraft((d) => ({...d, priceTo: e.target.value}))}
                            />
                        </td>
                        <td>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '80px'}}
                                placeholder="Count"
                                value={addDraft.count}
                                onChange={(e) => setAddDraft((d) => ({...d, count: e.target.value}))}
                            />
                        </td>
                        <td></td>
                        <td>
                            <button className="btn btn-sm btn-primary" disabled={adding} onClick={addRow}>
                                {adding ? 'Adding…' : 'Add range'}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div className="text-secondary">Total cards: <span className="fw-bold text-white">{total}</span></div>
        </div>
    )
}
