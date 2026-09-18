'use client'

// The `board:classic` registry component (obs-layout-plan.md §2.10). Ported from
// obs/[id]/page.tsx + eventComponent.tsx + customSpotComponent.tsx + highBidComponent.tsx +
// highBidTeamComponent.tsx — the old route is untouched (byte-identical, copy not move).
//
// Differences from the old route:
//   - Events and the break come from the data spine (useLayoutData()) instead of this page's own
//     useChannel/useActiveStream/break_get/break_events polling — the spine is the only backend
//     poller in the layout system (obs-layout-plan.md §1.3). `NEEDS_BY_ID['board:classic']` is `[]`
//     because `events`/`breakObject` are always-on spine sources (useLayoutData.tsx's always-on
//     chain), not on-demand ones a board has to opt into.
//   - Read-only (obs-layout-plan.md §2.10.2): dropped `initEvent`/`resetEvent`/`getNextIndex`/
//     `setEvent`, the `NoCustomer` import, and the `event_update`/`event_move` posts. A stray click
//     on a browser source must not renumber a break.
//   - Dropped the giveaway-team plumbing (`giveawayTeam`, `isGiveawayTeam`) along with it: its only
//     consumers were the two `giveaway-text` spans in eventComponent.tsx, and those spans' content
//     was already commented out in the old file (dead). Flagged as an interpretation in this port's
//     report — the spec's data-derivation list names `giveawayTeam` alongside `highBidTeam`/
//     `highBidFloor`, but keeping it here with nothing to render would just be an unused variable.
//   - Sizing comes from `box` instead of an implicitly full-window layout (obs-layout-plan.md
//     §2.10.3/§2.10.4): `s = box.w / REF_W` (REF_W = 810, the old container's width — it was
//     `w-75p` of a 1080-wide source; VERIFY by placing this element at `box.w: 810` and comparing
//     against the live `/obs/[id]` for the same break). Every `vw`/fixed-px size in the old CSS
//     becomes `calc(var(--classic-s) * Npx)` in ClassicBoard.css, the way CobraBoard.tsx sets
//     `--cbr-font`. `cell` and `gap` are computed here (not left to CSS) as whole pixels — same
//     "integer px so cell edges land on device-pixel boundaries" reasoning as FlatBoard's
//     `useIntegerBoardLayout` — and sized to fit BOTH axes: `rows = ceil((teamEvents.length + 8) /
//     10)` (32 team cells + the 8-cell centre block, 10 columns) plus the custom-spot rows, so a
//     box of any aspect ratio letterboxes instead of overflowing.
//   - A fresh mount snapshots whichever cells are already sold as "settled" (no burst video); only
//     a cell that sells AFTER that snapshot plays `press_animation.webm` — otherwise mounting on an
//     already-half-sold break would fire every existing burst at once. Identical mechanism to
//     FlatBoard's settled-baseline (`lastFetched.events`-gated `useIsomorphicLayoutEffect`, a
//     `Set<number>` of ids, `initializedRef`), just keyed off team + custom events combined instead
//     of FlatBoard's single merged grid.
//   - The burst's `top:-275%/left:-275%/650%` geometry is kept as-is (obs-layout-plan.md §2.10.6):
//     it's expressed in percentages of the tile it bursts from, so it already scales with `cell`
//     with no extra work, and a burst on an edge tile is cropped at the box edge (accepted; the
//     flat board's flip stays inside its box too).
//   - `next/image` -> plain `<img>` in the high-bid team panel (see ClassicHighBid.tsx).

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
import {IsTeam} from "@/app/common/teams"
import {getEventWithHighestPrice} from "@/app/common/event_filter"
import type {ElementProps} from "../../registry"
import {useLayoutData} from "../../useLayoutData"
import {ClassicTile} from "./ClassicTile"
import {ClassicCustomSpot} from "./ClassicCustomSpot"
import {ClassicHighBidAmount, ClassicHighBidTeam} from "./ClassicHighBid"
import './ClassicBoard.css'

