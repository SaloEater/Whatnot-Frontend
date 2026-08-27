'use client'

// Settings for the widget:stashorpass element, ported verbatim (request/response handling and
// endpoints) from src/app/channel/[id]/widgets/page.tsx.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'

export default function StashOrPassSettings({channelId}: { channelId: number }) {
    const [price, setPrice] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    useEffect(() => {
        post(getEndpoints().widget_stashorpass_get, {channel_id: channelId})
            .then((data: { price: number }) => setPrice(data?.price ?? 0))
    }, [channelId])

    async function save() {
        setSaving(true)
        setStatus('idle')
        try {
            await post(getEndpoints().widget_stashorpass_update, {channel_id: channelId, price})
            setStatus('ok')
        } catch {
            setStatus('error')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="d-flex align-items-center gap-2">
            <label className="form-label mb-0 text-nowrap">Price</label>
            <input
                type="number"
                className="form-control form-control-sm"
                style={{width: '120px'}}
                value={price ?? ''}
                disabled={price === null}
                onChange={(e) => { setPrice(parseInt(e.target.value) || 0); setStatus('idle') }}
            />
            <button className="btn btn-sm btn-primary" onClick={save} disabled={price === null || saving}>
                {saving ? 'Saving…' : 'Save'}
            </button>
            {status === 'ok' && <span className="text-success small">Saved</span>}
            {status === 'error' && <span className="text-danger small">Error</span>}
        </div>
    )
}
