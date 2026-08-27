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
//     this element keeps calling it with {columns: 2, sort: 'alphabetical'} and is unchanged.
//   - Sizing is box-relative: row height is `box.h / rows` (exposed as the `--res-row-h` CSS
//     custom property), not the old `--rows` grid trick riding on a `100vh` page height; the
//     customer-name font size derives from that same row height via `calc()` instead of a fixed
//     `1.1vh`/`1.5em`. Nothing in this element's CSS references vh/vw/vmin.
//   - Reacts to the `sold` scene event by forcing an immediate events refetch, matching
//     board-flat's pattern (obs-layout-plan.md §2.1) — a manually-triggered sale updates the
//     results grid without waiting up to 5s for the spine's normal poll.

import {useMemo} from 'react'
import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import {useSceneEvent} from '../../sceneEventBus'
import {orderResults} from './orderResults'
import {ResultRow} from './ResultRow'
import './ResultsElement.css'

// Fixed cosmetic spacing — matches the old route's literal px values (page.css .demo-container:
// padding 20px / gap 7px, scaled down slightly). These were never viewport-relative to begin
// with, so they stay literal px rather than deriving from `box`.
const GRID_PADDING = 16
const GRID_GAP = 6

export function ResultsElement({elementKey, box}: ElementProps) {
    const {events: rawEvents, breakObject, stream, refetch} = useLayoutData()

    // orderResults() was generalised in §2.4 (resultsThin) to take {columns, sort}; this call is
    // the regression bar for that step — {columns: 2, sort: 'alphabetical'} must keep producing
    // exactly the ordering this element always has.
    const {ordered, rows} = useMemo(
        () => orderResults(rawEvents, {columns: 2, sort: 'alphabetical'}),
        [rawEvents]
    )

    // 'sold' scene event (obs-layout-plan.md §1.9): force an immediate events refetch instead of
    // waiting up to 5s for the spine's normal poll.
    useSceneEvent(elementKey, 'sold', () => {
        refetch('events')
    })

    // Row height from the box, not `100vh` — see file header. Guarded against rows === 0 (no
    // events yet) to avoid a divide-by-zero.
    const availableHeight = Math.max(0, box.h - GRID_PADDING * 2 - GRID_GAP * Math.max(0, rows - 1))
    const rowHeightPx = rows > 0 ? availableHeight / rows : 0

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
                    {rows > 0 && (
                        <div
                            className="res-grid"
                            style={
                                {
                                    '--res-rows': rows,
                                    '--res-row-h': `${rowHeightPx}px`,
                                    '--res-pad': `${GRID_PADDING}px`,
                                    '--res-gap': `${GRID_GAP}px`,
                                } as React.CSSProperties
                            }
                        >
                            {ordered.map((event) => (
                                <ResultRow
                                    key={event.id}
                                    event={event}
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
