import {Event, NoCustomer} from "@/app/entity/entities";
import Image from "next/image";
import './eventComponent.css'

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
            events: Event[],
        }
    }
) {
    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    let isHighBidTeam = params.highBidTeam == params.event.team
    let isGiveawayTeam = params.giveawayTeam == params.event.team

    let bgColors: HighlightColors = {
        backgroundColor: params.event.customer == '' ? 'bg-empty' : '',
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

    function getTeamsAmount() {
        let teamEvents = params.events.filter(e => e.customer == params.event.customer)
        return teamEvents.length
    }

    return <div className={`max-height d-flex dimmed-overlay max-width align-items-center gap-2 `}>
        <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
        <div className={`d-flex overflow-hidden align-items-center justify-content-center customer-text customer-border h-75p w-100p ${bgColors.backgroundColor} ${bgColors.textColor}`}>
            <div className='overflow-hidden whitespace-nowrap'>
                <span>{params.event.customer}</span> <span>{params.event.customer != "" && <b>[{getTeamsAmount()}]</b>}</span>
            </div>
        </div>
    </div>
}