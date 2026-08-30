'use client'

import {CountCell, useSeriesCount} from '../countCell'

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const data = useSeriesCount(channelId)

    const available = data ? data.total_cards - data.used_cards : 0

    return (
        <CountCell modifier="available" title="Boxes left">
            <span className="count-cell__value">{available}</span>
        </CountCell>
    )
}
