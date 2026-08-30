'use client'

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {CountCell, useSeriesCount} from '../countCell'

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const data = useSeriesCount(channelId)
    const [showPct, setShowPct] = useState(false)

    useEffect(() => {
        post(getEndpoints().widget_channel_count_settings_get, {channel_id: channelId})
            .then((d: {show_percentage: boolean}) => { if (d != null) setShowPct(d.show_percentage) })
    }, [channelId])

    const unsold    = data?.unsold_count ?? 0
    const available = data ? data.total_cards - data.used_cards : 0
    const chancePct = available > 0 ? Math.round(unsold / available * 100) : 0

    return (
        <CountCell modifier="unsold" title="Chasers">
            {showPct && chancePct > 15 &&
                <span className="count-cell__value">
                    {unsold}
                    <span className="count-cell__separator"> / </span>
                    {chancePct}%
                </span>
                ||  <span className="count-cell__value">{unsold}</span>
            }
        </CountCell>
    )
}
