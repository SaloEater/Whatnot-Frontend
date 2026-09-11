'use client'

// The `board:cobra_flat` registry component (cobra-flat-board-plan.md). One square cell per team
// SLOT (`board:flat`'s "one cell per event" convention), framed in `board:cobra`'s per-tier neon
// border/glow (no price, no badge, no name — plan §1.2), laid out value-centred outward from the
// middle column with sold slots pushed to the outer edges as a hatched grey block (plan §3).
//
// What this borrows from each sibling board, and what changes:
//   - From `board-cobra` (CobraBoard.tsx/pricing.ts): `assignTiers()` for the tier assignment (same
//     inputs — UNSOLD events' team names, same threshold fallbacks — so a team gets the same
//     colour on both boards side by side, plan §2), the four `--neon*` variable blocks copied
//     verbatim into CobraFlatBoard.css (own `cbf-` prefix, not an import — cobra's rules are scoped
//     to `cbr-*` and its font multipliers don't apply here), the tier glow fall-off (mid = inner
//     halo only, regular = none), and a copy of the sheen lottery (`pickSheenTargets`, the tier
//     weights/batch/cooldown constants, the `cancelled` + `clearTimeout` unmount cleanup) — kept as
//     its own copy rather than imported, same reasoning CobraBoard.tsx gives for not sharing it via
//     pricing.ts: the timer and its selection logic read as one unit, and nothing else calls it.
//   - From `board-flat` (FlatBoard.tsx): the `useIntegerBoardLayout`-shaped ResizeObserver sizing
//     hook (ported below as `useCobraFlatLayout`, sized by MAX_COLS/row-count per plan §4 instead
//     of flat's fixed 11-col grid) and the
//     `!e.is_giveaway && !e.note` events filter (cobra_flat wants every slot, sold or not — unlike
//     cobra, which only shows what's still available).
//   - New here (neither sibling has it): `layout.ts`'s value sort + balanced row split + centre-out
//     dealing (plan §3), and the sold-cell hatched-grey rendering (plan §5) — sold cells stay on
//     the board instead of disappearing (cobra) or flipping in place (flat).
//
// No FLIP move animation (plan §7.1 — explicitly deferred to a later task): a sale simply changes
// which slot a cell's rank lands it in, and this component re-renders straight into the new
// `layoutCells()` grid with no transition. The hook-in point for that later work is right where
// `rows` is rendered below — a FLIP layer would sit between computing `rows` and painting it,
// reading old/new DOM rects for the same `cell.eventId`, without `layout.ts` changing at all.
//
// Scene-event wiring deviation (flagged, not silently matched to the plan): the plan's wiring
// table (§6) asks for `reactsTo: ['sold']` on the registry entry, mirroring how it says
// board-flat/results "consume a sold scene event". In this codebase `SceneEventName` no longer
// has a `sold` member — sceneEvents.ts records that `sold` (and `pick2`) were removed from the
// vocabulary "on request", and board-flat/results/resultsThin all still IMPORT `useSceneEvent` but
// never call it, i.e. that wiring is already dead in every sibling that supposedly demonstrates it.
// Reintroducing `sold` as a scene event is a product decision outside this task's scope (frontend
// board rendering), so this component does not call `useSceneEvent` and registry.ts's entry below
// uses `reactsTo: []`, matching what board-flat/results actually declare today. The board still
// updates within one `EVENTS_POLL_MS` (5s) spine poll of a sale either way.

import {useEffect, useMemo, useRef, useState} from 'react'
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
import {TeamIconSrc} from '@/app/common/teams'
import {layoutCells, MAX_COLS, type FlatCell} from './layout'
import './CobraFlatBoard.css'

/*
 * Sheen lottery — a copy of CobraBoard.tsx's, not an import (see that file's own header comment
 * for why the lottery lives beside its `setTimeout` rather than in the shared pricing.ts module).
 * Values are duplicated rather than imported for the same reason CobraBoard.tsx gives for not
 * sharing with composite/tokens.ts: tuning one board's ambient motion should not silently retune
 * the other's. The only behavioural difference from cobra's copy: candidates are keyed by
 * `eventId` (plan §2 — one cell per EVENT, not per team) and sold cells are excluded up front
 * (cobra has no sold cells to exclude in the first place, since it only ever sees unsold events).
 */
