'use client'

// The `board:cobra` registry component (obs-layout-plan.md §2.9). Ported from
// obs/prices/[id]/cobra/page.tsx — the old route is untouched (byte-identical, copy not move).
//
// Differences from the old route:
//   - Events, the series, price-range tier thresholds, and per-team prices all come from the data
//     spine (useLayoutData()) instead of this page's own useChannel/useActiveStream/break_get/
//     series_get/widget_board_price_ranges_list/`/api/series/{id}/prices` polling — the spine is
//     the only backend poller in the layout system (obs-layout-plan.md §1.3). `deriveNeeds()`
//     (useLayoutData.tsx) turns on `series`/`priceRanges`/`teamPrices` whenever a `board:cobra`
//     element exists in the config, so all three are already populated by the time this mounts.
//   - `assignTiers`/`buildRows`/`rowWeights` (plus the row-layout helpers they chain into) are
//     lifted into pricing.ts as pure functions of their arguments — see that file's header for
//     why the sibling non-cobra board's `window.innerWidth` note doesn't apply to cobra's
//     `buildRows` (it never read `window` to begin with).
//   - Sizing is box-relative, replacing every viewport unit the old CSS used:
//       - Row heights: the old inline style read `${share*100}vh` — `vh` there meant "the browser
//         source's height", which WAS the whole widget, i.e. this element's `box.h`. Replaced with
//         `${shares[ri] * box.h}px`.
//       - Root height: `.cobra-root { height: 100vh }` -> `.cbr-root { height: 100% }` (of the
//         box `ElementFrame` already sizes this component's root to, matching the convention in
//         ResultsElement.css/CircleWidget.css).
//       - Fonts (refactored again, see "Two-axis type fit" below): the old CSS set every tier's
//         name/price/gem-label size as a fixed `rem`, which was never viewport-relative at all —
//         it only looked right because the operator's OBS browser source for that route happened
//         to be sized close to the canvas's 1080px width. The port's first pass reproduced that as
//         `calc(var(--cbr-rem) * N)` with `--cbr-rem` derived from `box.w` alone — width-only, so
//         a box shortened on the height axis kept full-size text and overflowed its row. This pass
//         retires `--cbr-rem` and fits type to BOTH axes; see the comment above `K_H`/`K_W` below.
//     Nothing in this element's CSS references vh/vw/vmin, and there is no `window.innerWidth`
//     read anywhere in this file (see pricing.ts's header for why: cobra's `buildRows` never had
//     one).
//   - Team names come from `events` filtered to unsold slots only (`!e.is_giveaway &&
//     (e.customer === '' || e.customer === NoCustomer)`) — cobra shows what is still available to
//     buy and at what price, not who already won it; identical filter to the old route.
//   - The sheen lottery (setTimeout-scheduled, rolling which cells glint) stays inside this
//     component, exactly as before, but is now guarded against outliving the element: the
//     `cancelled` flag plus `clearTimeout` in the effect's cleanup fire whenever CobraBoard
//     unmounts (a phase switch away from `selling`, the board variant changing, etc.), so no timer
//     from a previous mount can ever call `setSheen` after the fact.

import {useEffect, useMemo, useRef, useState} from 'react'
import {NoCustomer} from '@/app/entity/entities'
import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import {
    assignTiers,
    BEST_THRESHOLD,
    buildRows,
    DEFAULT_PRICE,
    GOOD_THRESHOLD,
    MAX_ROW_SHARE,
    MID_THRESHOLD,
    rowShares,
    rowTierOf,
    rowWeights,
    TIER_LABEL,
    type TeamCell,
    type Tier,
} from './pricing'
import './CobraBoard.css'

