'use client'

// Settings for the widget:stashorpass element, ported verbatim (request/response handling and
// endpoints) from src/app/channel/[id]/widgets/page.tsx. Save pushes a `stashorpass` spine
// refetch cue via useSettingWrite.ts so OBS sees the new price immediately rather than waiting
// for the spine's 5s poll.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {Cue} from '@/app/obs/layout/schema'
import {useSettingWrite} from './useSettingWrite'

export default function StashOrPassSettings({channelId, onFireCue}: {
    channelId: number
    onFireCue?: (cue: Cue) => void
}) {
    const [price, setPrice] = useState<number | null>(null)
    const {save: writeSetting, saving, status, reset} = useSettingWrite(onFireCue)

    useEffect(() => {
        post(getEndpoints().widget_stashorpass_get, {channel_id: channelId})
            .then((data: { price: number }) => setPrice(data?.price ?? 0))
    }, [channelId])

    async function save() {
        await writeSetting('stashorpass', () => post(getEndpoints().widget_stashorpass_update, {channel_id: channelId, price}))
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
                onChange={(e) => { setPrice(parseInt(e.target.value) || 0); reset() }}
            />
            <button className="btn btn-sm btn-primary" onClick={save} disabled={price === null || saving}>
                {saving ? 'Saving…' : 'Save'}
            </button>
            {status === 'ok' && <span className="text-success small">Saved</span>}
            {status === 'error' && <span className="text-danger small">Error</span>}
        </div>
    )
}
