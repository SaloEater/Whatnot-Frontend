'use client'

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {SeriesWithCount, WNBreak} from '@/app/entity/entities'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import './page.css'

const POLL_MS = 5000

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)

    const [seriesId, setSeriesId] = useState<number | null>(null)
    const [data, setData] = useState<SeriesWithCount | null>(null)

    useEffect(() => {
        if (!stream?.active_break_id) { setSeriesId(null); return }
        post(getEndpoints().break_get, {id: stream.active_break_id})
            .then((b: WNBreak) => setSeriesId(b?.series_id ?? null))
    }, [stream?.active_break_id])

    useEffect(() => {
        if (!seriesId) { setData(null); return }

        function fetch() {
            post(getEndpoints().series_get_with_count, {id: seriesId})
                .then((d: SeriesWithCount) => { if (d) setData(d) })
        }

        fetch()
        const id = setInterval(fetch, POLL_MS)
        return () => clearInterval(id)
    }, [seriesId])

    const unsold    = data?.unsold_count ?? 0
    const available = data ? data.total_cards - data.used_cards : 0
    const chancePct = available > 0 ? Math.round(unsold / available * 100) : 0

    return (
        <div className="count-root">
            <div className="count-cell count-cell--unsold">
                <div className="count-cell__title"><span>Chasers</span></div>
                <div className="count-cell__content">
                    {chancePct > 15 &&
                        <span className="count-cell__value">
                            {unsold}
                            <span className="count-cell__separator"> / </span>
                            {chancePct}%
                        </span>
                        ||  <span className="count-cell__value">{unsold}</span>
                    }
                </div>
                <div className="count-cell__corner" />
            </div>
            <div className="count-cell count-cell--available">
                <div className="count-cell__title"><span>Boxes left</span></div>
                <div className="count-cell__content">
                    <span className="count-cell__value">{available}</span>
                </div>
                <div className="count-cell__corner" />
            </div>
        </div>
    )
}
