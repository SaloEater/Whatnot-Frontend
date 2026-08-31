'use client'

// The `board:flat` registry component (obs-layout-plan.md §2.1). Ported from
// obs/[id]/flat/page.tsx — the old route is untouched (byte-identical, copy not move).
//
// Differences from the old route:
//   - Events come from the data spine (useLayoutData()) instead of its own useChannel/
//     useActiveStream/break_events polling — the spine is the only backend poller in the layout
//     system (obs-layout-plan.md §1.3).
//   - `FORCE_SKIN_TIER` is 3, matching the old route's committed override (all groups render the
//     richest ornament); set it to null for the size-based tiers.
//   - Sizing comes from `box` (the element's frame) instead of an implicit full-window layout;
//     the integer-pixel layout hook now also respects the box's HEIGHT, not just its width, so a
//     tall/narrow box can never make the grid overflow, and the grid fills the box on both axes
//     (leftover space becomes padding) so wrapping elements hug the visible board.
//   - A fresh mount snapshots whichever cells are already sold as "settled" (no flip animation);
//     only a cell that sells AFTER that snapshot flips. Without this, mounting on an
//     already-half-sold board would play every existing flip animation at once (see the
//     `lastFetched.events`-gated init effect below).
//   - Reacts to the `sold` scene event by forcing an immediate events refetch, so a manually
//     triggered "sold" cue (or a future automation) flips the board without waiting up to 5s for
//     the spine's normal poll.

import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from "react"
import {IsTeam} from "@/app/common/teams"
import type {ElementProps} from "../../registry"
import {useLayoutData} from "../../useLayoutData"
import {useSceneEvent} from "../../sceneEventBus"
import {FlatEventComponent} from "./flatEventComponent"
import {AccentOverlay} from "./AccentOverlay"
import {computeGroups, posFromIndex, rectGroup} from "./tiles/grouping"
import {cellExposure} from "./tiles/exposure"
import {styleForGroup} from "./tiles/manifest"
import {useManifest} from "./tiles/useManifest"
import {Group} from "./tiles/types"
import './FlatBoard.css'

// Base board padding in whole px between the cells and the grid edge (old route used ~31px).
const BASE_PAD = 10

// Single source of truth for the board's column count — drives the grid CSS, the position math,
// and the accent overlay so the board stays dynamic. Matches obs/[id]/flat/page.tsx.
const COLS = 11

// Every skin renders at this tier regardless of group size — matches the live look of the old
// /obs/[id]/flat route, which has the same override committed. Set to null to restore the
// size-based tiers from tiles/grouping.ts (tierOf).
const FORCE_SKIN_TIER: 1 | 2 | 3 | null = 3

// useLayoutEffect on the server only logs a warning and never runs (SSR has no browser paint to
// block) — fall back to useEffect there, same idiom as Stage.tsx / useBannerScale.ts. Used below
// so the "already sold at mount" baseline is committed before the browser ever paints a frame
// with the animated flip class on an already-sold cell (see the settled-baseline effect).
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

/**
 * Integer-pixel board layout. Cells sized `1fr` resolve to fractional pixels, and each cell box +
 * its painted SVG snap to device pixels independently at raster time — opening 1-2px seams
 * between cells at unlucky widths/heights. Measuring the wrapper and giving every cell the
 * maximum WHOLE-pixel size (with integer padding offsets) puts every cell edge exactly on a pixel
 * boundary, so there is nothing to snap and no seams at any size.
 *
 * Unlike the old full-window route, the wrapper here is a fixed-size box (obs-layout-plan.md
 * §2.1's element frame) — the grid must fit BOTH axes, so the cell size is capped by whichever
 * axis (width/cols or height/rows) is tighter.
 */
function useIntegerBoardLayout(cols: number, rows: number) {
    const boardRef = useRef<HTMLDivElement>(null)
    const [wrapSize, setWrapSize] = useState({w: 0, h: 0})

    useEffect(() => {
        const el = boardRef.current
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
    }, [])

    const {w: wrapWidth, h: wrapHeight} = wrapSize
    if (wrapWidth === 0 || wrapHeight === 0) return {boardRef, layoutVars: {}}

    const cellPxByWidth = Math.floor((wrapWidth - 2 * BASE_PAD) / cols)
    const cellPxByHeight = Math.floor((wrapHeight - 2 * BASE_PAD) / rows)
    let cellPx = Math.max(1, Math.min(cellPxByWidth, cellPxByHeight))
    cellPx -= cellPx % 3 // sub-tile lines (3 per cell) land on integers too
    if (cellPx <= 0) cellPx = 3

    // The grid (and its board.png backdrop) always fills the element's box on BOTH axes: the
    // leftover space on each axis becomes extra padding around the centred cells, so anything
    // that wraps or anchors to this element (e.g. the stash-or-pass ring) hugs the visible board,
    // not an empty strip. Requested by the user after 2.1's first version left the grid at its
    // content height.
    const leftoverX = wrapWidth - 2 * BASE_PAD - cols * cellPx
    const padLeft = BASE_PAD + Math.floor(leftoverX / 2)
    const padRight = BASE_PAD + leftoverX - Math.floor(leftoverX / 2)
    const leftoverY = wrapHeight - 2 * BASE_PAD - rows * cellPx
    const padTop = BASE_PAD + Math.floor(leftoverY / 2)
    const padBottom = BASE_PAD + leftoverY - Math.floor(leftoverY / 2)

    const layoutVars = {
        '--cell-px': `${cellPx}px`,
        '--pad-left': `${padLeft}px`,
        '--pad-right': `${padRight}px`,
        '--pad-top': `${padTop}px`,
        '--pad-bottom': `${padBottom}px`,
    } as React.CSSProperties

    return {boardRef, layoutVars}
}

