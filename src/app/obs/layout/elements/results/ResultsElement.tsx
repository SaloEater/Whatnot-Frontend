'use client'

// The `results` registry component (obs-layout-plan.md §2.3). Ported from
// obs/teams/[id]/page.tsx + eventComponent.tsx — the old route is untouched (byte-identical,
// copy not move; otherSpotComponent.tsx is dead code — imported by nothing — and was not
// ported).
//
// Differences from the old route:
//   - Events, the active break, and the active stream come from the data spine
//     (useLayoutData()) instead of this page's own useChannel/useActiveStream/break_get(300s)/
//     break_events(60s) polling. The spine's break_events poll is 5s, so results now share the
//     board's cadence instead of lagging up to 60s behind a sale (obs-layout-plan.md's inventory
//     called this staleness out explicitly).
//   - The two-column team/other interleave (old page.tsx ~lines 64-85, plus the filter+sort from
//     ~44-59) is lifted into the pure `orderResults()` helper (orderResults.ts). §2.4 generalised
//     that helper to an N-column interleave with a pluggable sort for the `resultsThin` element;
//     the column count here is now a per-element setting (default 2 — the old fixed value).
//   - Heading and two-line tiles come from overlay-1f-spec.md §3/§4, and the tile frames carry
//     that design's price-rank tier ramp (see tiers.ts) over its chryselephantine palette.
//   - Sizing is box-relative: row height is `box.h / rows` (exposed as the `--res-row-h` CSS
//     custom property), not the old `--rows` grid trick riding on a `100vh` page height; the
//     customer-name font size derives from that same row height via `calc()` instead of a fixed
//     `1.1vh`/`1.5em`. Nothing in this element's CSS references vh/vw/vmin.
//   - Reacts to the `sold` scene event by forcing an immediate events refetch, matching
//     board-flat's pattern (obs-layout-plan.md §2.1) — a manually-triggered sale updates the
//     results grid without waiting up to 5s for the spine's normal poll.

import {useMemo} from 'react'
import type {ElementProps} from '../../registry'
import type {ResultsSort} from '../../schema'
import {useLayoutData} from '../../useLayoutData'
import {useSceneEvent} from '../../sceneEventBus'
import {orderResults} from './orderResults'
import {ResultRow} from './ResultRow'
import {NO_SERIES_TIER, tiersByEventId} from './tiers'
import './ResultsElement.css'

// Fixed cosmetic spacing — matches the old route's literal px values (page.css .demo-container:
// padding 20px / gap 7px, scaled down slightly). These were never viewport-relative to begin
// with, so they stay literal px rather than deriving from `box`.
const GRID_PADDING = 16
const GRID_GAP = 6

// Chrome outside the grid that still eats vertical space: .res-frame's border plus
// .res-dimmed-bg's padding, per side. Counted so the rows actually fit the box instead of
// overflowing it by the width of the panel edge.
const FRAME_CHROME = 2 + 4

// Title band, from overlay-1f-spec.md §3: the results screen is headed "BREAK RESULTS". Only the
// heading itself is taken from that design — its palette, tier-coloured frames and 4x10 geometry
// are not. Sized as a fraction of the box so it scales with whatever the element is given.
const TITLE_TEXT = 'BREAK RESULTS'
const TITLE_FRACTION = 0.08
const TITLE_MIN_PX = 26

export const DEFAULT_COLUMNS = 2 // the fixed value this element used before it was a setting
export const DEFAULT_SORT: ResultsSort = 'alphabetical'

