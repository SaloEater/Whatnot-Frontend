'use client'

import React, {useEffect, useState} from 'react'
import {Event, SeriesTeamTotal, WNBreak} from '@/app/entity/entities'
import {get, getEndpoints, post} from '@/app/lib/backend'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {IsTeam} from '@/app/common/teams'
import {NoCustomer} from '@/app/entity/entities'
import './page.css'

const BEST_COUNT        = 3
const GOOD_COUNT        = 5
const DEFAULT_PRICE     = 150
const MIN_CELL_WIDTH_PX = 120

type Tier = 'best' | 'good' | 'regular'


interface TeamCell {
    team: string
    displayPrice: number
    tier: Tier
}

function assignTiers(teamNames: string[], prices: SeriesTeamTotal[]): TeamCell[] {
    const priceMap = new Map(prices.map((p) => [p.team, p.price]))

    const withPrice: {team: string; price: number}[] = []
    const noPrice: string[] = []

    for (const team of teamNames) {
        const price = priceMap.get(team) ?? 0
        if (price > 0) withPrice.push({team, price})
        else noPrice.push(team)
    }

    withPrice.sort((a, b) => b.price - a.price)

    const cells: TeamCell[] = []

    withPrice.forEach(({team, price}, idx) => {
        let tier: Tier
        if (idx < BEST_COUNT) tier = 'best'
        else if (idx < BEST_COUNT + GOOD_COUNT) tier = 'good'
        else tier = 'regular'
        cells.push({team, displayPrice: price, tier})
    })

    noPrice.forEach((team) => {
        cells.push({team, displayPrice: DEFAULT_PRICE, tier: 'regular'})
    })

    return cells
}

function buildRows(cells: TeamCell[]): TeamCell[][] {
    const byPrice = (a: TeamCell, b: TeamCell) => b.displayPrice - a.displayPrice
    const best    = cells.filter((c) => c.tier === 'best').sort(byPrice)
    const good    = cells.filter((c) => c.tier === 'good').sort(byPrice)
    const regular = cells.filter((c) => c.tier === 'regular').sort(byPrice)

    const rows: TeamCell[][] = []

    if (best.length > 0 || good.length > 0) {
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
        const combined = best.length + good.length
        const candidateCellWidth = combined > 0 ? viewportWidth / combined : viewportWidth

        if (good.length > 0 && candidateCellWidth < MIN_CELL_WIDTH_PX) {
            if (best.length > 0) rows.push(best)
            rows.push(good)
        } else {
            rows.push([...best, ...good])
        }
    }

    if (regular.length > 0) {
        const availableRows = Math.max(1, 5 - rows.length)
        const cellsPerRow = Math.ceil(regular.length / availableRows)
        for (let i = 0; i < regular.length; i += cellsPerRow) {
            rows.push(regular.slice(i, i + cellsPerRow))
        }
    }

    return rows
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)

    const [breakObject, setBreakObject] = useState<WNBreak | null>(null)
    const [events,      setEvents]      = useState<Event[]>([])
    const [prices,      setPrices]      = useState<SeriesTeamTotal[]>([])

    useEffect(() => {
        if (!stream?.active_break_id) {
            setBreakObject(null)
            setEvents([])
            return
        }

        const breakId = stream.active_break_id

        function fetchBreak() {
            post(getEndpoints().break_get, {id: breakId}).then((b: WNBreak) => setBreakObject(b))
        }

        function fetchEvents() {
            post(getEndpoints().break_events, {break_id: breakId})
                .then((resp: {events: Event[]}) => {
                    setEvents((resp?.events ?? []).filter((e) =>
                        IsTeam(e.team) && !e.is_giveaway && (e.customer === '' || e.customer === NoCustomer)
                    ))
                })
        }

        fetchBreak()
        fetchEvents()

        const idBreak  = setInterval(fetchBreak,  300000)
        const idEvents = setInterval(fetchEvents,  120000)
        return () => { clearInterval(idBreak); clearInterval(idEvents) }
    }, [stream?.active_break_id])

    useEffect(() => {
        if (!breakObject?.series_id) {
            setPrices([])
            return
        }

        const seriesId = breakObject.series_id

        function fetchPrices() {
            get(`/api/series/${seriesId}/prices`).then((data: SeriesTeamTotal[]) => {
                setPrices(data ?? [])
            })
        }

        fetchPrices()
        const id = setInterval(fetchPrices, 60000)
        return () => clearInterval(id)
    }, [breakObject?.series_id])

    if (!stream) {
        return <div className="prices-root"><span className="prices-waiting">No active stream</span></div>
    }

    if (!stream.active_break_id) {
        return <div className="prices-root"><span className="prices-waiting">No active break</span></div>
    }

    const teamNames = [...new Set(events.map((e) => e.team))]
    const cells = assignTiers(teamNames, prices)
    const rows = buildRows(cells)

    return (
        <div className="prices-root">
            {rows.map((row, ri) => {
                const rowTier = row.some((c) => c.tier === 'regular') ? 'regular'
                              : row.some((c) => c.tier === 'good')    ? 'good'
                              : 'best'

                return (
                <div key={ri} className={`prices-row prices-row--${rowTier}`}>
                    {row.map((cell) => {
                        const words    = cell.team.trim().split(' ')
                        const lastName = words[words.length - 1]
                        const prefix   = words.slice(0, -1).join(' ')
                        return (
                            <div key={cell.team}
                                 className={`prices-cell prices-cell--${cell.tier}`}>
                                <div className="prices-cell__name">
                                    {prefix && <div className="prices-cell__name-prefix">{prefix}</div>}
                                    <div className="prices-cell__name-last">{lastName}</div>
                                </div>
                                <div className="prices-cell__price">${cell.displayPrice}</div>
                            </div>
                        )
                    })}
                </div>
                )
            })}
        </div>
    )
}
