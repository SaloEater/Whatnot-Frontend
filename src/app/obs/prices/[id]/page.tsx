'use client'

import React, {useEffect, useState} from 'react'
import {Event, Series, SeriesTeamTotal, WNBreak} from '@/app/entity/entities'
import {get, getEndpoints, post} from '@/app/lib/backend'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {IsTeam} from '@/app/common/teams'
import {NoCustomer} from '@/app/entity/entities'
import './page.css'

const BEST_THRESHOLD    = 700
const GOOD_THRESHOLD    = 450
const BEST_MIN          = 3
const GOOD_MIN          = 4
const MID_COUNT         = 5
const MAX_ROW_CELLS     = 7
const DEFAULT_PRICE     = '$100-$299'
const MIN_CELL_WIDTH_PX = 120

type Tier = 'best' | 'good' | 'mid' | 'regular'


interface TeamCell {
    team: string
    displayPrice: string
    priceLeft: number
    tier: Tier
}

function assignTiers(teamNames: string[], prices: SeriesTeamTotal[], defaultPrice: string): TeamCell[] {
    const totalMap  = new Map(prices.map((p) => [p.team, p.total_price]))
    const unsoldMap = new Map(prices.map((p) => [p.team, p.price_left]))

    const withPrice: {team: string; total: number; unsold: number}[] = []
    const noPrice: string[] = []

    for (const team of teamNames) {
        const total = totalMap.get(team) ?? 0
        if (total > 0) withPrice.push({team, total, unsold: unsoldMap.get(team) ?? 0})
        else noPrice.push(team)
    }

    withPrice.sort((a, b) => b.total - a.total)

    const bestCount = Math.max(BEST_MIN, withPrice.filter((t) => t.total >= BEST_THRESHOLD).length)
    const goodCount = Math.max(GOOD_MIN, withPrice.slice(bestCount).filter((t) => t.total >= GOOD_THRESHOLD).length)

    function rankTier(idx: number): Tier {
        if (idx < bestCount) return 'best'
        if (idx < bestCount + goodCount) return 'good'
        if (idx < bestCount + goodCount + MID_COUNT) return 'mid'
        return 'regular'
    }

    const cells: TeamCell[] = []

    withPrice.forEach(({team, unsold}, idx) => {
        const tier: Tier = unsold === 0 ? 'regular' : rankTier(idx)
        const displayPrice = unsold > 0 ? `$${Math.ceil(unsold / 25) * 25}` : defaultPrice
        cells.push({team, displayPrice, priceLeft: unsold, tier})
    })

    noPrice.forEach((team) => {
        cells.push({team, displayPrice: defaultPrice, priceLeft: 0, tier: 'regular'})
    })

    return cells
}

function buildRows(cells: TeamCell[]): TeamCell[][] {
    const byPriceThenName = (a: TeamCell, b: TeamCell) => {
        const diff = b.priceLeft - a.priceLeft
        return diff !== 0 ? diff : a.team.localeCompare(b.team)
    }
    const best    = cells.filter((c) => c.tier === 'best').sort(byPriceThenName)
    const good    = cells.filter((c) => c.tier === 'good').sort(byPriceThenName)
    const mid     = cells.filter((c) => c.tier === 'mid').sort(byPriceThenName)
    const regular = cells.filter((c) => c.tier === 'regular').sort(byPriceThenName)

    const rows: TeamCell[][] = []
    const totalRows = 6

    if (best.length >= 2) {
        rows.push(best)
    } else if (best.length > 0 || good.length > 0) {
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
        const combined = best.length + good.length
        const candidateCellWidth = combined > 0 ? viewportWidth / combined : viewportWidth

        if (good.length === 0 || candidateCellWidth >= MIN_CELL_WIDTH_PX) {
            rows.push([...best, ...good])
            const remaining = [...mid, ...regular]
            if (remaining.length > 0) {
                const availableRows = Math.max(1, totalRows - rows.length)
                const neededRows    = Math.ceil(remaining.length / MAX_ROW_CELLS)
                const actualRows    = Math.min(neededRows, availableRows)
                const base  = Math.floor(remaining.length / actualRows)
                const extra = remaining.length % actualRows
                let idx = 0
                for (let r = 0; r < actualRows; r++) {
                    const count = base + (r < extra ? 1 : 0)
                    rows.push(remaining.slice(idx, idx + count))
                    idx += count
                }
            }
            return rows
        }

        if (best.length > 0) rows.push(best)
    }

    const remaining = [...good, ...mid, ...regular]
    if (remaining.length > 0) {
        const availableRows = Math.max(1, totalRows - rows.length)
        const neededRows    = Math.ceil(remaining.length / MAX_ROW_CELLS)
        const actualRows    = Math.min(neededRows, availableRows)
        const base  = Math.floor(remaining.length / actualRows)
        const extra = remaining.length % actualRows
        let idx = 0
        for (let r = 0; r < actualRows; r++) {
            const count = base + (r < extra ? 1 : 0)
            rows.push(remaining.slice(idx, idx + count))
            idx += count
        }
    }

    return rows
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)

    const [breakObject, setBreakObject] = useState<WNBreak | null>(null)
    const [series,      setSeries]      = useState<Series | null>(null)
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
                        !e.is_giveaway && (e.customer === '' || e.customer === NoCustomer)
                    ))
                })
        }

        fetchBreak()
        fetchEvents()

        const idBreak  = setInterval(fetchBreak,  300000)
        const idEvents = setInterval(fetchEvents,  15000)
        return () => { clearInterval(idBreak); clearInterval(idEvents) }
    }, [stream?.active_break_id])

    useEffect(() => {
        if (!breakObject?.series_id) {
            setSeries(null)
            setPrices([])
            return
        }

        const seriesId = breakObject.series_id

        post(getEndpoints().series_get, {id: seriesId}).then((s: Series) => setSeries(s))

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

    const teamNames = [...events.map((e) => e.team)]
    const defaultPrice = series?.default_price || DEFAULT_PRICE
    const cells = assignTiers(teamNames, prices, defaultPrice)
    const rows = buildRows(cells)

    return (
        <div className="prices-root">
            {rows.map((row, ri) => {
                const rowTier = row.some((c) => c.tier === 'regular') ? 'regular'
                              : row.some((c) => c.tier === 'mid')     ? 'mid'
                              : row.some((c) => c.tier === 'good')    ? 'good'
                              : 'best'

                return (
                <div key={ri} className={`prices-row prices-row--${rowTier}`}>
                    {row.map((cell) => {
                        const words    = cell.team.trim().split(' ')
                        const lastName = words[words.length - 1]
                        return (
                            <div key={cell.team}
                                 className={`prices-cell prices-cell--${cell.tier}`}>
                                {cell.tier !== 'regular' && (
                                    <span className="prices-cell__gem">
                                        <span className="prices-cell__gem-label">{
                                            cell.tier === 'best' ? 'God Team' :
                                            cell.tier === 'good' ? 'Giant Team' : 'Chaser Team'
                                        }</span>
                                    </span>
                                )}
                                <div className="prices-cell__content">
                                    <span className="prices-cell__name-last">{lastName}</span>
                                    <span className="prices-cell__price">{cell.displayPrice}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
                )
            })}
        </div>
    )
}
