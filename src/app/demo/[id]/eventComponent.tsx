import {Event} from "@/app/entity/entities";
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
        }
    }
) {
    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    let isHighBidTeam = params.highBidTeam == params.event.team

    let bgColors: HighlightColors = {
        backgroundColor: isHighBidTeam
            ? 'bg-high-big'
            : 'bg-empty',
        textColor: isHighBidTeam
            ? ''
            : '',
    }
    if (params.highlight_username != '' && params.event.customer == params.highlight_username) {
        bgColors.backgroundColor = 'bg-green'
        bgColors.textColor = 'text-white'
    } else if (params.event.customer != '') {
        bgColors.backgroundColor = ''
    }

    return <div className={`max-height d-flex dimmed-overlay max-width align-items-center gap-2 `}>
        <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
        <div className={`d-flex overflow-hidden align-items-center justify-content-center customer-text customer-border h-75p w-100p ${bgColors.backgroundColor} ${bgColors.textColor}`}>
            <div className='overflow-hidden'>
                {params.event.customer}
            </div>
        </div>
    </div>
}