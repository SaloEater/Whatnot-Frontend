'use client'

// The `board:rips_flat` registry component (rips-flat-board-plan.md). rips_board/board.png as a
// backdrop, one square cell per team slot inside its blue inset. Ordering is board:cobra_flat's
// (layoutCells, imported), the sold state is board:flat's (tiles/, CellSkin, AccentOverlay
// imported); the settled-baseline / grouping logic below is copied from FlatBoard.tsx.
//
// No move animation on sale (plan §7.1): a sale re-deals the grid and the sold cell flips in its
// new slot. `reactsTo` is [] for the same reason as board:cobra_flat (no `sold` scene event).

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react'
import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import {
    assignTiers,
    BEST_THRESHOLD,
    DEFAULT_PRICE,
    GOOD_THRESHOLD,
    MID_THRESHOLD,
    type TeamCell,
    type Tier,
} from '../board-cobra/pricing'
import {layoutCells, MAX_COLS, splitRows, type FlatCell} from '../board-cobra-flat/layout'
import {AccentOverlay} from '../board-flat/AccentOverlay'
import {computeGroups, rectGroup} from '../board-flat/tiles/grouping'
import {cellExposure} from '../board-flat/tiles/exposure'
import {styleForGroup} from '../board-flat/tiles/manifest'
import {useManifest} from '../board-flat/tiles/useManifest'
import {Group} from '../board-flat/tiles/types'
import {RipsFlatCell} from './RipsFlatCell'
import './RipsFlatBoard.css'

// The blue inset of /images/rips_board/board.png as fractions of the image (147/1080, 140/1080,
// 27/250, 25/250). MUST be re-measured if board.png is replaced (same rule as rips_scene/assets.ts).
const INSET = {left: 0.136, right: 0.13, top: 0.108, bottom: 0.1}

// Every skin renders at this tier regardless of group size — same override as FlatBoard.tsx.
const FORCE_SKIN_TIER: 1 | 2 | 3 | null = 3

// Layout effect on the client so the "already sold at mount" baseline is committed before the
// first paint (see FlatBoard.tsx); useEffect on the server where layout effects only warn.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/*
 * Integer-pixel layout (FlatBoard.tsx's useIntegerBoardLayout, with BASE_PAD replaced by the
 * backdrop's inset). Callback ref because the "No active stream / break" early returns mount a
 * different root before the real wrapper (same reason as useCobraFlatLayout).
 */
function useRipsFlatLayout(rowCount: number) {
    const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null)
    const [wrapSize, setWrapSize] = useState({w: 0, h: 0})

    useEffect(() => {
        const el = wrapEl
        if (!el) return
        const measure = () => setWrapSize({w: el.clientWidth, h: el.clientHeight})
        measure()
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(measure)
            ro.observe(el)
            return () => ro.disconnect()
        }
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [wrapEl])

    const {w, h} = wrapSize
    if (w === 0 || h === 0 || rowCount === 0) return {wrapRef: setWrapEl, layoutVars: null}

    const insetL = Math.round(w * INSET.left)
    const insetR = Math.round(w * INSET.right)
    const insetT = Math.round(h * INSET.top)
    const insetB = Math.round(h * INSET.bottom)
    const insetW = Math.max(0, w - insetL - insetR)
    const insetH = Math.max(0, h - insetT - insetB)

    let cellPx = Math.max(1, Math.min(Math.floor(insetW / MAX_COLS), Math.floor(insetH / rowCount)))
    cellPx -= cellPx % 3 // sub-tile lines (3 per cell) land on integers too
    if (cellPx <= 0) cellPx = 3

    // Leftover inside the inset is split into the padding so the grid is centred on both axes.
    const leftoverX = insetW - MAX_COLS * cellPx
    const leftoverY = insetH - rowCount * cellPx
    const padLeft = insetL + Math.floor(leftoverX / 2)
    const padRight = insetR + leftoverX - Math.floor(leftoverX / 2)
    const padTop = insetT + Math.floor(leftoverY / 2)
    const padBottom = insetB + leftoverY - Math.floor(leftoverY / 2)

    const layoutVars = {
        '--cell-px': `${cellPx}px`,
        '--pad-left': `${padLeft}px`,
        '--pad-right': `${padRight}px`,
        '--pad-top': `${padTop}px`,
        '--pad-bottom': `${padBottom}px`,
    } as React.CSSProperties

    return {wrapRef: setWrapEl, layoutVars}
}

