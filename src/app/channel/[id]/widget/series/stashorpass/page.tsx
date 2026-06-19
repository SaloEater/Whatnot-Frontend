'use client'

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import './page.css'

const POLL_MS = 5000

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [price, setPrice] = useState<number | null>(null)

    useEffect(() => {
        function fetch() {
            post(getEndpoints().widget_stashorpass_get, {channel_id: channelId})
                .then((data: {price: number}) => {
                    if (data?.price !== undefined) setPrice(data.price)
                })
        }

        fetch()
        const id = setInterval(fetch, POLL_MS)
        return () => clearInterval(id)
    }, [channelId])

    return (
        <div className="widget-root">
            <div className="widget-border">
            <div className="widget-circle">
                <div className="widget-top">
                    <span>STASH</span>
                    <span>OR PASS</span>
                </div>
                <div className="widget-divider" />
                <div className="widget-bottom">
                    <span>{price !== null ? `$${price}` : ''}</span>
                </div>
            </div>
            </div>
        </div>
    )
}
