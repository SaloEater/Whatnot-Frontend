'use client'

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {WNBreak} from '@/app/entity/entities'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {CircleWidget} from '../circleWidget'

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)
    const [seriesId, setSeriesId] = useState<number | null>(null)

    useEffect(() => {
        if (!stream?.active_break_id) { setSeriesId(null); return }
        post(getEndpoints().break_get, {id: stream.active_break_id})
            .then((b: WNBreak) => setSeriesId(b?.series_id ?? null))
    }, [stream?.active_break_id])

    if (!seriesId) return null

    return (
        <CircleWidget
            channelId={channelId}
            endpointKey="series_get"
            lines={['CURRENT', 'SERIES']}
            neonColor="#d93957"
            neonGlowMid="#d9203e"
            circleBackground="#293d56"
            spinDuration={24}
            formatValue={(v) => String(v)}
            requestBody={{id: seriesId}}
            valueField="name"
            valueClassName="widget-content--text"
        />
    )
}
