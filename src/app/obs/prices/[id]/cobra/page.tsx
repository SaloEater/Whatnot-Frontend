'use client'

import React, {useEffect, useRef, useState} from 'react'
import {Event, PriceRange, Series, SeriesTeamTotal, WNBreak} from '@/app/entity/entities'
import {get, getEndpoints, post} from '@/app/lib/backend'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {NoCustomer} from '@/app/entity/entities'
import './page.css'

const BEST_THRESHOLD    = 700
const GOOD_THRESHOLD    = 450
const BEST_MIN          = 3
const GOOD_MIN          = 4
const MID_THRESHOLD     = 50
const MAX_ROW_CELLS     = 7
const TOTAL_ROWS        = 6
const DEFAULT_PRICE     = '$100-$299'

/*
 * How many fewer teams the top rows carry than a standard row: the first holds
 * two fewer, the second one fewer, everything below is full. Fewer cells means
 * wider cells, so the high tiers read bigger without a hard cap on how many
 * teams the top row may contain.
 */
const ROW_DEFICITS: readonly number[] = [2, 1]
const DEFICIT_TOTAL = ROW_DEFICITS.reduce((sum, d) => sum + d, 0)

/* Each row is either the same height as the row above it or 10% shorter — never taller. */
const ROW_STEP = 0.9

/* No row may occupy more than this share of the viewport. Without it, a board
   that only fills two rows hands each one half the screen. */
const MAX_ROW_SHARE = 0.20

type Tier = 'best' | 'good' | 'mid' | 'regular'

/** Highest tier first — the order cells are laid onto the board. */
const TIER_ORDER = ['best', 'good', 'mid', 'regular'] as const

const TIER_RANK: Record<Tier, number> = {best: 0, good: 1, mid: 2, regular: 3}

const TIER_LABEL: Record<Tier, string> = {
    best:    'God Team',
    good:    'Giant Team',
    mid:     'Chaser Team',
    regular: 'Side Card Team',
}


interface TeamCell {
    team: string
    displayPrice: string
    priceLeft: number
    tier: Tier
}

interface TierThresholds {
    bestThreshold: number
    goodThreshold: number
    midThreshold: number
}

function assignTiers(teamNames: string[], prices: SeriesTeamTotal[], defaultPrice: string, thresholds: TierThresholds): TeamCell[] {
    const {bestThreshold, goodThreshold, midThreshold} = thresholds
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

    const bestCount = Math.max(BEST_MIN, withPrice.filter((t) => t.total >= bestThreshold).length)
    const goodCount = Math.max(GOOD_MIN, withPrice.slice(bestCount).filter((t) => t.total >= goodThreshold).length)

    const cells: TeamCell[] = []

    withPrice.forEach(({team, total, unsold}, idx) => {
        let tier: Tier
        if (unsold === 0) {
            tier = 'regular'
        } else if (idx < bestCount) {
            tier = 'best'
        } else if (idx < bestCount + goodCount) {
            tier = 'good'
        } else if (total >= midThreshold) {
            tier = 'mid'
        } else {
            tier = 'regular'
        }
        const displayPrice = (unsold > 0 && tier !== 'regular') ? `$${Math.ceil(unsold / 25) * 25}` : defaultPrice
        cells.push({team, displayPrice, priceLeft: unsold, tier})
    })

    noPrice.forEach((team) => {
        cells.push({team, displayPrice: defaultPrice, priceLeft: 0, tier: 'regular'})
    })

    return cells
}

/*
 * How many cells land in each row. Every row would hold `base`, except the top
 * ones give up their ROW_DEFICITS share. Whatever the division leaves over goes
 * to the bottom rows, so the top-lighter ordering survives an uneven split.
 */
function rowSizes(total: number, rowCount: number): number[] {
    const deficits   = Array.from({length: rowCount}, (_, i) => ROW_DEFICITS[i] ?? 0)
    const deficitSum = deficits.reduce((sum, d) => sum + d, 0)
    const base       = Math.floor((total + deficitSum) / rowCount)

    const sizes = deficits.map((d) => Math.max(0, base - d))

    let left = total - sizes.reduce((sum, n) => sum + n, 0)
    for (let i = rowCount - 1; left > 0; i = i === 0 ? rowCount - 1 : i - 1) {
        sizes[i]++
        left--
    }
    return sizes
}