const SHEEN_TIER_WEIGHTS: ReadonlyArray<[Tier, number]> = [
    ['best', 45],
    ['good', 30],
    ['mid', 25],
]
const SHEEN_BATCH_MIN = 3
const SHEEN_BATCH_MAX = 5
const SHEEN_COOLDOWN_MIN_MS = 5000
const SHEEN_COOLDOWN_MAX_MS = 13000

function pickSheenTargets(cells: readonly FlatCell[], count: number): FlatCell[] {
    const byTier = new Map<Tier, FlatCell[]>()
    for (const c of cells) {
        if (c.sold || c.tier === 'regular') continue
        if (!byTier.has(c.tier)) byTier.set(c.tier, [])
        byTier.get(c.tier)!.push(c)
    }

    const picked: FlatCell[] = []
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

// Base padding (whole px) between the board and the element's frame edge — same role as
// FlatBoard.tsx's BASE_PAD, no plan-specified value, so this reuses flat's constant.
const BASE_PAD = 10

/*
 * Sizing hook — the shape of FlatBoard.tsx's `useIntegerBoardLayout` (measure the wrapper with a
 * ResizeObserver, floor-divide to a whole-pixel cell), but only solving for ONE integer (cellPx,
 * cells are square) sized against MAX_COLS on the width axis and the actual row COUNT on the
 * height axis (plan §4) — not the widest row actually in use, so the cell size never jumps as
 * teams are added or sold, only the amount of empty margin around the (auto-width, centred) board
 * does.
 */
function useCobraFlatLayout(rowCount: number) {
    // A callback ref (state, not useRef) so the measuring effect re-runs whenever the wrapper
    // element actually changes. Unlike FlatBoard, this component has "No active stream"/"No active
    // break" branches that render BEFORE the board does: with a plain useRef + `[]` deps the effect
    // would run once on mount against the waiting-state root (or nothing at all), and the real
    // board's wrapper — mounted later, once the spine has a stream — would never get measured.
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

    const {w: wrapWidth, h: wrapHeight} = wrapSize
    if (wrapWidth === 0 || wrapHeight === 0 || rowCount === 0) return {wrapRef: setWrapEl, cellPx: 0}

    // cellPx is the cell's OUTER footprint (box + its margin) — CobraFlatBoard.css sizes the box at
    // 0.9em with a 0.05em margin on every side so the two sum to exactly 1em == cellPx.
    const cellPxByWidth = Math.floor((wrapWidth - 2 * BASE_PAD) / MAX_COLS)
    const cellPxByHeight = Math.floor((wrapHeight - 2 * BASE_PAD) / rowCount)
    const cellPx = Math.max(1, Math.min(cellPxByWidth, cellPxByHeight))
    return {wrapRef: setWrapEl, cellPx}
}

export function CobraFlatBoard({box}: ElementProps) {
    const {stream, events: rawEvents, series, priceRanges, teamPrices} = useLayoutData()

    const [sheen, setSheen] = useState<{ids: ReadonlySet<number>; epoch: number} | null>(null)
    const cellsRef = useRef<FlatCell[]>([])

    // Flat's filter (plan §2): every real slot, sold or not, unlike cobra's unsold-only view.
    const events = useMemo(() => rawEvents.filter((e) => !e.is_giveaway && !e.note), [rawEvents])

    // Tiering input is the UNSOLD events' team names only — identical to CobraBoard.tsx's own
    // `teamNames`, so a team lands on the same tier (and colour) on both boards (plan §2/§7 test).
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

    // Tier by team name, for the per-event lookup below. A sold cell's tier is irrelevant to its
    // render (it's always drawn grey), but is looked up the same way regardless — "keeping it in
    // the model costs nothing" (plan §2).
    const tierByTeam = useMemo(() => {
        const m = new Map<string, Tier>()
        for (const c of teamCells) if (!m.has(c.team)) m.set(c.team, c.tier)
        return m
    }, [teamCells])

    const priceLeftByTeam = useMemo(
        () => new Map(teamPrices.map((p) => [p.team, p.price_left])),
        [teamPrices]
    )

    // One cell per EVENT (plan §2), keyed by event.id. Sold means `customer !== ''` (flat's rule),
    // NOT cobra's `price_left === 0` — the two can disagree for a team whose photos are all sold
    // while the slot itself is still open.
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

    const rowCount = cells.length > 0 ? Math.ceil(cells.length / MAX_COLS) : 0
    const {wrapRef, cellPx} = useCobraFlatLayout(rowCount)
    const rows = useMemo(() => layoutCells(cells), [cells])

    /* The lottery timer is mounted once, so it reads the current cells through a ref rather than
       restarting every time the spine refreshes prices/events. */
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
                    setSheen((prev) => ({ids: new Set(targets.map((t) => t.eventId)), epoch: (prev?.epoch ?? 0) + 1}))
                }
                schedule()
            }, delay)
        }

        schedule()
        // Cleanup fires on every unmount path (phase switch away, board removed in the builder,
        // etc.) — `cancelled` stops an in-flight roll from calling `setSheen` after the fact, and
        // `clearTimeout` stops the next roll from ever firing. No timer from a dead instance can
        // survive it (plan §8's "no console errors after unmount" check).
        return () => { cancelled = true; clearTimeout(timer) }
    }, [])

    // Waiting message sizing mirrors CobraBoard.tsx's idea (one line, sized off the box) without
    // needing that file's two-axis fit — there's no per-tier text here to fit, just one string.
    const waitingFontSize = Math.max(16, box.h * 0.03)

    if (!stream) {
        return (
            <div className="cbf-root">
                <span className="cbf-waiting" style={{fontSize: `${waitingFontSize}px`}}>No active stream</span>
            </div>
        )
    }

    if (!stream.active_break_id) {
        return (
            <div className="cbf-root">
                <span className="cbf-waiting" style={{fontSize: `${waitingFontSize}px`}}>No active break</span>
            </div>
        )
    }

    return (
        <div className="cbf-root" ref={wrapRef}>
            {cellPx > 0 && (
                <div className="cbf-grid" style={{fontSize: `${cellPx}px`}}>
                    {rows.map((row, ri) => (
                        <div key={ri} className="cbf-row">
                            {row.map(({cell}) =>
                                cell.sold ? (
                                    <div key={cell.eventId} className="cbf-cell cbf-cell--sold" />
                                ) : (
                                    <div key={cell.eventId} className={`cbf-cell cbf-cell--${cell.tier}`}>
                                        {sheen?.ids.has(cell.eventId) && (
                                            <span className="cbf-cell__sheen-clip" aria-hidden>
                                                {/* Keyed by epoch so a re-picked cell re-runs the sweep. */}
                                                <span key={sheen.epoch} className="cbf-cell__sheen"/>
                                            </span>
                                        )}
                                        {/* Logo art from /images/teams/<team>.webp via TeamIconSrc (the cards
                                            board's convention), NOT flat's /images/new_teams/<team>.png — the
                                            plain logo, no gold octagon frame, since the neon border is the frame
                                            here. TeamIconSrc maps "Miscellaneous" to its own file.
                                            TODO(tech-debt): any other custom-spot name has no art and no text
                                            fallback on this board (cobra-flat-board-plan.md §2) — it 404s to a
                                            broken image. A fallback cell (spot name centred, regular-tier
                                            border) is the fix when a second custom spot appears. */}
                                        {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>, same as every other layout element */}
                                        <img className="cbf-cell__logo" src={TeamIconSrc(cell.team)} alt={cell.team}/>
                                    </div>
                                )
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export default CobraFlatBoard
