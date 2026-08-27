'use client'

// Settings for the widget:count element, ported verbatim (request/response handling and
// endpoints, including the immediate-save-on-toggle behavior) from
// src/app/channel/[id]/widgets/page.tsx.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'

export default function CountSettings({channelId, elementKey}: { channelId: number; elementKey: string }) {
    const [showPct, setShowPct] = useState(false)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        post(getEndpoints().widget_channel_count_settings_get, {channel_id: channelId})
            .then((d: { show_percentage: boolean }) => {
                if (d != null) setShowPct(d.show_percentage)
                setLoaded(true)
            })
    }, [channelId])

    async function saveShowPct(val: boolean) {
        setShowPct(val)
        await post(getEndpoints().widget_channel_count_settings_update, {channel_id: channelId, show_percentage: val})
    }

    const inputId = `ctl-showPctCheck-${elementKey}`

    return (
        <div className="form-check">
            <input
                type="checkbox"
                className="form-check-input"
                id={inputId}
                checked={showPct}
                disabled={!loaded}
                onChange={(e) => saveShowPct(e.target.checked)}
            />
            <label className="form-check-label" htmlFor={inputId}>Show percentage</label>
        </div>
    )
}