function buildRows(cells: TeamCell[]): TeamCell[][] {
    const byPriceThenName = (a: TeamCell, b: TeamCell) => {
        const diff = b.priceLeft - a.priceLeft
        return diff !== 0 ? diff : a.team.localeCompare(b.team)
    }
    const ordered = ([...TIER_ORDER] as Tier[]).flatMap((tier) =>
        cells.filter((c) => c.tier === tier).sort(byPriceThenName)
    )
    if (ordered.length === 0) return []

    // Capacity per row is MAX_ROW_CELLS, less what the top rows give up.
    const rowCount = Math.min(
        TOTAL_ROWS,
        Math.max(1, Math.ceil((ordered.length + DEFICIT_TOTAL) / MAX_ROW_CELLS)),
    )

    const rows: TeamCell[][] = []
    let idx = 0
    for (const count of rowSizes(ordered.length, rowCount)) {
        if (count <= 0) continue
        rows.push(ordered.slice(idx, idx + count))
        idx += count
    }
    return rows
}

/*
 * Sheen lottery — ported from the composite board (src/app/obs/composite/[id]/
 * page.tsx and its MOTION.sheen token). Every SHEEN_COOLDOWN, roll a batch of
 * cells: pick the TIER first (weighted, higher tier = more likely), then a
 * uniform cell within it, without replacement. A pick drives two sweeps in
 * page.css — the card left-to-right, then its badge back the other way, which
 * together run 2 x --sheen-sweep, well inside the minimum cooldown. Regular
 * cells never sheen, so
 * the glint reads as "this one is still available and worth something" rather
 * than as decoration. Tiers with nothing left drop out and their weight
 * renormalizes across the rest.
 *
 * Values are duplicated rather than imported from composite/tokens.ts on
 * purpose: that file budgets ambient motion for an overlay composited over a
 * camera feed, and this board has no camera behind it. Tuning one should not
 * silently retune the other.
 */
const SHEEN_TIER_WEIGHTS: ReadonlyArray<[Tier, number]> = [
    ['best', 45],
    ['good', 30],
    ['mid',  25],
]
/** How many cells sheen together on one roll (uniform in [min, max]). */
const SHEEN_BATCH_MIN = 3
const SHEEN_BATCH_MAX = 5
/** Random cooldown between rolls, milliseconds. */
const SHEEN_COOLDOWN_MIN_MS = 5000
const SHEEN_COOLDOWN_MAX_MS = 13000

function pickSheenTargets(cells: readonly TeamCell[], count: number): TeamCell[] {
    const byTier = new Map<Tier, TeamCell[]>()
    for (const c of cells) {
        if (c.tier === 'regular') continue
        if (!byTier.has(c.tier)) byTier.set(c.tier, [])
        byTier.get(c.tier)!.push(c)
    }

    const picked: TeamCell[] = []
    for (let i = 0; i < count; i++) {
        const candidates = SHEEN_TIER_WEIGHTS.filter(([tier]) => (byTier.get(tier)?.length ?? 0) > 0)
        if (candidates.length === 0) break

        const total = candidates.reduce((sum, [, w]) => sum + w, 0)
        let roll = Math.random() * total
        for (const [tier, weight] of candidates) {
            roll -= weight
            if (roll <= 0) {
                const pool = byTier.get(tier)!
                picked.push(...pool.splice(Math.floor(Math.random() * pool.length), 1))
                break
            }
        }
    }
    return picked
}

function rowTierOf(row: TeamCell[]): Tier {
    return row.some((c) => c.tier === 'best') ? 'best'
         : row.some((c) => c.tier === 'good') ? 'good'
         : row.some((c) => c.tier === 'mid')  ? 'mid'
         : 'regular'
}

/*
 * Height weights for the rows. Dropping a tier costs 10% of the previous row's
 * height; staying on the same tier keeps it. The Math.min makes "never taller
 * than the row above" structural rather than a side effect of buildRows' order.
 * With flex-basis 0%, a row's share of the viewport is weight / sum(weights).
 */
function rowWeights(tiers: Tier[]): number[] {
    return tiers.reduce<number[]>((acc, tier, i) => {
        if (i === 0) {
            acc.push(1)
            return acc
        }
        const stepped = TIER_RANK[tier] > TIER_RANK[tiers[i - 1]] ? acc[i - 1] * ROW_STEP : acc[i - 1]
        acc.push(Math.min(acc[i - 1], stepped))
        return acc
    }, [])
}

/*
 * Each row's share of the viewport. Normally that is just its weight over the
 * total, but when the tallest row would exceed MAX_ROW_SHARE every share is
 * scaled by the same factor — capping rows individually would let flexbox hand
 * the slack to the rows below and flatten the 10% steps. Any leftover height is
 * left empty at the bottom of the board.
 */
