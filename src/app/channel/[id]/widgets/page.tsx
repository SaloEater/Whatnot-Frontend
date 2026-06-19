'use client'

import React, {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)

    const [sopPrice, setSopPrice] = useState<number | null>(null)
    const [sopSaving, setSopSaving] = useState(false)
    const [sopStatus, setSopStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    const [p2Price, setP2Price] = useState<number | null>(null)
    const [p2Saving, setP2Saving] = useState(false)
    const [p2Status, setP2Status] = useState<'idle' | 'ok' | 'error'>('idle')

    useEffect(() => {
        post(getEndpoints().widget_stashorpass_get, {channel_id: channelId})
            .then((data: {price: number}) => setSopPrice(data?.price ?? 0))
        post(getEndpoints().widget_pick2_get, {channel_id: channelId})
            .then((data: {price: number}) => setP2Price(data?.price ?? 0))
    }, [channelId])

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

    return (
        <main className="container py-3">
            <h4 className="mb-4">Widget Settings</h4>

            <hr />
            <h6 className="text-center mb-3">Series: Stash or Pass</h6>
            <div className="d-flex align-items-center gap-2">
                <label className="form-label mb-0 text-nowrap">Price</label>
                <input
                    type="number"
                    className="form-control"
                    style={{width: '140px'}}
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

            <hr />
            <h6 className="text-center mb-3">Series: Pick 2</h6>
            <div className="d-flex align-items-center gap-2">
                <label className="form-label mb-0 text-nowrap">Price</label>
                <input
                    type="number"
                    className="form-control"
                    style={{width: '140px'}}
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
        </main>
    )
}
