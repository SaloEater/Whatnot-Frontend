import {Event} from "@/app/entity/entities";
import Image from "next/image";
import './eventComponent.css'
import {IsTeam} from "@/app/common/teams";

interface HighlightColors {
    backgroundColor: string,
    textColor: string,
}

export default function EventComponent(
    {params}: {
        params: {
            event: Event,
            highlight_username: string,
            highBidTeam: string,
            giveawayTeam: string,
        }
    }
) {
    function getTeamImageSrc(team: string) {
        if (IsTeam(team)) {
            return `/images/teams/${team}.webp`;
        }
        return `/images/${team}.webp`;
    }

    let isHighBidTeam = params.highBidTeam == params.event.team
    let isGiveawayTeam = params.giveawayTeam == params.event.team

    let bgColors: HighlightColors = {
        backgroundColor: params.event.customer == '' ? 'bg-empty' : 'teams-item-bg',
        textColor: '',
    }

    if (params.highlight_username != '' && params.event.customer == params.highlight_username) {
        bgColors.backgroundColor = 'bg-green'
        bgColors.textColor = 'text-white'
    } else if (isHighBidTeam) {
        bgColors.backgroundColor = 'bg-high-bid'
    } else if (isGiveawayTeam) {
        bgColors.backgroundColor = 'bg-giveaway'
    }

    return <div className={`max-height d-flex dimmed-overlay max-width align-items-center gap-2 `}>
        <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
        <div className={`d-flex align-items-center justify-content-center customer-text customer-border h-75p ${bgColors.backgroundColor} ${bgColors.textColor}`}>
            <div className='overflow-hidden teams-customer'>
                {params.event.customer}
            </div>
        </div>
    </div>
}