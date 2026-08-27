// One row of the `resultsThin` element (obs-layout-plan.md §2.4). Sibling of
// elements/results/ResultRow.tsx — same team-icon source and high-bid/giveaway color coding, but
// sized from the element's Text size/Icon size settings (px) instead of a row height derived from
// `box.h / rows`, and laid out as a single compact row rather than a boxed grid cell.

import type {Event} from '@/app/entity/entities'
import type {Tier} from '../results/tiers'
import {getTeamImageSrc} from '../results/ResultRow'
import './ThinResultRow.css'

export function ThinResultRow({
    event,
    tier,
    highBidTeam,
    giveawayTeam,
    textSize,
    iconSize,
    gridColumnStart,
}: {
    event: Event
    tier: Tier
    highBidTeam: string
    giveawayTeam: string
    textSize: number
    iconSize: number
    /** Set only on the first cell of a short final row, to centre that row (see ThinResults). */
    gridColumnStart?: number
}) {
    const isHighBidTeam = highBidTeam === event.team
    const isGiveawayTeam = giveawayTeam === event.team

    let bgClass = event.customer === '' ? 'rest-bg-empty' : 'rest-bg-item'
    if (isHighBidTeam) {
        bgClass = 'rest-bg-high-bid'
    } else if (isGiveawayTeam) {
        bgClass = 'rest-bg-giveaway'
    }

    return (
        <div
            className={`rest-row-item rest-tier-${tier}`}
            style={gridColumnStart ? {gridColumnStart} : undefined}
        >
            <img
                className="rest-image"
                src={getTeamImageSrc(event.team)}
                alt={event.team}
                style={{width: iconSize, height: iconSize}}
            />
            <div className={`rest-customer-text ${bgClass}`} style={{fontSize: textSize}}>
                <div className="rest-customer-name">{event.customer}</div>
            </div>
        </div>
    )
}

export default ThinResultRow
