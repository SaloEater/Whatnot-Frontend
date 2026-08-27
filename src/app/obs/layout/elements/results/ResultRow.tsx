// One grid cell of the `results` element (obs-layout-plan.md §2.3). Ported from
// obs/teams/[id]/eventComponent.tsx.

import type {Event} from '@/app/entity/entities'
import {IsTeam} from '@/app/common/teams'
import './ResultRow.css'

// Exported so the `resultsThin` element (obs-layout-plan.md §2.4) can reuse the exact same team
// icon source instead of duplicating it — see ThinResultRow.tsx.
export function getTeamImageSrc(team: string): string {
    if (IsTeam(team)) {
        return `/images/teams/${team}.webp`
    }
    return `/images/${team}.webp`
}

export function ResultRow({
    event,
    highBidTeam,
    giveawayTeam,
}: {
    event: Event
    highBidTeam: string
    giveawayTeam: string
}) {
    const isHighBidTeam = highBidTeam === event.team
    const isGiveawayTeam = giveawayTeam === event.team

    let bgClass = event.customer === '' ? 'res-bg-empty' : 'res-bg-item'
    if (isHighBidTeam) {
        bgClass = 'res-bg-high-bid'
    } else if (isGiveawayTeam) {
        bgClass = 'res-bg-giveaway'
    }

    return (
        <div className="res-row-item">
            <img className="res-image" src={getTeamImageSrc(event.team)} alt={event.team} />
            <div className={`res-customer-text ${bgClass}`}>
                <div className="res-customer-name">{event.customer}</div>
            </div>
        </div>
    )
}

export default ResultRow
