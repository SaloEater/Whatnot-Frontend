'use client'

// The `resultsThin` registry component (obs-layout-plan.md §2.4) — a compact, configurable
// sibling of `results` (§2.3, ResultsElement.tsx) for stages where the full results board is too
// heavy: alongside a board, or during `ripping`. Its own registry id (`resultsThin`, own singleton
// group) so a config may place both a full results board AND a thin list at the same time.
//
// Shares the data spine (`useLayoutData()` — never its own polling) and the ordering helper
// (elements/results/orderResults.ts) with §2.3: that helper's `{columns, sort}` contract was
// generalised in this step precisely so both callers share one ordering implementation instead of
// a second copy of the interleave logic.
//
// The one thing this element does NOT share with §2.3: row sizing. ResultsElement divides
// `box.h` by the row count so a sparse break's rows still stretch to fill the box. This element
// instead lets rows size themselves from their content (`grid-auto-rows: min-content` +
// `align-content: start` in ThinResults.css) — a break with few teams leaves the box's remaining
// height empty rather than stretching rows across it. Text/icon sizes come from the element's own
// settings (px), not from `box`.

import {useMemo} from 'react'
import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import {useSceneEvent} from '../../sceneEventBus'
import {orderResults} from '../results/orderResults'
import {NO_SERIES_TIER, tiersByEventId} from '../results/tiers'
import {ThinResultRow} from './ThinResultRow'
import type {ResultsSort} from '../../schema'
import './ThinResults.css'

// Registry defaults (registry.ts `makeElement()` leaves these fields unset on a freshly-added
// element so the component's own defaults apply, same convention as StashOrPassWrap's DEFAULT_*
// constants) — also used by ThinResultsSettings.tsx so the controls UI shows the same numbers.
export const DEFAULT_COLUMNS = 2
export const DEFAULT_TEXT_SIZE = 22
export const DEFAULT_ICON_SIZE = 28
export const DEFAULT_SORT: ResultsSort = 'alphabetical'

export function ThinResults({elementKey, element}: ElementProps) {
    const {events: rawEvents, breakObject, stream, refetch} = useLayoutData()

    // `element` is typed as the full `Element` union; ThinResults is only ever mounted for a
    // `resultsThin` element (registry.ts maps this component 1:1 to that kind), but the ternaries
    // below narrow defensively rather than assert, so a mismatched registration fails safe to
    // defaults instead of throwing.
    const columns = element.kind === 'resultsThin' ? (element.columns ?? DEFAULT_COLUMNS) : DEFAULT_COLUMNS
    const textSize = element.kind === 'resultsThin' ? (element.textSize ?? DEFAULT_TEXT_SIZE) : DEFAULT_TEXT_SIZE
    const iconSize = element.kind === 'resultsThin' ? (element.iconSize ?? DEFAULT_ICON_SIZE) : DEFAULT_ICON_SIZE
    const sort = element.kind === 'resultsThin' ? (element.sort ?? DEFAULT_SORT) : DEFAULT_SORT

    const {ordered} = useMemo(
        // 'row': .rest-grid is a plain grid-auto-flow:row, so it must be handed the sorted order
        // as is. The column-major scramble `results` uses would split each customer's run across
        // non-adjacent cells here.
        () => orderResults(rawEvents, {columns, sort, flow: 'row'}),
        [rawEvents, columns, sort]
    )

    // Same ranking as the full results board (../results/tiers.ts) so the two never disagree about
    // what tier a slot is — including the "nothing to rank by" case, which flattens everything.
    const hasSeries = !!breakObject?.series_id
    const tiers = useMemo(() => tiersByEventId(rawEvents, hasSeries), [rawEvents, hasSeries])

    // Centre a short final row, exactly as the full board does (see ResultsElement.tsx for the
    // reasoning): the grid is laid out on twice as many tracks as columns with every cell spanning
    // two, so the shift is expressible in HALF columns — without that, one cell across four
    // columns can only manage a whole-column shift and lands off-centre. Rows here are content-
    // sized rather than divided out of the box height, but the column maths is identical.
    const visualRows = columns > 0 ? Math.ceil(ordered.length / columns) : 0
    const lastRowStart = Math.max(0, (visualRows - 1) * columns)
    const lastRowCount = ordered.length - lastRowStart
    const lastRowOffset =
        lastRowCount > 0 && lastRowCount < columns ? columns - lastRowCount : 0


    if (!stream) {
        return (
            <div className="rest-root">
                <div className="rest-empty">Active stream is not set</div>
            </div>
        )
    }

    return (
        <div className="rest-root">
            <div className="rest-frame">
                <div
                    className="rest-grid"
                    style={
                        {
                            '--rest-columns': columns,
                            '--rest-tracks': columns * 2,
                        } as React.CSSProperties
                    }
                >
                    {ordered.map((event, i) => (
                        <ThinResultRow
                            key={event.id}
                            event={event}
                            gridColumnStart={
                                lastRowOffset > 0 && i === lastRowStart ? lastRowOffset + 1 : undefined
                            }
                            tier={tiers.get(event.id) ?? NO_SERIES_TIER}
                            highBidTeam={breakObject?.high_bid_team ?? ''}
                            giveawayTeam={breakObject?.giveaway_team ?? ''}
                            textSize={textSize}
                            iconSize={iconSize}
                        />
                    ))}
                </div>
            </div>
        </div>
    )
}

export default ThinResults
