'use client'

import React, {useEffect, useState} from 'react'
import {Event, Series, SeriesTeamTotal, WNBreak} from '@/app/entity/entities'
import {get, getEndpoints, post} from '@/app/lib/backend'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {IsTeam} from '@/app/common/teams'
import {NoCustomer} from '@/app/entity/entities'
import './page.css'

const BEST_COUNT        = 3
const GOOD_COUNT        = 4
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

function rankTier(idx: number): Tier {
    if (idx < BEST_COUNT) return 'best'
    if (idx < BEST_COUNT + GOOD_COUNT) return 'good'
    if (idx < BEST_COUNT + GOOD_COUNT + MID_COUNT) return 'mid'
    return 'regular'
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

    // Rank by total price to assign base tier (color).
    withPrice.sort((a, b) => b.total - a.total)
    const totalTierMap = new Map(withPrice.map(({team}, idx) => [team, rankTier(idx)]))

    // Rank by unsold price to check if unsold value has dropped to regular.
    const byUnsold = [...withPrice].sort((a, b) => b.unsold - a.unsold)
    const unsoldTierMap = new Map(byUnsold.map(({team}, idx) => [team, rankTier(idx)]))

    const cells: TeamCell[] = []

    withPrice.forEach(({team, unsold}) => {
        const totalTier  = totalTierMap.get(team)!
        const unsoldTier = unsoldTierMap.get(team)!
        const tier: Tier = (unsoldTier === 'regular' || unsold < 200) ? 'regular' : totalTier
        const displayPrice = unsold > 0 ? `$${Math.ceil(unsold / 25) * 25}` : defaultPrice
        cells.push({team, displayPrice, priceLeft: unsold, tier})
    })

    noPrice.forEach((team) => {
        cells.push({team, displayPrice: defaultPrice, priceLeft: 0, tier: 'regular'})
    })

    return cells
}

function buildRows(cells: TeamCell[]): TeamCell[][] {
    const byPrice = (a: TeamCell, b: TeamCell) => b.priceLeft - a.priceLeft
    const best    = cells.filter((c) => c.tier === 'best').sort(byPrice)
    const good    = cells.filter((c) => c.tier === 'good').sort(byPrice)
    let   mid     = cells.filter((c) => c.tier === 'mid').sort(byPrice)
    let   regular = cells.filter((c) => c.tier === 'regular').sort(byPrice)

    const rows: TeamCell[][] = []

    const totalRows = 6

    function pushGoodRow() {
        const availableRows = Math.max(1, totalRows - rows.length)
        const remaining     = mid.length + regular.length
        const cellsPerRow   = Math.ceil(remaining / availableRows)
        const midOnGoodRow  = Math.max(0, cellsPerRow - good.length)
        rows.push([...good, ...mid.slice(0, midOnGoodRow)])
        mid = mid.slice(midOnGoodRow)
    }

    if (best.length >= 2) {
        rows.push(best)
        if (good.length > 0) pushGoodRow()
    } else if (best.length > 0 || good.length > 0) {
        const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
        const combined = best.length + good.length
        const candidateCellWidth = combined > 0 ? viewportWidth / combined : viewportWidth

        if (good.length > 0 && candidateCellWidth < MIN_CELL_WIDTH_PX) {
            if (best.length > 0) rows.push(best)
            pushGoodRow()
        } else {
            rows.push([...best, ...good])
        }
    }

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
                                <div className="prices-cell__name">
                                    <div className="prices-cell__name-last">{lastName}</div>
                                </div>
                                <div className="prices-cell__price">{cell.displayPrice}</div>
                            </div>
                        )
                    })}
                </div>
                )
            })}
        </div>
    )
}
