'use client'

import React, {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {PriceRange, SeriesWithCount, WNBreak} from '@/app/entity/entities'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'

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

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)

    const [sopPrice, setSopPrice] = useState<number | null>(null)
    const [sopSaving, setSopSaving] = useState(false)
    const [sopStatus, setSopStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    const [p2Price, setP2Price] = useState<number | null>(null)
    const [p2Saving, setP2Saving] = useState(false)
    const [p2Status, setP2Status] = useState<'idle' | 'ok' | 'error'>('idle')

    const [breakObject, setBreakObject] = useState<WNBreak | null>(null)
    const [countData, setCountData] = useState<SeriesWithCount | null>(null)
    const [countSaving, setCountSaving] = useState(false)
    const [customInput, setCustomInput] = useState('')

    const [bpbAmount, setBpbAmount] = useState<number | null>(null)
    const [bpbSaving, setBpbSaving] = useState(false)
    const [bpbStatus, setBpbStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    const [priceFrom, setPriceFrom] = useState('')
    const [priceTo, setPriceTo] = useState('')
    const [showPct, setShowPct] = useState(false)

    const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
    const [rangeEdits, setRangeEdits] = useState<Record<string, string>>({})

    const [orientation, setOrientation] = useState<string | null>(null)
    const [cbSaving, setCbSaving] = useState(false)
    const [cbStatus, setCbStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    const [defaultPriceSaving, setDefaultPriceSaving] = useState(false)
    const [defaultPriceStatus, setDefaultPriceStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    useEffect(() => {
        post(getEndpoints().widget_stashorpass_get, {channel_id: channelId})
            .then((data: {price: number}) => setSopPrice(data?.price ?? 0))
        post(getEndpoints().widget_pick2_get, {channel_id: channelId})
            .then((data: {price: number}) => setP2Price(data?.price ?? 0))
        post(getEndpoints().widget_channel_count_settings_get, {channel_id: channelId})
            .then((d: {show_percentage: boolean}) => { if (d != null) setShowPct(d.show_percentage) })
        post(getEndpoints().widget_board_price_ranges_list, {channel_id: channelId})
            .then((d: {ranges: PriceRange[]}) => {
                if (d?.ranges) {
                    setPriceRanges(d.ranges)
                    const edits: Record<string, string> = {}
                    d.ranges.forEach(r => { edits[r.tier_id] = String(r.price_from) })
                    setRangeEdits(edits)
                }
            })
        post(getEndpoints().widget_cards_board_get, {channel_id: channelId})
            .then((d: {orientation: string}) => setOrientation(d?.orientation ?? 'list'))
    }, [channelId])

    useEffect(() => {
        if (!stream?.active_break_id) { setBreakObject(null); return }
        post(getEndpoints().break_get, {id: stream.active_break_id})
            .then((b: WNBreak) => setBreakObject(b))
    }, [stream?.active_break_id])

    useEffect(() => {
        if (!breakObject?.series_id) { setCountData(null); setBpbAmount(null); return }
        loadCount(breakObject.series_id)
        loadBpb(breakObject.series_id)
    }, [breakObject?.series_id])

    function loadCount(seriesId: number) {
        post(getEndpoints().series_get_with_count, {id: seriesId})
            .then((d: SeriesWithCount) => {
                if (d) {
                    setCountData(d)
                    const [f, t] = parsePrice(d.default_price ?? '')
                    setPriceFrom(f)
                    setPriceTo(t)
                }
            })
    }

    function loadBpb(seriesId: number) {
        post(getEndpoints().widget_boxes_per_break_get, {series_id: seriesId})
            .then((d: {amount: number}) => { if (d) setBpbAmount(d.amount) })
    }

    async function savePriceRange(tierId: string) {
        const priceFrom = parseInt(rangeEdits[tierId]) || 0
        await post(getEndpoints().widget_board_price_ranges_update, {channel_id: channelId, tier_id: tierId, price_from: priceFrom})
        setPriceRanges(prev => prev.map(r => r.tier_id === tierId ? {...r, price_from: priceFrom} : r))
    }

    async function saveCardsBoard() {
        if (orientation === null) return
        setCbSaving(true)
        setCbStatus('idle')
        try {
            await post(getEndpoints().widget_cards_board_update, {channel_id: channelId, orientation})
            setCbStatus('ok')
        } catch {
            setCbStatus('error')
        } finally {
            setCbSaving(false)
        }
    }

    async function saveShowPct(val: boolean) {
        setShowPct(val)
        await post(getEndpoints().widget_channel_count_settings_update, {channel_id: channelId, show_percentage: val})
    }

    async function saveSop() {
        setSopSaving(true)
        setSopStatus('idle')
        try {
            await post(getEndpoints().widget_stashorpass_update, {channel_id: channelId, price: sopPrice})
            setSopStatus('ok')
        } catch {
            setSopStatus('error')
        } finally {
            setSopSaving(false)
        }
    }

    async function savePick2() {
        setP2Saving(true)
        setP2Status('idle')
        try {
            await post(getEndpoints().widget_pick2_update, {channel_id: channelId, price: p2Price})
            setP2Status('ok')
        } catch {
            setP2Status('error')
        } finally {
            setP2Saving(false)
        }
    }

    async function saveBpb() {
        if (!breakObject?.series_id || bpbAmount === null) return
        setBpbSaving(true)
        setBpbStatus('idle')
        try {
            await post(getEndpoints().widget_boxes_per_break_update, {series_id: breakObject.series_id, amount: bpbAmount})
            setBpbStatus('ok')
        } catch {
            setBpbStatus('error')
        } finally {
            setBpbSaving(false)
        }
    }

    async function saveDefaultPrice() {
        if (!countData || !breakObject?.series_id || (priceTo && !priceFrom)) return
        const built = buildPrice(priceFrom, priceTo)
        setDefaultPriceSaving(true)
        setDefaultPriceStatus('idle')
        try {
            await post(getEndpoints().series_update, {
                id: breakObject.series_id,
                name: countData.name,
                used_cards: countData.used_cards,
                total_cards: countData.total_cards,
                default_price: built,
            })
            setCountData((prev) => prev ? {...prev, default_price: built} : prev)
            setDefaultPriceStatus('ok')
        } catch {
            setDefaultPriceStatus('error')
        } finally {
            setDefaultPriceSaving(false)
        }
    }

    async function setUsedCards(value: number) {
        if (!countData || !breakObject?.series_id) return
        setCountSaving(true)
        await post(getEndpoints().series_update, {
            id: breakObject.series_id,
            name: countData.name,
            used_cards: value,
            total_cards: countData.total_cards,
            default_price: countData.default_price,
        })
        setCountSaving(false)
        loadCount(breakObject.series_id)
    }

    function bump(delta: number) {
        if (countData) setUsedCards(countData.used_cards + delta)
    }

    function handleSet() {
        const v = parseInt(customInput)
        if (!isNaN(v)) { setUsedCards(v); setCustomInput('') }
    }

    const deltas = [1, 2, 3, 4]

    const available = countData ? countData.total_cards - countData.used_cards : 0
    const sideCards = countData ? available - countData.unsold_count : 0
    const unsoldPct = countData && available > 0
        ? Math.round(countData.unsold_count / available * 100)
        : 0

    const seriesStatus = !stream
        ? <p className="text-secondary">No active stream on this channel.</p>
        : !stream.active_break_id
            ? <p className="text-secondary">No active break on current stream.</p>
            : !breakObject?.series_id
                ? <p className="text-secondary">Active break has no series assigned.</p>
                : null

    return (
        <main className="container py-3">
            <h4 className="mb-4">Widget Settings</h4>

            <hr />
            <div className="row g-3 mb-2">
                <div className="col-auto">
                    <div className="card">
                        <div className="card-body">
                            <h6 className="card-title">Series: Stash or Pass</h6>
                            <div className="d-flex align-items-center gap-2">
                                <label className="form-label mb-0 text-nowrap">Price</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    style={{width: '120px'}}
                                    value={sopPrice ?? ''}
                                    disabled={sopPrice === null}
                                    onChange={(e) => { setSopPrice(parseInt(e.target.value) || 0); setSopStatus('idle') }}
                                />
                                <button className="btn btn-primary" onClick={saveSop} disabled={sopPrice === null || sopSaving}>
                                    {sopSaving ? 'Saving…' : 'Save'}
                                </button>
                                {sopStatus === 'ok'    && <span className="text-success">Saved</span>}
                                {sopStatus === 'error' && <span className="text-danger">Error</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-auto">
                    <div className="card">
                        <div className="card-body">
                            <h6 className="card-title">Series: Pick 2</h6>
                            <div className="d-flex align-items-center gap-2">
                                <label className="form-label mb-0 text-nowrap">Price</label>
                                <input
                                    type="number"
                                    className="form-control"
                                    style={{width: '120px'}}
                                    value={p2Price ?? ''}
                                    disabled={p2Price === null}
                                    onChange={(e) => { setP2Price(parseInt(e.target.value) || 0); setP2Status('idle') }}
                                />
                                <button className="btn btn-primary" onClick={savePick2} disabled={p2Price === null || p2Saving}>
                                    {p2Saving ? 'Saving…' : 'Save'}
                                </button>
                                {p2Status === 'ok'    && <span className="text-success">Saved</span>}
                                {p2Status === 'error' && <span className="text-danger">Error</span>}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-auto">
                    <div className="card">
                        <div className="card-body">
                            <h6 className="card-title">Series: Boxes per Break</h6>
                            {seriesStatus ?? (bpbAmount !== null ? (
                                <div className="d-flex align-items-center gap-2">
                                    <label className="form-label mb-0 text-nowrap">Amount</label>
                                    <input
                                        type="number"
                                        className="form-control"
                                        style={{width: '120px'}}
                                        value={bpbAmount}
                                        onChange={(e) => { setBpbAmount(parseInt(e.target.value) || 0); setBpbStatus('idle') }}
                                    />
                                    <button className="btn btn-primary" onClick={saveBpb} disabled={bpbSaving}>
                                        {bpbSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    {bpbStatus === 'ok'    && <span className="text-success">Saved</span>}
                                    {bpbStatus === 'error' && <span className="text-danger">Error</span>}
                                </div>
                            ) : null)}
                        </div>
                    </div>
                </div>

                <div className="col-auto">
                    <div className="card">
                        <div className="card-body">
                            <h6 className="card-title">Series: Side Cards Price</h6>
                            {seriesStatus ?? (
                                <div className="d-flex align-items-center gap-2">
                                    <input
                                        type="number"
                                        className="form-control"
                                        style={{width: '80px'}}
                                        placeholder="From"
                                        value={priceFrom}
                                        onChange={(e) => { setPriceFrom(e.target.value); setDefaultPriceStatus('idle') }}
                                        onKeyDown={(e) => e.key === 'Enter' && saveDefaultPrice()}
                                    />
                                    <span>-</span>
                                    <input
                                        type="number"
                                        className="form-control"
                                        style={{width: '80px'}}
                                        placeholder="To"
                                        value={priceTo}
                                        onChange={(e) => { setPriceTo(e.target.value); setDefaultPriceStatus('idle') }}
                                        onKeyDown={(e) => e.key === 'Enter' && saveDefaultPrice()}
                                    />
                                    <button className="btn btn-primary" onClick={saveDefaultPrice} disabled={defaultPriceSaving}>
                                        {defaultPriceSaving ? 'Saving…' : 'Save'}
                                    </button>
                                    {defaultPriceStatus === 'ok'    && <span className="text-success">Saved</span>}
                                    {defaultPriceStatus === 'error' && <span className="text-danger">Error</span>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="col-auto">
                    <div className="card">
                        <div className="card-body">
                            <h6 className="card-title">Cards Board</h6>
                            <div className="d-flex align-items-center gap-2">
                                <label className="form-label mb-0 text-nowrap">Orientation</label>
                                <select
                                    className="form-select"
                                    style={{width: '140px'}}
                                    value={orientation ?? 'list'}
                                    disabled={orientation === null}
                                    onChange={(e) => { setOrientation(e.target.value); setCbStatus('idle') }}
                                >
                                    <option value="list">list</option>
                                    <option value="gallery">gallery</option>
                                </select>
                                <button className="btn btn-primary" onClick={saveCardsBoard} disabled={orientation === null || cbSaving}>
                                    {cbSaving ? 'Saving…' : 'Save'}
                                </button>
                                {cbStatus === 'ok'    && <span className="text-success">Saved</span>}
                                {cbStatus === 'error' && <span className="text-danger">Error</span>}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <hr />
            <h6 className="text-center mb-3">Board: Price Ranges</h6>
            <table className="table table-sm" style={{maxWidth: '400px'}}>
                <thead><tr><th>Tier</th><th>Price From ($)</th><th></th></tr></thead>
                <tbody>
                    {priceRanges.map(r => (
                        <tr key={r.tier_id}>
                            <td>{{best: 'God', good: 'Giant', mid: 'Chaser'}[r.tier_id] ?? r.tier_id}</td>
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
                                <button style={{display: 'none'}}>Add</button>
                                <button style={{display: 'none'}}>Delete</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <hr />
            <h6 className="text-center mb-3">Series: Count Widget</h6>
            <div className="form-check mb-2">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id="showPctCheck"
                    checked={showPct}
                    onChange={(e) => saveShowPct(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="showPctCheck">Show percentage</label>
            </div>
            {seriesStatus}

            {countData && (
                <div className="row g-3">
                    <div className="col-6">
                        <div className="card h-100">
                            <div className="card-body">
                                <div className="text-secondary small mb-1">Used Cards</div>
                                <div className="fs-2 fw-bold mb-3">{countData.used_cards}</div>
                                <div className="d-flex flex-wrap gap-1 mb-2">
                                    {deltas.map((d) => (
                                        <button key={`+${d}`} className="btn btn-sm btn-outline-success"
                                                disabled={countSaving} onClick={() => bump(d)}>+{d}</button>
                                    ))}
                                    {deltas.map((d) => (
                                        <button key={`-${d}`} className="btn btn-sm btn-outline-danger"
                                                disabled={countSaving} onClick={() => bump(-d)}>-{d}</button>
                                    ))}
                                </div>
                                <div className="d-flex gap-2 align-items-center">
                                    <input
                                        type="number"
                                        className="form-control form-control-sm"
                                        style={{width: '90px'}}
                                        placeholder="custom"
                                        value={customInput}
                                        onChange={(e) => setCustomInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleSet()}
                                    />
                                    <button className="btn btn-sm btn-primary"
                                            disabled={countSaving || customInput === ''} onClick={handleSet}>Set</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-6">
                        <div className="card h-100">
                            <div className="card-body d-flex flex-column justify-content-center">
                                <div className="text-secondary small mb-1">Side Cards</div>
                                <div className="fs-2 fw-bold">{sideCards}</div>
                                <div className="text-secondary small mt-1">
                                    cards left ({available}) − chasers left ({countData.unsold_count})
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-6">
                        <div className="card h-100">
                            <div className="card-body d-flex flex-row p-0">
                                <div className="d-flex flex-column justify-content-center align-items-center flex-fill p-3" style={{borderRight: '1px solid var(--bs-border-color)'}}>
                                    <div className="text-secondary small mb-1">Chaser Cards</div>
                                    <div className="fs-2 fw-bold">{countData.unsold_count}</div>
                                </div>
                                <div className="d-flex flex-column justify-content-center align-items-center flex-fill p-3">
                                    <div className="text-secondary small mb-1">Chance to hit</div>
                                    <div className="fs-2 fw-bold">{unsoldPct}%</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="col-6">
                        <div className="card h-100">
                            <div className="card-body d-flex flex-column justify-content-center">
                                <div className="text-secondary small mb-1">Available</div>
                                <div className="fs-2 fw-bold">{available}</div>
                                <div className="text-secondary small mt-1">
                                    total ({countData.total_cards}) − used ({countData.used_cards})
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    )
}
