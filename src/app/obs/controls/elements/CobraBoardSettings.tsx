'use client'

// Settings for the board:cobra element — the whole "Prices" section pulled across from
// src/app/channel/[id]/widgets/page.tsx: Side Cards Price (the series' default_price), Board:
// Price Ranges (tier thresholds — already ported), and Presets (save/apply/delete a snapshot of
// both). All three belong on this element together: a `PresetValue` is exactly
// `{price_from, price_to, ranges}` — cards 1 and 2's values — and CobraBoard.tsx (this element's
// own render component) is what displays both: `series.default_price` as the side-cards fallback
// price, and `priceRanges`/`teamPrices` for the tiered board.
//
// `series_update` is a FULL replace (see NameSettings.tsx/CountSettings.tsx) — every default-price
// save loads the series first and echoes name/used_cards/total_cards back unchanged; sending a
// partial object would blank them.
//
// Spine cues (useSettingWrite.ts): the price-range write already pushed `priceRanges` (unchanged
// below). The default-price write pushes `series` — CobraBoard reads `series.default_price`
// directly. It deliberately does NOT also push `teamPrices`: that source is
// `/api/series/{id}/prices`, which sums each *photo's own* `price` column (set per-card — see
// WhatNot-Webhook-Holder/service/series_get_prices.go and photo_repository.go's
// GetPricesBySeriesId) and is independent of the series' default_price or the price-range tiers.
// So a default-price save only ever needs the one cue. Applying a preset does both writes, so it
// fires both cues (via the same two useSettingWrite instances the individual cards already use).
//
// Apply-preset confirmation: the original page used a Bootstrap modal (`pendingApply` state plus a
// `.modal d-block` overlay). This panel lives inside a settings block in the builder's element
// list rather than a full page, so a `window.confirm()` with an inline before/after summary is
// used instead — much simpler to fit correctly in a tight, variable-width space. Applying a preset
// still can't proceed without that confirmation either way.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {PriceRange, Series, WidgetPreset} from '@/app/entity/entities'
import type {Cue} from '@/app/obs/layout/schema'
import {useSettingWrite} from './useSettingWrite'

const TIER_ALIASES: Record<string, string> = {best: 'God', good: 'Giant', mid: 'Chaser'}

function parsePrice(val: string): [string, string] {
    const range = val.match(/^\$(\d+)-\$(\d+)$/)
    if (range) return [range[1], range[2]]
    const single = val.match(/^\$(\d+)$/)
    if (single) return [single[1], '']
    return ['', '']
}

function buildPrice(from: string, to: string): string {
    if (from && to) return `$${from}-$${to}`
    if (from) return `$${from}`
    return ''
}

interface PresetValue {
    price_from: string
    price_to: string
    ranges: Record<string, number>
}

