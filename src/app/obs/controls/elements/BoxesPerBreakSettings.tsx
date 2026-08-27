'use client'

// Settings for the widget:boxesPerBreak element, ported verbatim (request/response handling and
// endpoints) from src/app/channel/[id]/widgets/page.tsx. Unlike the other widget settings this
// one is keyed by series_id (from the active break), not channel_id.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'

export default function BoxesPerBreakSettings({seriesId}: { seriesId?: number | null }) {
    const [amount, setAmount] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    useEffect(() => {
        if (!seriesId) {
            setAmount(null)
            return
        }
        post(getEndpoints().widget_boxes_per_break_get, {series_id: seriesId})
            .then((d: { amount: number }) => { if (d) setAmount(d.amount) })
    }, [seriesId])

    async function save() {
        if (!seriesId || amount === null) return
        setSaving(true)
        setStatus('idle')
        try {
            await post(getEndpoints().widget_boxes_per_break_update, {series_id: seriesId, amount})
            setStatus('ok')
        } catch {
            setStatus('error')
        } finally {
            setSaving(false)
        }
    }

    if (!seriesId) {
        return <div className="text-secondary small">No active series on the current break.</div>
    }

    return (
        <div className="d-flex align-items-center gap-2">
            <label className="form-label mb-0 text-nowrap">Amount</label>
            <input
                type="number"
                className="form-control form-control-sm"
                style={{width: '120px'}}
                value={amount ?? ''}
                disabled={amount === null}
                onChange={(e) => { setAmount(parseInt(e.target.value) || 0); setStatus('idle') }}
            />
            <button className="btn btn-sm btn-primary" onClick={save} disabled={amount === null || saving}>
                {saving ? 'Saving…' : 'Save'}
            </button>
            {status === 'ok' && <span className="text-success small">Saved</span>}
            {status === 'error' && <span className="text-danger small">Error</span>}
        </div>
    )
}