/*
 * Sheen lottery — ported from obs/prices/[id]/cobra/page.tsx (itself from the composite board,
 * src/app/obs/composite/[id]/page.tsx and its MOTION.sheen token). Every SHEEN_COOLDOWN, roll a
 * batch of cells: pick the TIER first (weighted, higher tier = more likely), then a uniform cell
 * within it, without replacement. A pick drives two sweeps in CobraBoard.css: the card
 * left-to-right, then its badge back the other way, which together run 2 x --sheen-sweep, well
 * inside the minimum cooldown. Regular cells never sheen, so the glint reads as "this one is still
 * available and worth something" rather than as decoration. Tiers with nothing left drop out and
 * their weight renormalizes across the rest.
 *
 * Values are duplicated rather than imported from composite/tokens.ts on purpose: that file
 * budgets ambient motion for an overlay composited over a camera feed, and this board has no
 * camera behind it. Tuning one should not silently retune the other. This mirrors the pure
 * selection logic staying in the component rather than pricing.ts — see that file's header.
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

/*
 * Two-axis type fit. Every row computes its own font basis in px from whichever axis is tighter —
 * how tall the row actually is, or how wide one of its cells actually is — and emits it as
 * `--cbr-font` on that `.cbr-row` (replacing the old, global, width-only `--cbr-rem`).
 * CobraBoard.css turns every text size back into the SAME multiple of that basis (`N`) it always
 * was, via `calc(var(--cbr-font) * N)`, and additionally sets `.cbr-row`'s own `font-size` to it so
 * plain `em` on chrome (margin/padding/border/border-radius) resolves against the same basis
 * without every chrome rule needing its own `calc(var(--cbr-font) * …)`.
 *
 *   rowPx     = shares[ri] * usableHeight                     // this row's actual rendered height
 *   cellPx    = box.w / row.length - chromePerCell(fontBasis) // one cell's actual rendered width,
 *                                                              // less its own margin + border
 *   fontBasis = Math.min(rowPx * K_H, cellPx * K_W)
 *
 * `chromePerCell` depends on the basis being solved for (margin/border are `em`, see
 * CobraBoard.css), so it can't be subtracted analytically in one step — `fontBases` below resolves
 * it in two passes: a first basis ignoring chrome, then the real one using the chrome that basis
 * implies. The gap between the two is small (chrome is ~1em of a ~4-7 cell-wide row) and this
 * converges close enough in one extra pass; a full fixed-point iteration isn't worth it here.
 *
 * K_H/K_W calibration — chosen so the reference board (BOARD_BOX, registry.ts: 1080x1300) renders
 * as close to today's fixed `16px * box.w/1080` (== 16px exactly at that box) as a two-axis formula
 * can, for a representative row:
 *   - Row 0 always carries flex-weight 1 exactly (rowWeights' `i === 0` case) no matter which
 *     tiers land on it, so its SHARE depends only on the rows below. A representative full 6-row
 *     board stepping best/good/mid/mid/regular/regular gives weights [1, .9, .81, .81, .729, .729]
 *     (sum 5.978) -> share0 ~= 0.1673.
 *   - usableHeight subtracts the row gap (CobraBoard.css: `gap: calc(var(--cbr-box-h) *
 *     0.00076923)`, chosen to reproduce the old fixed 1px gap at h=1300) for 5 gaps -> ~1295.0.
 *   - rowPx0 = 0.1673 * 1295.0 ~= 216.6px.
 *   - Row 0 gives up ROW_DEFICITS[0]=2 cells versus a standard row; for a representative ~35-cell
 *     board, rowSizes(35, 6) -> [4, 5, 6, 6, 7, 7], i.e. 4 cells -> cellPxRaw = 1080/4 = 270.
 *   - At the target basis (16px), chrome per cell is (CELL_MARGIN_EM + CELL_BORDER_EM) * 2 = 1.0em
 *     -> 16px -> cellPx = 270 - 16 = 254.
 *   - Setting K_H * rowPx0 = K_W * cellPx = 16 — both axes agree exactly at the reference box, so
 *     neither dominates until the box's aspect actually departs from reference — gives
 *     K_H = 16 / 216.6 ~= 0.0738, K_W = 16 / 254 ~= 0.0630.
 */
const K_H = 0.0738
const K_W = 0.0630

// Row gap and the waiting-message padding are structural chrome (not text-relative), so they're
// fractions of the box height in CobraBoard.css (`calc(var(--cbr-box-h) * …)`) rather than an em.
// Both fractions reproduce the old fixed px values (1px gap, 20px padding) at the reference box
// height (1300px). Duplicated as numbers here, matching the CSS fractions by hand (CSS can't be
// `import`ed from), only so `usableHeight` below matches what actually renders.
const ROW_GAP_FRACTION = 1 / 1300
const WAITING_PADDING_FRACTION = 20 / 1300

// Cell chrome as a fraction of the row's font basis — matches `.cbr-cell`'s `margin` (0.375em) and
// `border` (0.125em) in CobraBoard.css. Used only to estimate, per row, how much width that chrome
// removes from a cell before dividing (see fontBases below).
const CELL_MARGIN_EM = 0.375
const CELL_BORDER_EM = 0.125

