import {Event} from "@/app/entity/entities";
import Image from "next/image";
import './eventComponent.css'

export default function EventComponent(
    {params}: {
        params: {
            event: Event
        }
    }
) {
    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    return <div className='max-height d-flex flex-column align-items-center justify-content-center overflow-hidden'>
        <div className='p-1 max-height d-flex dimmed-overlay max-width align-items-center gap-2'>
            <img className='image' src={getTeamImageSrc(params.event.team)} alt={params.event.team}/>
            <div className='fs-5'>{params.event.customer}</div>
        </div>
    </div>
}