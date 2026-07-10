'use client'

import './page.css'
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Event, GetEventsByBreakResponse, WNStream} from "@/app/entity/entities";
import {useChannel} from "@/app/hooks/useChannel";
import {useActiveStream} from "@/app/hooks/useActiveStream";
import {IsTeam} from "@/app/common/teams";
import {FlatEventComponent} from "./flatEventComponent";
import {AccentOverlay} from "./AccentOverlay";
import {computeGroups, posFromIndex, rectGroup} from "./tiles/grouping";
import {cellExposure} from "./tiles/exposure";
import {styleForGroup} from "./tiles/manifest";
import {useManifest} from "./tiles/useManifest";
import {Group} from "./tiles/types";

// Base board padding in whole px (integer stand-in for the old 1.95rem ≈ 31.2px).
const BASE_PAD = 31

// TEMP: force every skin to this tier regardless of group size (for art
// testing). Set back to null to restore size-based tiers.
const FORCE_SKIN_TIER: 1 | 2 | 3 | null = 3

/**
 * Integer-pixel board layout. Cells sized `1fr` resolve to fractional pixels,
 * and each cell box + its painted SVG snap to device pixels independently at
 * raster time — opening 1-2px seams between cells at unlucky widths. Measuring
 * the wrapper and giving every cell the maximum WHOLE-pixel size (with integer
 * padding offsets) puts every cell edge exactly on a pixel boundary, so there
 * is nothing to snap and no seams at any width.
 */
function useIntegerBoardLayout(cols: number) {
    const boardRef = useRef<HTMLDivElement>(null)
    const [wrapWidth, setWrapWidth] = useState(0)

    useEffect(() => {
        const el = boardRef.current
        if (!el) return
        const measure = () => setWrapWidth(el.clientWidth)
        measure()
        if (typeof ResizeObserver !== 'undefined') {
            const ro = new ResizeObserver(measure)
            ro.observe(el)
            return () => ro.disconnect()
        }
        window.addEventListener('resize', measure)
        return () => window.removeEventListener('resize', measure)
    }, [])

    if (wrapWidth === 0) return {boardRef, layoutVars: {}}

    let cellPx = Math.floor((wrapWidth - 2 * BASE_PAD) / cols)
    cellPx -= cellPx % 3 // sub-tile lines (3 per cell) land on integers too
    const leftoverX = wrapWidth - 2 * BASE_PAD - cols * cellPx
    const padLeft = BASE_PAD + Math.floor(leftoverX / 2)
    const padRight = BASE_PAD + leftoverX - Math.floor(leftoverX / 2)

    const layoutVars = {
        '--cell-px': `${cellPx}px`,
        '--pad-left': `${padLeft}px`,
        '--pad-right': `${padRight}px`,
        '--pad-y': `${BASE_PAD}px`,
    } as React.CSSProperties

    return {boardRef, layoutVars}
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId, 30000)
    const stream = useActiveStream(channel)
    const [events, setEvents] = useState<Event[]>([])
    const manifest = useManifest()
    // Cells whose flip animation has finished — only these join the shared
    // grouping, so a freshly-flipped cell doesn't collapse neighbors' borders
    // mid-animation.
    const [settled, setSettled] = useState<Set<number>>(new Set())

    useEffect(() => {
        refreshEvents(stream)
        const id = setInterval(() => refreshEvents(stream), 5000)
        return () => clearInterval(id)
    }, [stream])

    const handleFlipComplete = useCallback((id: number) => {
        setSettled(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
    }, [])

    // Drop settled ids that are no longer flipped, so a re-flip animates again.
    useEffect(() => {
        const flippedIds = new Set(events.filter(e => e.customer !== '').map(e => e.id))
        setSettled(prev => {
            let changed = false
            const next = new Set<number>()
            prev.forEach(id => (flippedIds.has(id) ? next.add(id) : (changed = true)))
            return changed ? next : prev
        })
    }, [events])

    function refreshEvents(stream: WNStream | null) {
        if (!stream?.active_break_id) return
        post(getEndpoints().break_events, {break_id: stream.active_break_id})
            .then((data: GetEventsByBreakResponse) => {
                setEvents(
                    data.events
                        .filter(e => !e.is_giveaway && !e.note)
                        .sort((a, b) => {
                            const aIsTeam = IsTeam(a.team)
                            const bIsTeam = IsTeam(b.team)
                            if (aIsTeam && !bIsTeam) return -1
                            if (!aIsTeam && bIsTeam) return 1
                            if (a.team > b.team) return 1
                            if (a.team < b.team) return -1
                            return 0
                        })
                )
            })
    }

    // Single source of truth for the board's column count — drives the grid CSS,
    // the position math, and the accent overlay so the board stays dynamic.
    const cols = 11
    const rows = Math.max(1, Math.ceil(events.length / cols))
    const {boardRef, layoutVars} = useIntegerBoardLayout(cols)

    // Compute rectangular groups from the flipped cells and index them by
    // position. Grouping replays the sale sequence (Event.index), so the
    // partition is a pure function of the sold data — identical across
    // re-renders and page reloads, no runtime history needed.
    const {groups, posGroup} = useMemo(() => {
        const positions = events
            .map((e, i) => (e.customer !== '' && settled.has(e.id) ? {...posFromIndex(i, cols), order: e.index} : null))
            .filter((p): p is NonNullable<typeof p> => p !== null)
        // Fully flipped board (and a complete rows×cols grid) → one single
        // group covering everything, regardless of how the sale order would
        // have partitioned it. Otherwise, strict sale-order rectangle merge.
        const boardComplete = events.length > 0
            && positions.length === events.length
            && events.length === rows * cols
        const groups = boardComplete
            ? [rectGroup(0, 0, rows - 1, cols - 1)]
            : computeGroups(positions)
        const posGroup = new Map<string, Group>()
        groups.forEach(g => {
            for (let r = g.r0; r <= g.r1; r++) {
                for (let c = g.c0; c <= g.c1; c++) posGroup.set(`${r},${c}`, g)
            }
        })
        return {groups, posGroup}
    }, [events, settled, cols])

    return (
        <div className="flat-board-wrap" ref={boardRef} style={{...layoutVars, '--cols': cols} as React.CSSProperties}>
            <div className="flat-grid">
                {events.map((e, i) => {
                    const pos = posFromIndex(i, cols)
                    let group: Group | undefined = posGroup.get(`${pos.row},${pos.col}`)
                    // Freshly-flipped (not yet settled) cell → render as its own
                    // standalone tile until its flip finishes and it joins a group.
                    if (!group && e.customer !== '') {
                        group = {r0: pos.row, c0: pos.col, r1: pos.row, c1: pos.col, cells: 1, tier: 1, key: `solo-${e.id}`}
                    }
                    return (
                        <FlatEventComponent
                            key={e.id}
                            event={e}
                            manifest={manifest}
                            exposure={group ? cellExposure(pos, group) : undefined}
                            styleId={group && manifest ? styleForGroup(manifest, group.key) : undefined}
                            tier={group ? (FORCE_SKIN_TIER ?? group.tier) : undefined}
                            onFlipComplete={handleFlipComplete}
                        />
                    )
                })}
            </div>
            <AccentOverlay manifest={manifest} groups={groups} cols={cols} rows={rows} />
        </div>
    )
}