// See FlatBoard.tsx's identical constant for why: useLayoutEffect on the server only logs a
// warning and never runs, so SSR falls back to useEffect. Used here so the "already sold at mount"
// settled baseline is committed before the browser paints a frame with a burst on an already-sold
// tile.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

// The old container's width, `w-75p` (75%) of an implicitly 1080-wide source — see this file's
// header for the verify-on-test note.
const REF_W = 810

const COLS = 10
// The centre block spans grid columns 4-7 (span 4) x rows 1-2 (span 2) = 8 cells always reserved,
// regardless of how many teams are left to place around it.
const CENTRE_CELLS = 8

export function ClassicBoard({box}: ElementProps) {
    const {events: rawEvents, breakObject, lastFetched} = useLayoutData()

    // ---- data (obs-layout-plan.md §2.10.1) ----------------------------------------------------
    const filteredEvents = useMemo(
        () => rawEvents.filter(e => !e.is_giveaway && !e.note),
        [rawEvents]
    )

    const teamEvents = useMemo(
        () => filteredEvents.filter(e => IsTeam(e.team)).sort((a, b) => {
            if (a.team > b.team) return 1
            if (a.team < b.team) return -1
            return 0
        }),
        [filteredEvents]
    )

    const customEvents = useMemo(
        () => filteredEvents.filter(e => !IsTeam(e.team)).sort((a, b) =>
            a.team.localeCompare(b.team, undefined, {numeric: true})
        ),
        [filteredEvents]
    )

    const highBid = useMemo(() => getEventWithHighestPrice(teamEvents)?.price ?? 0, [teamEvents])
    const highBidTeam = breakObject?.high_bid_team ?? ''
    const highBidFloor = breakObject?.high_bid_floor ?? Number.MAX_SAFE_INTEGER

    // ---- press-video settled baseline (mirrors FlatBoard.tsx) ---------------------------------
    const [settled, setSettled] = useState<Set<number>>(new Set())
    const initializedRef = useRef(false)
    // State (not just the ref) so the render that follows the baseline snapshot can flip tiles
    // from "treat as settled" to their real value. Until the baseline exists every tile is told
    // it is already settled: a tile's burst effect is a passive useEffect, and React flushes the
    // first commit's passive effects BEFORE re-rendering for the layout effect's setSettled below
    // — so without this, a mount onto an already-half-sold break would run every sold tile's
    // effect once with `alreadySettled=false` and mount (and start fetching) a 16MB video per
    // tile for one commit, even though nothing is painted in between.
    const [baselineReady, setBaselineReady] = useState(false)

    const handleBurstComplete = useCallback((id: number) => {
        setSettled(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
    }, [])

    useIsomorphicLayoutEffect(() => {
        const soldIds = new Set(filteredEvents.filter(e => e.customer !== '').map(e => e.id))
        if (!initializedRef.current) {
            if (!lastFetched.events) return
            initializedRef.current = true
            setSettled(soldIds)
            setBaselineReady(true)
            return
        }
        setSettled(prev => {
            let changed = false
            const next = new Set<number>()
            prev.forEach(id => (soldIds.has(id) ? next.add(id) : (changed = true)))
            return changed ? next : prev
        })
    }, [filteredEvents, lastFetched.events])

    // ---- sizing (obs-layout-plan.md §2.10.3/§2.10.4) ------------------------------------------
    const s = box.w / REF_W

    // Integer px so cell/gap edges land on device-pixel boundaries — same reasoning as FlatBoard's
    // useIntegerBoardLayout. `pad` is NOT tiled (it's the single empty border around the board), so
    // it stays a float; it still has to be the exact px value CSS will render, since it feeds the
    // fit-both-axes math below.
    const gap = Math.max(1, Math.round(s * 10))
    const pad = s * 31.2

    const teamRows = Math.max(1, Math.ceil((teamEvents.length + CENTRE_CELLS) / COLS))
    const customRows = customEvents.length > 0 ? Math.ceil(customEvents.length / COLS) : 0
    const totalRows = teamRows + customRows

    const cellByWidth = Math.floor((box.w - 2 * pad - (COLS - 1) * gap) / COLS)
    const cellByHeight = Math.floor((box.h - 2 * pad - (totalRows - 1) * gap) / totalRows)
    const cell = Math.max(1, Math.min(cellByWidth, cellByHeight))

    const gridW = COLS * cell + (COLS - 1) * gap
    const teamGridH = teamRows * cell + (teamRows - 1) * gap
    const customGridH = customRows > 0 ? customRows * cell + (customRows - 1) * gap : 0
    const boardContentH = teamGridH + (customRows > 0 ? gap : 0) + customGridH
    const boardW = gridW + 2 * pad
    const boardH = boardContentH + 2 * pad
    // The centre block spans 2 rows x 4 columns, so its height is fixed by the cell, NOT by
    // `box.w`. Everything drawn inside it (HIGH BID label, team image, $ amount, the MOUNT /
    // OLYMPUS / RIPS lines) is sized as a fraction of this in ClassicBoard.css rather than from
    // `--classic-s`: `s` is width-only, while `cell` can be height-bound (short box, extra
    // custom-spot rows), and the old page's fixed 150px image only ever fit its block because
    // the OBS source was ~1920 wide — see the 2026-09-18 scaling report. Sizing from the block
    // itself makes the high-bid panel fit at any box shape and independent of REF_W.
    const centreH = 2 * cell + gap

    const cssVars = {
        '--classic-s': s,
        '--classic-cell': `${cell}px`,
        '--classic-gap': `${gap}px`,
        '--classic-pad': `${pad.toFixed(2)}px`,
        '--classic-grid-w': `${gridW}px`,
        '--classic-board-w': `${boardW.toFixed(2)}px`,
        '--classic-board-h': `${boardH.toFixed(2)}px`,
        '--classic-centre-h': `${centreH}px`,
    } as React.CSSProperties

    return (
        <div className="classic-root">
            <div className="classic-board" style={cssVars}>
                <div className="classic-grid">
                    <div className="classic-centre position-relative h-100p">
                        {highBidTeam !== '' ? (
                            <div className="classic-hb-stack d-flex flex-column align-items-center h-100p justify-content-center">
                                <div className="bigboz-font classic-big-font classic-hb-fontsize w-75p d-flex align-items-center justify-content-center">
                                    <div>HIGH BID</div>
                                </div>
                                <div className={`d-flex w-75p ${highBid >= highBidFloor ? 'justify-content-between' : 'justify-content-center'}`}>
                                    <ClassicHighBidTeam team={highBidTeam}/>
                                    {highBid >= highBidFloor && <ClassicHighBidAmount highBid={highBid}/>}
                                </div>
                            </div>
                        ) : (
                            <div className="h-100p bigboz-font classic-big-font d-flex flex-column align-items-center justify-content-center">
                                <div>MOUNT</div>
                                <div>OLYMPUS</div>
                                <div>RIPS</div>
                            </div>
                        )}
                        <img className="classic-overlay position-absolute" src="/images/mount_golden.png" alt=""/>
                    </div>
                    {teamEvents.map(e => (
                        <ClassicTile
                            key={e.id}
                            event={e}
                            alreadySettled={!baselineReady || settled.has(e.id)}
                            onBurstComplete={handleBurstComplete}
                        />
                    ))}
                </div>
                {customEvents.length > 0 && (
                    <div className="classic-custom-row">
                        {customEvents.map(e => (
                            <ClassicCustomSpot
                                key={e.id}
                                event={e}
                                alreadySettled={!baselineReady || settled.has(e.id)}
                                onBurstComplete={handleBurstComplete}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default ClassicBoard
