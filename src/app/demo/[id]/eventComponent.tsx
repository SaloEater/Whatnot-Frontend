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

    return <div className={`p-1 max-height d-flex dimmed-overlay max-width align-items-center gap-2 ${params.event.customer == params.highlight_username && params.highlight_username != '' ? 'bg-green' : ''}`}>
        <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
        <div className={`customer-text customer-border h-100p w-100p ${params.event.customer == params.highlight_username && params.highlight_username != '' ? 'text-white' : ''}`}>
            <div className='w-95p overflow-hidden d-flex align-items-center justify-content-center'>
                {params.event.customer}
            </div>
        </div>
    </div>
}