function rowShares(weights: number[]): number[] {
    const total = weights.reduce((sum, w) => sum + w, 0)
    if (total === 0) return weights.map(() => 0)

    const shares  = weights.map((w) => w / total)
    const tallest = Math.max(...shares)
    const scale   = tallest > MAX_ROW_SHARE ? MAX_ROW_SHARE / tallest : 1
    return shares.map((s) => s * scale)
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)

    const [breakObject,  setBreakObject]  = useState<WNBreak | null>(null)
    const [series,       setSeries]       = useState<Series | null>(null)
    const [events,       setEvents]       = useState<Event[]>([])
    const [prices,       setPrices]       = useState<SeriesTeamTotal[]>([])
    const [priceRanges,  setPriceRanges]  = useState<PriceRange[]>([])

    const [sheen, setSheen] = useState<{teams: ReadonlySet<string>; epoch: number} | null>(null)
    const cellsRef = useRef<TeamCell[]>([])

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
        post(getEndpoints().widget_board_price_ranges_list, {channel_id: channelId})
            .then((d: {ranges: PriceRange[]}) => { if (d?.ranges) setPriceRanges(d.ranges) })

        function fetchPrices() {
            get(`/api/series/${seriesId}/prices`).then((data: SeriesTeamTotal[]) => {
                setPrices(data ?? [])
            })
        }

        fetchPrices()
        const id = setInterval(fetchPrices, 60000)
        return () => clearInterval(id)
    }, [breakObject?.series_id])

    const teamNames = [...events.map((e) => e.team)]
    const defaultPrice = series?.default_price || DEFAULT_PRICE
    const bestThreshold = priceRanges.find(r => r.tier_id === 'best')?.price_from ?? BEST_THRESHOLD
    const goodThreshold = priceRanges.find(r => r.tier_id === 'good')?.price_from ?? GOOD_THRESHOLD
    const midThreshold  = priceRanges.find(r => r.tier_id === 'mid')?.price_from  ?? MID_THRESHOLD
    const cells = assignTiers(teamNames, prices, defaultPrice, {bestThreshold, goodThreshold, midThreshold})
    const rows = buildRows(cells)

    const tiers   = rows.map(rowTierOf)
    const weights = rowWeights(tiers)
    const shares  = rowShares(weights)

    /* The lottery timer is mounted once, so it reads the current cells through
       a ref rather than restarting every time prices refresh. */
    useEffect(() => { cellsRef.current = cells })

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout>
        let cancelled = false

        const schedule = () => {
            const delay = SHEEN_COOLDOWN_MIN_MS + Math.random() * (SHEEN_COOLDOWN_MAX_MS - SHEEN_COOLDOWN_MIN_MS)
            timer = setTimeout(() => {
                if (cancelled) return
                const count   = SHEEN_BATCH_MIN + Math.floor(Math.random() * (SHEEN_BATCH_MAX - SHEEN_BATCH_MIN + 1))
                const targets = pickSheenTargets(cellsRef.current, count)
                if (targets.length > 0) {
                    setSheen((prev) => ({teams: new Set(targets.map((t) => t.team)), epoch: (prev?.epoch ?? 0) + 1}))
                }
                schedule()
            }, delay)
        }

        schedule()
        return () => { cancelled = true; clearTimeout(timer) }
    }, [])

    if (!stream) {
        return <div className="cobra-root"><span className="cobra-waiting">No active stream</span></div>
    }

    if (!stream.active_break_id) {
        return <div className="cobra-root"><span className="cobra-waiting">No active break</span></div>
    }

    return (
        <div className="cobra-root">
            {rows.map((row, ri) => (
                <div key={ri}
                     className={`cobra-row cobra-row--${tiers[ri]}`}
                     style={{flex: `${weights[ri]} 1 0%`, maxHeight: `${(shares[ri] * 100).toFixed(3)}vh`}}>
                    {row.map((cell) => {
                        const words    = cell.team.trim().split(' ')
                        const lastName = words[words.length - 1]
                        return (
                            <div key={cell.team}
                                 className={`cobra-cell cobra-cell--${cell.tier}`}>
                                {sheen?.teams.has(cell.team) && (
                                    <span className="cobra-cell__sheen-clip" aria-hidden>
                                        {/* Keyed by epoch so a re-picked cell re-runs the sweep. */}
                                        <span key={sheen.epoch} className="cobra-cell__sheen"/>
                                    </span>
                                )}
                                <span className="cobra-cell__gem">
                                    <span className="cobra-cell__gem-label">{TIER_LABEL[cell.tier]}</span>
                                    {/* Answers the card sweep, delayed by one pass and running back. */}
                                    {sheen?.teams.has(cell.team) && (
                                        <span key={sheen.epoch} className="cobra-cell__gem-sheen" aria-hidden/>
                                    )}
                                </span>
                                <div className="cobra-cell__content">
                                    <span className="cobra-cell__name-last">{lastName}</span>
                                    <span className="cobra-cell__price">{cell.displayPrice}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}
