'use client'

// Whole-page body for a `price_ranges` series (series-price-ranges-plan.md §3.3) — rendered by
// ./page.tsx's `if (series.kind === 'price_ranges')` branch instead of the photo-grid body below
// it. A ranges series never has photos, so there is no Total cards editor, no Side Cards Price, no
// Team Prices link, no photo grid, no dev switch — just the header (name/status/close/delete) and
// the ranges table (shared with the OBS controls settings panel via seriesPriceRangesEditor.tsx).

import {useState} from "react";
import type {Dispatch, SetStateAction} from "react";
import {useRouter} from "next/navigation";
import {getEndpoints, post} from "@/app/lib/backend";
import {Series} from "@/app/entity/entities";
import SeriesPriceRangesEditor from "@/app/component/seriesPriceRangesEditor";

type Props = {
    series: Series
    onSeriesChange: Dispatch<SetStateAction<Series | null>>
}

export function PriceRangesSeriesView({series, onSeriesChange}: Props) {
    const router = useRouter()
    const [editingName, setEditingName] = useState(false)
    const [nameInput, setNameInput] = useState(series.name)

    function saveName() {
        if (!nameInput.trim() || nameInput === series.name) {
            setEditingName(false)
            return
        }
        // Same request shape as the cards page's saveName — used_cards/total_cards/default_price
        // are passed through unchanged, only `name` differs.
        post(getEndpoints().series_update, {
            id: series.id,
            name: nameInput,
            used_cards: series.used_cards,
            total_cards: series.total_cards,
            default_price: series.default_price,
        }).then(() => {
            onSeriesChange((s) => s ? {...s, name: nameInput} : s)
            setEditingName(false)
        })
    }

    function closeSeries() {
        post(getEndpoints().series_close, {id: series.id}).then(() => {
            onSeriesChange((s) => s ? {...s, status: 'closed'} : s)
        })
    }

    function deleteSeries() {
        post(getEndpoints().series_delete, {id: series.id}).then(() => {
            router.push('/series')
        })
    }

    return (
        <main className="container py-3">
            <div className="d-flex align-items-center gap-2 mb-3">
                {editingName ? (
                    <>
                        <input
                            className="form-control"
                            style={{maxWidth: '300px'}}
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveName()}
                            autoFocus
                        />
                        <button className="btn btn-sm btn-success" onClick={saveName}>Save</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingName(false)}>Cancel</button>
                    </>
                ) : (
                    <>
                        <h4 className="mb-0">{series.name}</h4>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingName(true)}>Rename</button>
                    </>
                )}
                <span className={`badge ${series.status === 'open' ? 'bg-warning text-dark' : 'bg-success'}`}>
                    {series.status}
                </span>
                <span className="badge bg-info text-dark">Price ranges</span>
            </div>

            <div className="d-flex justify-content-between mb-4">
                <div>
                    {/* A ranges series never has photos to guard against, unlike the cards page's
                        `photos.length === 0` gate — always available. */}
                    <button className="btn btn-danger" onClick={deleteSeries}>Delete Series</button>
                </div>
                <div>
                    {series.status === 'open' && (
                        <button className="btn btn-warning" onClick={closeSeries}>Close Series</button>
                    )}
                </div>
            </div>

            <SeriesPriceRangesEditor seriesId={series.id}/>
        </main>
    )
}

export default PriceRangesSeriesView
