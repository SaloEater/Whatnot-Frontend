import {Event} from "@/app/entity/entities";
import Image from "next/image";
import './eventComponent.css'

export default function EventComponent(
    {params}: {
        params: {
            event: Event,
            highlight_username: string
        }
    }
) {
    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    return <div className={`p-1 max-height d-flex dimmed-overlay max-width align-items-center gap-2 customer-border ${params.event.customer == params.highlight_username && params.highlight_username != '' ? 'bg-green' : ''}`}>
        <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
        <div className={`customer-text ${params.event.customer == params.highlight_username && params.highlight_username != '' ? 'text-white' : ''}`}>{params.event.customer}</div>
    </div>
}