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

    return <div className={`max-height d-flex dimmed-overlay max-width align-items-center gap-2 ${params.event.customer == params.highlight_username && params.highlight_username != '' ? 'bg-green' : ''}`}>
        <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
        <div className={`d-flex overflow-hidden align-items-center justify-content-center customer-text customer-border h-75p w-100p ${params.event.customer == params.highlight_username && params.highlight_username != '' ? 'text-white' : ''}`}>
            <div className='overflow-hidden'>
                {params.event.customer}
            </div>
        </div>
    </div>
}