// One grid cell of the `results` element (obs-layout-plan.md §2.3). Ported from
// obs/teams/[id]/eventComponent.tsx.

import type {Event} from '@/app/entity/entities'
import {IsTeam} from '@/app/common/teams'
import {getSpotAbbreviation} from '@/app/common/spot_label'
import type {Tier} from './tiers'
import './ResultRow.css'

// Exported so the `resultsThin` element (obs-layout-plan.md §2.4) can reuse the exact same team
// icon source instead of duplicating it — see ThinResultRow.tsx. Team branch only: every
// non-team spot is now rendered as an abbreviation tile (obs-layout-plan.md §2.3.1) by both
// ResultRow and ThinResultRow, so this never needs to resolve a non-team image path.
export function getTeamImageSrc(team: string): string {
    return `/images/teams/${team}.webp`
}

export function ResultRow({
    event,
    tier,
    highBidTeam,
    giveawayTeam,
    gridColumnStart,
}: {
    event: Event
    tier: Tier
    highBidTeam: string
    giveawayTeam: string
    /** Set only on the first cell of a short final row, to centre that row (see ResultsElement). */
    gridColumnStart?: number
}) {
    const isHighBidTeam = highBidTeam === event.team
    const isGiveawayTeam = giveawayTeam === event.team

    let bgClass = event.customer === '' ? 'res-bg-empty' : 'res-bg-item'
    if (isHighBidTeam) {
        bgClass = 'res-bg-high-bid'
    } else if (isGiveawayTeam) {
        bgClass = 'res-bg-giveaway'
    }

    // Tier colours the FRAME only — tile content stays uniform ivory. That is decision D4 in
    // overlay-1f-plan.md: letting one `currentColor` drive border, icon and name together left
    // grey tiles' content at 2.7:1 while gold ones glowed.
    return (
        <div className={`res-row-item res-tier-${tier}`} style={gridColumnStart ? {gridColumnStart} : undefined}>
            {IsTeam(event.team) ? (
                <img className="res-image" src={getTeamImageSrc(event.team)} alt={event.team} />
            ) : (
                <div className="res-abbr">
                    <span>{getSpotAbbreviation(event.team)}</span>
                </div>
            )}
            <div className={`res-customer-text ${bgClass}`}>
                <div className="res-customer-name">{event.customer}</div>
            </div>
        </div>
    )
}

export default ResultRow