export function RipsFlatBoard({box}: ElementProps) {
    const {stream, events: rawEvents, series, priceRanges, teamPrices, lastFetched} = useLayoutData()
    const manifest = useManifest()

    // Cells whose flip animation has finished — only these join the shared grouping.
    const [settled, setSettled] = useState<Set<number>>(new Set())
    // One-time baseline guard, reset whenever this board (re)mounts.
    const initializedRef = useRef(false)

    const events = useMemo(() => rawEvents.filter((e) => !e.is_giveaway && !e.note), [rawEvents])

    const handleFlipComplete = useCallback((id: number) => {
        setSettled((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))
    }, [])

    // Baseline: on the first real events snapshot every already-sold cell is marked settled (no
    // animation); afterwards only prune ids no longer sold. See FlatBoard.tsx for the full WHY.
    useIsomorphicLayoutEffect(() => {
        const flippedIds = new Set(events.filter((e) => e.customer !== '').map((e) => e.id))
        if (!initializedRef.current) {
            if (!lastFetched.events) return
            initializedRef.current = true
            setSettled(flippedIds)
            return
        }
        setSettled((prev) => {
            let changed = false
            const next = new Set<number>()
            prev.forEach((id) => (flippedIds.has(id) ? next.add(id) : (changed = true)))
            return changed ? next : prev
        })
    }, [events, lastFetched.events])

    // Tier block copied from CobraFlatBoard.tsx: same inputs, so tiers (and therefore order) match.
    const unsoldTeamNames = useMemo(
        () => events.filter((e) => e.customer === '').map((e) => e.team),
        [events]
    )
    const defaultPrice = series?.default_price || DEFAULT_PRICE
    const bestThreshold = priceRanges.find((r) => r.tier_id === 'best')?.price_from ?? BEST_THRESHOLD
    const goodThreshold = priceRanges.find((r) => r.tier_id === 'good')?.price_from ?? GOOD_THRESHOLD
    const midThreshold  = priceRanges.find((r) => r.tier_id === 'mid')?.price_from  ?? MID_THRESHOLD

    const teamCells: TeamCell[] = useMemo(
        () => assignTiers(unsoldTeamNames, teamPrices, defaultPrice, {bestThreshold, goodThreshold, midThreshold}),
        [unsoldTeamNames, teamPrices, defaultPrice, bestThreshold, goodThreshold, midThreshold]
    )
    const tierByTeam = useMemo(() => {
        const m = new Map<string, Tier>()
        for (const c of teamCells) if (!m.has(c.team)) m.set(c.team, c.tier)
        return m
    }, [teamCells])
    const priceLeftByTeam = useMemo(
        () => new Map(teamPrices.map((p) => [p.team, p.price_left])),
        [teamPrices]
    )
    const cells: FlatCell[] = useMemo(
        () =>
            events.map((e) => ({
                eventId: e.id,
                team: e.team,
                tier: tierByTeam.get(e.team) ?? 'regular',
                sold: e.customer !== '',
                priceLeft: priceLeftByTeam.get(e.team) ?? 0,
            })),
        [events, tierByTeam, priceLeftByTeam]
    )

    const rowSizes = useMemo(() => splitRows(events.length), [events.length])
    const rowCount = rowSizes.length
    const placed = useMemo(() => layoutCells(cells), [cells])
    const {wrapRef, layoutVars} = useRipsFlatLayout(rowCount)

    const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

    // Flat's grouping, over the {row, col} addresses from layoutCells (+ the integer column
    // offset that centres a short row, plan §3) instead of posFromIndex.
    const items = useMemo(
        () =>
            placed.flatMap((row) => {
                const offset = Math.floor((MAX_COLS - row.length) / 2)
                return row.map((p) => ({eventId: p.cell.eventId, row: p.row, col: p.col + offset}))
            }),
        [placed]
    )

    const {groups, posGroup} = useMemo(() => {
        const positions = items
            .map((it) => {
                const e = eventById.get(it.eventId)
                return e && e.customer !== '' && settled.has(e.id) ? {row: it.row, col: it.col, order: e.index} : null
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)
        // A fully flipped complete rows x cols grid is one group, regardless of sale order.
        const boardComplete = events.length > 0
            && positions.length === events.length
            && events.length === rowCount * MAX_COLS
        const groups = boardComplete
            ? [rectGroup(0, 0, rowCount - 1, MAX_COLS - 1)]
            : computeGroups(positions)
        const posGroup = new Map<string, Group>()
        groups.forEach((g) => {
            for (let r = g.r0; r <= g.r1; r++) {
                for (let c = g.c0; c <= g.c1; c++) posGroup.set(`${r},${c}`, g)
            }
        })
        return {groups, posGroup}
    }, [items, eventById, settled, events.length, rowCount])

    const waitingFontSize = Math.max(16, box.h * 0.1)

    if (!stream) {
        return (
            <div className="rfb-root">
                <span className="rfb-waiting" style={{fontSize: `${waitingFontSize}px`}}>No active stream</span>
            </div>
        )
    }

    if (!stream.active_break_id) {
        return (
            <div className="rfb-root">
                <span className="rfb-waiting" style={{fontSize: `${waitingFontSize}px`}}>No active break</span>
            </div>
        )
    }

    return (
        <div className="rfb-root" ref={wrapRef} style={{...(layoutVars ?? {}), '--cols': MAX_COLS, '--rows': rowCount} as React.CSSProperties}>
            {layoutVars && (
                <>
                    <div className="rfb-grid">
                        {items.map((it) => {
                            const e = eventById.get(it.eventId)
                            if (!e) return null
                            let group: Group | undefined = posGroup.get(`${it.row},${it.col}`)
                            // Freshly flipped (not yet settled) cell renders as a standalone tile.
                            if (!group && e.customer !== '') {
                                group = {r0: it.row, c0: it.col, r1: it.row, c1: it.col, cells: 1, tier: 1, key: `solo-${e.id}`}
                            }
                            return (
                                <RipsFlatCell
                                    key={e.id}
                                    event={e}
                                    manifest={manifest}
                                    exposure={group ? cellExposure({row: it.row, col: it.col}, group) : undefined}
                                    styleId={group && manifest ? styleForGroup(manifest, group.key) : undefined}
                                    tier={group ? (FORCE_SKIN_TIER ?? group.tier) : undefined}
                                    alreadySettled={settled.has(e.id)}
                                    onFlipComplete={handleFlipComplete}
                                    style={{gridRow: it.row + 1, gridColumn: it.col + 1}}
                                />
                            )
                        })}
                    </div>
                    <AccentOverlay manifest={manifest} groups={groups} cols={MAX_COLS} rows={rowCount} />
                </>
            )}
        </div>
    )
}

export default RipsFlatBoard
