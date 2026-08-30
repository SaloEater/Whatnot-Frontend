'use client'

import {ReactNode, useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {SeriesWithCount, WNBreak} from '@/app/entity/entities'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import './countCell.css'

const POLL_MS = 5000

/* resolves the active break's series and polls its card counts */
export function useSeriesCount(channelId: number): SeriesWithCount | null {
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

    return data
}

export function CountCell({modifier, title, children}: {modifier: string, title: string, children: ReactNode}) {
    return (
        <div className="count-root">
            <div className={`count-cell count-cell--${modifier}`}>
                <div className="count-cell__title"><span>{title}</span></div>
                <div className="count-cell__content">{children}</div>
                <div className="count-cell__corner" />
            </div>
        </div>
    )
}