export function CobraBoard({box}: ElementProps) {
    const {stream, events: rawEvents, series, priceRanges, teamPrices} = useLayoutData()

    const [sheen, setSheen] = useState<{teams: ReadonlySet<string>; epoch: number} | null>(null)
    const cellsRef = useRef<TeamCell[]>([])

    const teamNames = useMemo(
        () =>
            rawEvents
                .filter((e) => !e.is_giveaway && (e.customer === '' || e.customer === NoCustomer))
                .map((e) => e.team),
        [rawEvents]
    )

    const defaultPrice = series?.default_price || DEFAULT_PRICE
    const bestThreshold = priceRanges.find((r) => r.tier_id === 'best')?.price_from ?? BEST_THRESHOLD
    const goodThreshold = priceRanges.find((r) => r.tier_id === 'good')?.price_from ?? GOOD_THRESHOLD
    const midThreshold  = priceRanges.find((r) => r.tier_id === 'mid')?.price_from  ?? MID_THRESHOLD

    const cells = useMemo(
        () => assignTiers(teamNames, teamPrices, defaultPrice, {bestThreshold, goodThreshold, midThreshold}),
        [teamNames, teamPrices, defaultPrice, bestThreshold, goodThreshold, midThreshold]
    )
    const rows = useMemo(() => buildRows(cells), [cells])

    const tiers   = useMemo(() => rows.map(rowTierOf), [rows])
    const weights = useMemo(() => rowWeights(tiers), [tiers])
    const shares  = useMemo(() => rowShares(weights), [weights])

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
        // Cleanup fires on every unmount path (phase switch away, board variant swapped, element
        // removed in the builder): `cancelled` stops an in-flight roll from calling `setSheen`
        // after the fact, and `clearTimeout` stops the NEXT roll from ever firing at all — no
        // timer from a dead CobraBoard instance can survive it.
        return () => { cancelled = true; clearTimeout(timer) }
    }, [])

    // usableHeight: box.h less the row gaps CobraBoard.css actually renders between rows (see
    // ROW_GAP_FRACTION above) — there are rows.length - 1 of them.
    const usableHeight = box.h * (1 - ROW_GAP_FRACTION * Math.max(0, rows.length - 1))

    // One font basis per row — see the K_H/K_W comment above.
    const fontBases = useMemo(
        () => rows.map((row, ri) => {
            const rowPx     = shares[ri] * usableHeight
            const cellPxRaw = box.w / row.length
            // Pass 1: chrome ignored (it depends on the basis being solved for).
            const basis0    = Math.min(rowPx * K_H, cellPxRaw * K_W)
            const chrome    = (CELL_MARGIN_EM + CELL_BORDER_EM) * 2 * basis0
            // Pass 2: chrome subtracted using pass 1's basis.
            const cellPx    = Math.max(0, cellPxRaw - chrome)
            return Math.min(rowPx * K_H, cellPx * K_W)
        }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rows, shares, usableHeight, box.w]
    )

    // The waiting message has no row to size against, so it's treated as one virtual row spanning
    // the whole box: the tallest a real row is ever allowed to be (MAX_ROW_SHARE) by one cell wide,
    // less the message's own padding (see WAITING_PADDING_FRACTION above).
    const waitingBasis = useMemo(() => {
        const rowPx     = MAX_ROW_SHARE * box.h
        const paddingPx = box.h * WAITING_PADDING_FRACTION
        const cellPx    = Math.max(0, box.w - 2 * paddingPx)
        return Math.min(rowPx * K_H, cellPx * K_W)
    }, [box.h, box.w])

    if (!stream) {
        return (
            <div className="cbr-root"
                 style={{'--cbr-box-h': `${box.h}px`, '--cbr-font': `${waitingBasis.toFixed(2)}px`} as React.CSSProperties}>
                <span className="cbr-waiting">No active stream</span>
            </div>
        )
    }

    if (!stream.active_break_id) {
        return (
            <div className="cbr-root"
                 style={{'--cbr-box-h': `${box.h}px`, '--cbr-font': `${waitingBasis.toFixed(2)}px`} as React.CSSProperties}>
                <span className="cbr-waiting">No active break</span>
            </div>
        )
    }

    return (
        <div className="cbr-root" style={{'--cbr-box-h': `${box.h}px`} as React.CSSProperties}>
            {rows.map((row, ri) => (
                <div key={ri}
                     className={`cbr-row cbr-row--${tiers[ri]}`}
                     style={{
                         flex: `${weights[ri]} 1 0%`,
                         maxHeight: `${(shares[ri] * box.h).toFixed(2)}px`,
                         '--cbr-font': `${fontBases[ri].toFixed(2)}px`,
                     } as React.CSSProperties}>
                    {row.map((cell) => {
                        const words    = cell.team.trim().split(' ')
                        const lastName = words[words.length - 1]
                        return (
                            <div key={cell.team}
                                 className={`cbr-cell cbr-cell--${cell.tier}`}>
                                {sheen?.teams.has(cell.team) && (
                                    <span className="cbr-cell__sheen-clip" aria-hidden>
                                        {/* Keyed by epoch so a re-picked cell re-runs the sweep. */}
                                        <span key={sheen.epoch} className="cbr-cell__sheen"/>
                                    </span>
                                )}
                                <span className="cbr-cell__gem">
                                    <span className="cbr-cell__gem-label">{TIER_LABEL[cell.tier]}</span>
                                    {/* Answers the card sweep, delayed by one pass and running back. */}
                                    {sheen?.teams.has(cell.team) && (
                                        <span key={sheen.epoch} className="cbr-cell__gem-sheen" aria-hidden/>
                                    )}
                                </span>
                                <div className="cbr-cell__content">
                                    <span className="cbr-cell__name-last">{lastName}</span>
                                    <span className="cbr-cell__price">{cell.displayPrice}</span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}

export default CobraBoard
