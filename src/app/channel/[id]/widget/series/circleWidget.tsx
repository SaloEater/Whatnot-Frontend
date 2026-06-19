'use client'

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import './circleWidget.css'

interface CircleWidgetProps {
    channelId: number
    endpointKey: keyof ReturnType<typeof getEndpoints>
    lines: [string, string]
    neonColor: string
    neonGlowMid: string
    circleBackground: string
    spinDuration: number
    formatValue?: (value: number) => string
    requestBody?: object
    valueField?: string
}

const POLL_MS = 5000

export function CircleWidget({
    channelId,
    endpointKey,
    lines,
    neonColor,
    neonGlowMid,
    circleBackground,
    spinDuration,
    formatValue = (p) => `$${p}`,
    requestBody,
    valueField = 'price',
}: CircleWidgetProps) {
    const [value, setValue] = useState<number | null>(null)

    useEffect(() => {
        const body = requestBody ?? {channel_id: channelId}
        function fetch() {
            post(getEndpoints()[endpointKey], body)
                .then((data: Record<string, number>) => {
                    if (data?.[valueField] !== undefined) setValue(data[valueField])
                })
        }
        fetch()
        const id = setInterval(fetch, POLL_MS)
        return () => clearInterval(id)
    }, [channelId, endpointKey, requestBody, valueField])

    return (
        <div className="widget-root" style={{
            '--neon': neonColor,
            '--neon-mid': neonGlowMid,
            '--circle-bg': circleBackground,
            '--spin-duration': `${spinDuration}s`,
        } as React.CSSProperties}>
            <div className="widget-border">
                <div className="widget-circle">
                    <div className="widget-top">
                        <span>{lines[0]}</span>
                        <span>{lines[1]}</span>
                    </div>
                    <div className="widget-divider" />
                    <div className="widget-bottom">
                        <span>{value !== null ? formatValue(value) : ''}</span>
                    </div>
                </div>
            </div>
        </div>
    )
}
