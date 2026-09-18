import {Teams} from "@/app/common/teams"

// Ported from obs/[id]/highBidComponent.tsx + highBidTeamComponent.tsx. Both were tiny FCs with
// exactly one prop each and no state — kept as siblings in one file rather than one-component
// files, per obs-layout-plan.md §2.10's "may split into sibling files ... if it keeps things
// readable".

/** The `$<amount>` panel — rendered only when `highBid >= break.high_bid_floor` (ClassicBoard). */
export function ClassicHighBidAmount({highBid}: { highBid: number }) {
    return (
        <div className="classic-hb-container h-100p d-flex align-items-center justify-content-center">
            <span className="bigboz-font classic-hb-amount">
                $<span className="classic-hb-underline">{highBid}</span>
            </span>
        </div>
    )
}

// Swapped `next/image` for a plain `<img>` (obs-layout-plan.md §2.10.3): a fixed-px `next/image`
// cannot scale with the box, and every other ported layout element uses a plain `<img>`.
function getHighBidImageSrc(team: string) {
    if (Teams.indexOf(team) !== -1) {
        return `/images/teams/${team}.webp`
    }
    const boxName = team.split(' ')[1] ?? 'random'
    return `/images/boxes/${boxName}.jpg`
}

/** The high-bid team's own image, inside its rounded gold-bordered panel. */
export function ClassicHighBidTeam({team}: { team: string }) {
    return (
        <div className="classic-hbt-container">
            {team !== '' && <img src={getHighBidImageSrc(team)} alt={team} className="classic-hbt-img"/>}
        </div>
    )
}
