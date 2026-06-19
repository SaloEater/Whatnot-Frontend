'use client'

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {SeriesWithCount} from '@/app/entity/entities'

const POLL_MS = 5000

export default function Page({params}: {params: {id: string}}) {
    const seriesId = parseInt(params.id)
    const [data, setData] = useState<SeriesWithCount | null>(null)

    useEffect(() => {
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

    return (
        <div style={{
            display: 'flex',
            width: '100vw',
            height: '100vh',
            background: 'transparent',
            fontFamily: 'sans-serif',
        }}>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRight: '2px solid #555',
            }}>
                <div style={{fontSize: '1.4rem', color: '#aaa', marginBottom: '8px'}}>Unsold</div>
                <div style={{fontSize: '4rem', fontWeight: 700, color: '#fff'}}>{unsold}</div>
            </div>
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <div style={{fontSize: '1.4rem', color: '#aaa', marginBottom: '8px'}}>Available</div>
                <div style={{fontSize: '4rem', fontWeight: 700, color: '#fff'}}>{available}</div>
            </div>
        </div>
    )
}