export default function CobraBoardSettings({channelId, seriesId, onFireCue}: {
    channelId: number
    seriesId?: number | null
    onFireCue?: (cue: Cue) => void
}) {
    // ---- Board: Price Ranges (unchanged) -------------------------------------------------------

    const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
    const [rangeEdits, setRangeEdits] = useState<Record<string, string>>({})
    const {save: writeRange} = useSettingWrite(onFireCue)

    useEffect(() => {
        post(getEndpoints().widget_board_price_ranges_list, {channel_id: channelId})
            .then((d: { ranges: PriceRange[] }) => {
                if (d?.ranges) {
                    setPriceRanges(d.ranges)
                    const edits: Record<string, string> = {}
                    d.ranges.forEach(r => { edits[r.tier_id] = String(r.price_from) })
                    setRangeEdits(edits)
                }
            })
    }, [channelId])

    async function savePriceRange(tierId: string) {
        const priceFrom = parseInt(rangeEdits[tierId]) || 0
        const result = await writeRange('priceRanges', () => post(getEndpoints().widget_board_price_ranges_update, {channel_id: channelId, tier_id: tierId, price_from: priceFrom}))
        if (result.ok) {
            setPriceRanges(prev => prev.map(r => r.tier_id === tierId ? {...r, price_from: priceFrom} : r))
        }
    }

    // ---- Series: Side Cards Price ---------------------------------------------------------------

    const [series, setSeries] = useState<Series | null>(null)
    const [priceFrom, setPriceFrom] = useState('')
    const [priceTo, setPriceTo] = useState('')
    const {save: writePrice, saving: priceSaving, status: priceStatus, reset: resetPriceStatus} = useSettingWrite(onFireCue)

    useEffect(() => {
        if (!seriesId) {
            setSeries(null)
            setPriceFrom('')
            setPriceTo('')
            return
        }
        post(getEndpoints().series_get, {id: seriesId})
            .then((d: Series) => {
                if (!d || 'error' in d) return
                setSeries(d)
                const [f, t] = parsePrice(d.default_price ?? '')
                setPriceFrom(f)
                setPriceTo(t)
            })
    }, [seriesId])

    async function saveDefaultPrice() {
        if (!seriesId || !series || (priceTo && !priceFrom)) return
        const built = buildPrice(priceFrom, priceTo)
        const result = await writePrice('series', () => post(getEndpoints().series_update, {
            id: seriesId,
            name: series.name,
            used_cards: series.used_cards,
            total_cards: series.total_cards,
            default_price: built,
        }))
        if (result.ok) {
            setSeries(prev => prev ? {...prev, default_price: built} : prev)
        }
    }

    // ---- Presets ---------------------------------------------------------------------------------

    const [presets, setPresets] = useState<WidgetPreset[]>([])
    const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null)
    const [newPresetName, setNewPresetName] = useState('')
    const [presetSaving, setPresetSaving] = useState(false)
    const [applying, setApplying] = useState(false)

    useEffect(() => {
        post(getEndpoints().widget_presets_list, {channel_id: channelId})
            .then((d: { presets: WidgetPreset[] }) => setPresets(d?.presets ?? []))
    }, [channelId])

    async function savePreset() {
        const name = newPresetName.trim()
        if (!name) return
        setPresetSaving(true)
        const value = JSON.stringify({
            price_from: priceFrom,
            price_to: priceTo,
            ranges: Object.fromEntries(priceRanges.map(r => [r.tier_id, parseInt(rangeEdits[r.tier_id]) || r.price_from])),
        })
        try {
            await post(getEndpoints().widget_presets_upsert, {channel_id: channelId, name, value})
            const d: { presets: WidgetPreset[] } = await post(getEndpoints().widget_presets_list, {channel_id: channelId})
            setPresets(d?.presets ?? [])
            setNewPresetName('')
        } finally {
            setPresetSaving(false)
        }
    }

    async function deletePreset(id: number) {
        await post(getEndpoints().widget_presets_delete, {id})
        setPresets(prev => prev.filter(p => p.id !== id))
        if (selectedPresetId === id) setSelectedPresetId(null)
    }

    function applySelected() {
        const preset = presets.find(p => p.id === selectedPresetId)
        if (!preset) return
        let parsed: PresetValue
        try {
            parsed = JSON.parse(preset.value)
        } catch {
            return
        }

        const lines = [`Apply preset "${preset.name}"? This overwrites current settings.`, '']
        if (seriesId && series) {
            lines.push(`Side Cards Price: ${buildPrice(priceFrom, priceTo) || '—'} → ${buildPrice(parsed.price_from, parsed.price_to) || '—'}`)
        } else {
            lines.push('Side Cards Price: skipped (no active series).')
        }
        Object.entries(parsed.ranges ?? {}).forEach(([tierId, v]) => {
            const current = rangeEdits[tierId] ?? priceRanges.find(r => r.tier_id === tierId)?.price_from ?? '—'
            lines.push(`${TIER_ALIASES[tierId] ?? tierId}: $${current} → $${v}`)
        })

        if (!window.confirm(lines.join('\n'))) return
        void confirmApply(parsed)
    }

    async function confirmApply(parsed: PresetValue) {
        setApplying(true)
        try {
            if (seriesId && series) {
                const built = buildPrice(parsed.price_from, parsed.price_to)
                const result = await writePrice('series', () => post(getEndpoints().series_update, {
                    id: seriesId,
                    name: series.name,
                    used_cards: series.used_cards,
                    total_cards: series.total_cards,
                    default_price: built,
                }))
                if (result.ok) {
                    setSeries(prev => prev ? {...prev, default_price: built} : prev)
                    setPriceFrom(parsed.price_from)
                    setPriceTo(parsed.price_to)
                }
            }
            for (const [tierId, priceValue] of Object.entries(parsed.ranges ?? {})) {
                const result = await writeRange('priceRanges', () => post(getEndpoints().widget_board_price_ranges_update, {channel_id: channelId, tier_id: tierId, price_from: priceValue}))
                if (result.ok) {
                    setPriceRanges(prev => prev.map(r => r.tier_id === tierId ? {...r, price_from: priceValue} : r))
                    setRangeEdits(prev => ({...prev, [tierId]: String(priceValue)}))
                }
            }
            setSelectedPresetId(null)
        } finally {
            setApplying(false)
        }
    }

    return (
        <div className="d-flex flex-wrap gap-3">
            <div className="card" style={{minWidth: '220px'}}>
                <div className="card-body">
                    <h6 className="card-title">Series: Side Cards Price</h6>
                    {!seriesId && <div className="text-secondary small">No active series on the current break.</div>}
                    {seriesId && (
                        <div className="d-flex align-items-center gap-2">
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '80px'}}
                                placeholder="From"
                                value={priceFrom}
                                disabled={!series}
                                onChange={(e) => { setPriceFrom(e.target.value); resetPriceStatus() }}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveDefaultPrice() }}
                            />
                            <span>-</span>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '80px'}}
                                placeholder="To"
                                value={priceTo}
                                disabled={!series}
                                onChange={(e) => { setPriceTo(e.target.value); resetPriceStatus() }}
                                onKeyDown={(e) => { if (e.key === 'Enter') saveDefaultPrice() }}
                            />
                            <button className="btn btn-sm btn-primary" onClick={saveDefaultPrice} disabled={!series || priceSaving}>
                                {priceSaving ? 'Saving…' : 'Save'}
                            </button>
                            {priceStatus === 'ok' && <span className="text-success small">Saved</span>}
                            {priceStatus === 'error' && <span className="text-danger small">Error</span>}
                        </div>
                    )}
                </div>
            </div>

            <div className="card" style={{minWidth: '260px'}}>
                <div className="card-body">
                    <h6 className="card-title">Board: Price Ranges</h6>
                    <table className="table table-sm mb-0" style={{maxWidth: '400px'}}>
                        <thead><tr><th>Tier</th><th>Price From ($)</th><th></th></tr></thead>
                        <tbody>
                            {priceRanges.map(r => (
                                <tr key={r.tier_id}>
                                    <td>{TIER_ALIASES[r.tier_id] ?? r.tier_id}</td>
                                    <td>
                                        <input
                                            type="number"
                                            className="form-control form-control-sm"
                                            style={{width: '90px'}}
                                            value={rangeEdits[r.tier_id] ?? r.price_from}
                                            onChange={e => setRangeEdits(prev => ({...prev, [r.tier_id]: e.target.value}))}
                                        />
                                    </td>
                                    <td>
                                        <button className="btn btn-sm btn-primary" onClick={() => savePriceRange(r.tier_id)}>Save</button>
                                    </td>
                                </tr>
                            ))}
                            {priceRanges.length === 0 && (
                                <tr><td colSpan={3} className="text-secondary small">No price ranges.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="card" style={{minWidth: '240px'}}>
                <div className="card-body">
                    <h6 className="card-title">Presets</h6>
                    <div className="list-group mb-2" style={{maxHeight: '160px', overflowY: 'auto', minWidth: '220px'}}>
                        {presets.length === 0 && <span className="text-secondary small">No presets yet.</span>}
                        {presets.map(p => (
                            <div
                                key={p.id}
                                className={`list-group-item list-group-item-action d-flex justify-content-between align-items-center py-1 ${selectedPresetId === p.id ? 'active' : ''}`}
                                style={{cursor: 'pointer'}}
                                onClick={() => setSelectedPresetId(p.id)}
                            >
                                <span>{p.name}</span>
                                <button
                                    className="btn btn-sm btn-outline-danger ms-2"
                                    onClick={(e) => { e.stopPropagation(); deletePreset(p.id) }}
                                >Delete</button>
                            </div>
                        ))}
                    </div>
                    <button className="btn btn-primary btn-sm mb-3" onClick={applySelected} disabled={selectedPresetId === null || applying}>
                        {applying ? 'Applying…' : 'Apply'}
                    </button>
                    <div className="d-flex align-items-center gap-2">
                        <input
                            type="text"
                            className="form-control form-control-sm"
                            style={{width: '160px'}}
                            placeholder="Preset name"
                            value={newPresetName}
                            onChange={(e) => setNewPresetName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') savePreset() }}
                        />
                        <button className="btn btn-sm btn-outline-primary" onClick={savePreset} disabled={presetSaving || !newPresetName.trim()}>
                            {presetSaving ? 'Saving…' : 'Save preset'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