export function FlatBoard({elementKey}: ElementProps) {
    const {events: rawEvents, lastFetched, refetch} = useLayoutData()
    const manifest = useManifest()

    // Cells whose flip animation has finished — only these join the shared grouping, so a
    // freshly-flipped cell doesn't collapse neighbors' borders mid-animation.
    const [settled, setSettled] = useState<Set<number>>(new Set())
    // Guards the one-time "baseline" snapshot below — reset every time FlatBoard itself
    // (re)mounts (e.g. a phase switch that unmounts and later remounts the board), which is
    // exactly when a fresh no-animation baseline is needed.
    const initializedRef = useRef(false)

    const events = useMemo(
        () =>
            rawEvents
                .filter(e => !e.is_giveaway && !e.note)
                .sort((a, b) => {
                    const aIsTeam = IsTeam(a.team)
                    const bIsTeam = IsTeam(b.team)
                    if (aIsTeam && !bIsTeam) return -1
                    if (!aIsTeam && bIsTeam) return 1
                    if (a.team > b.team) return 1
                    if (a.team < b.team) return -1
                    return 0
                }),
        [rawEvents]
    )

    const handleFlipComplete = useCallback((id: number) => {
        setSettled(prev => (prev.has(id) ? prev : new Set(prev).add(id)))
    }, [])

    // On the FIRST real events snapshot after mount (gated on lastFetched.events, which only
    // becomes truthy once the spine's break_events poll has actually resolved at least once —
    // not on the empty initial context value), mark every already-sold cell settled so it renders
    // in its final flipped state with no animation. Every events change after that only PRUNES
    // settled ids that are no longer sold (a re-flip should animate again); new sales are added to
    // `settled` exclusively via handleFlipComplete, once their CSS flip animation finishes.
    //
    // useIsomorphicLayoutEffect (not useEffect): the events fetch that first satisfies this can
    // land either before OR after FlatBoard's own mount commit (config and events are two
    // independent network requests racing each other). A plain useEffect runs AFTER the browser
    // paints, so if events already had 30 sold cells by the time this effect first got to run,
    // there would already have been one painted frame with `settled` still empty — starting the
    // real CSS flip animation on all 30 before this effect corrects it one tick later. Running
    // synchronously before paint (React keeps re-flushing layout effects until stable, then
    // paints once) means that intermediate frame is never actually shown to the viewer.
    useIsomorphicLayoutEffect(() => {
        const flippedIds = new Set(events.filter(e => e.customer !== '').map(e => e.id))
        if (!initializedRef.current) {
            if (!lastFetched.events) return
            initializedRef.current = true
            setSettled(flippedIds)
            return
        }
        setSettled(prev => {
            let changed = false
            const next = new Set<number>()
            prev.forEach(id => (flippedIds.has(id) ? next.add(id) : (changed = true)))
            return changed ? next : prev
        })
    }, [events, lastFetched.events])


    const rows = Math.max(1, Math.ceil(events.length / COLS))
    const {boardRef, layoutVars} = useIntegerBoardLayout(COLS, rows)

    // Compute rectangular groups from the flipped cells and index them by position. Grouping
    // replays the sale sequence (Event.index), so the partition is a pure function of the sold
    // data — identical across re-renders and page reloads, no runtime history needed.
    const {groups, posGroup} = useMemo(() => {
        const positions = events
            .map((e, i) => (e.customer !== '' && settled.has(e.id) ? {...posFromIndex(i, COLS), order: e.index} : null))
            .filter((p): p is NonNullable<typeof p> => p !== null)
        // Fully flipped board (and a complete rows×cols grid) → one single group covering
        // everything, regardless of how the sale order would have partitioned it. Otherwise,
        // strict sale-order rectangle merge.
        const boardComplete = events.length > 0
            && positions.length === events.length
            && events.length === rows * COLS
        const groups = boardComplete
            ? [rectGroup(0, 0, rows - 1, COLS - 1)]
            : computeGroups(positions)
        const posGroup = new Map<string, Group>()
        groups.forEach(g => {
            for (let r = g.r0; r <= g.r1; r++) {
                for (let c = g.c0; c <= g.c1; c++) posGroup.set(`${r},${c}`, g)
            }
        })
        return {groups, posGroup}
    }, [events, settled, rows])

    return (
        <div className="flat-board-wrap" ref={boardRef} style={{...layoutVars, '--cols': COLS} as React.CSSProperties}>
            <div className="flat-grid">
                {events.map((e, i) => {
                    const pos = posFromIndex(i, COLS)
                    let group: Group | undefined = posGroup.get(`${pos.row},${pos.col}`)
                    // Freshly-flipped (not yet settled) cell → render as its own standalone tile
                    // until its flip finishes and it joins a group.
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
                            alreadySettled={settled.has(e.id)}
                            onFlipComplete={handleFlipComplete}
                        />
                    )
                })}
            </div>
            <AccentOverlay manifest={manifest} groups={groups} cols={COLS} rows={rows} />
        </div>
    )
}

export default FlatBoard