export function ResultsElement({elementKey, element, box}: ElementProps) {
    const {events: rawEvents, breakObject, stream, refetch} = useLayoutData()

    // Column count is a setting; the grid CSS and the ordering interleave both read this one
    // value so they cannot disagree about the shape they are laying out.
    const columns = element.kind === 'results' ? (element.columns ?? DEFAULT_COLUMNS) : DEFAULT_COLUMNS
    const sort = element.kind === 'results' ? (element.sort ?? DEFAULT_SORT) : DEFAULT_SORT

    const {ordered} = useMemo(
        // 'row': .res-grid is a plain grid-auto-flow:row, so it must be handed the sorted order as
        // is. The column-major scramble this element inherited from the old /obs/teams route only
        // reads correctly if you scan DOWN each column — which meant `sort: 'customer'` grouped a
        // buyer's slots down a column while the eye reads across rows, so switching sort appeared
        // to do nothing at all. Reading order is also what overlay-1f-spec.md §5 specifies for this
        // screen ("ordering here is reading order — top-left is the most expensive slot",
        // deliberately not the live board's route order).
        () => orderResults(rawEvents, {columns, sort, flow: 'row'}),
        [rawEvents, columns, sort]
    )

    // Ranked over the FULL event list, not the ordered one — see tiers.ts. A break with no series
    // gets no ranking at all: every slot sits on NO_SERIES_TIER.
    const hasSeries = !!breakObject?.series_id
    const tiers = useMemo(() => tiersByEventId(rawEvents, hasSeries), [rawEvents, hasSeries])

    // How many rows the grid ACTUALLY renders. Deliberately derived from the rendered list rather
    // than taken from orderResults()'s `rows`: that value is the sum of the team block's and the
    // specials block's row counts, each interleaved independently — but the grid flows
    // continuously, so the two blocks share a row wherever the first one ends mid-row. Whenever
    // that happens `rows` overstates the truth, which both squashed the row height and pushed
    // `lastRowStart` past the end of the list (making the centring below silently do nothing).
    const visualRows = columns > 0 ? Math.ceil(ordered.length / columns) : 0

    // 'sold' scene event (obs-layout-plan.md §1.9): force an immediate events refetch instead of
    // waiting up to 5s for the spine's normal poll.
    useSceneEvent(elementKey, 'sold', () => {
        refetch('events')
    })

    // Row height from the box, not `100vh` — see file header. Guarded against rows === 0 (no
    // events yet) to avoid a divide-by-zero.
    const titleHeightPx = Math.max(TITLE_MIN_PX, Math.round(box.h * TITLE_FRACTION))
    const availableHeight = Math.max(
        0,
        box.h -
            titleHeightPx -
            FRAME_CHROME * 2 -
            GRID_PADDING * 2 -
            GRID_GAP * Math.max(0, visualRows - 1)
    )
    const rowHeightPx = visualRows > 0 ? availableHeight / visualRows : 0


    // Centre a short last row. The grid flows row-major, so DOM index i sits at row floor(i/cols):
    // the final row starts at `lastRowStart` and holds whatever is left.
    //
    // The grid is laid out on TWICE as many tracks as there are columns, with every cell spanning
    // two of them, so a HALF-column offset is expressible. Without that, centring 1 cell across 4
    // columns needs a 1.5-column shift and integer columns can only manage 1 — the cell lands in
    // column 2 instead of straddling 2 and 3. In half-track units the shift is exactly the
    // shortfall, and the arithmetic comes out even in every case.
    //
    // (Cell width is unchanged by the doubling: 2 tracks + the gap between them, with one gap
    // between neighbours, sums to the same total as N single tracks with N-1 gaps.)
    const lastRowStart = Math.max(0, (visualRows - 1) * columns)
    const lastRowCount = ordered.length - lastRowStart
    const lastRowOffset =
        lastRowCount > 0 && lastRowCount < columns ? columns - lastRowCount : 0

    if (!stream) {
        return (
            <div className="res-root">
                <div className="res-empty">Active stream is not set</div>
            </div>
        )
    }

    return (
        <div className="res-root">
            <div className="res-dimmed-bg">
                <div className="res-frame">
                    <div
                        className="res-title"
                        style={{'--res-title-h': `${titleHeightPx}px`} as React.CSSProperties}
                    >
                        {TITLE_TEXT}
                    </div>
                    {visualRows > 0 && (
                        <div
                            className="res-grid"
                            style={
                                {
                                    '--res-rows': visualRows,
                                    '--res-row-h': `${rowHeightPx}px`,
                                    '--res-pad': `${GRID_PADDING}px`,
                                    '--res-gap': `${GRID_GAP}px`,
                                    '--res-columns': columns,
                                    '--res-tracks': columns * 2,
                                } as React.CSSProperties
                            }
                        >
                            {ordered.map((event, i) => (
                                <ResultRow
                                    key={event.id}
                                    event={event}
                                    gridColumnStart={
                                        lastRowOffset > 0 && i === lastRowStart ? lastRowOffset + 1 : undefined
                                    }
                                    tier={tiers.get(event.id) ?? NO_SERIES_TIER}
                                    highBidTeam={breakObject?.high_bid_team ?? ''}
                                    giveawayTeam={breakObject?.giveaway_team ?? ''}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ResultsElement
