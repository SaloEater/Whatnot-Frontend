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

    // 'sold' scene event (obs-layout-plan.md §1.9), matching ResultsElement/FlatBoard: force an
    // immediate events refetch instead of waiting up to 5s for the spine's normal poll.
    useSceneEvent(elementKey, 'sold', () => {
        refetch('events')
    })

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
                        } as React.CSSProperties
                    }
                >
                    {ordered.map((event) => (
                        <ThinResultRow
                            key={event.id}
                            event={event}
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
