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
            endpointKey="widget_boxes_per_break_get"
            lines={['Boxes', 'per break']}
            neonColor="#ffffa0"
            neonGlowMid="#ffffd4"
            circleBackground="#3d3d10"
            spinDuration={25}
            formatValue={(v) => String(v)}
            requestBody={{series_id: seriesId}}
            valueField="amount"
        />
    )
}
