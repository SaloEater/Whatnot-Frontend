import {Event, NoCustomer} from "@/app/entity/entities";
import Image from "next/image";
import './otherSpotComponent.css'
import {Teams} from "@/app/common/teams";

interface HighlightColors {
    backgroundColor: string,
    textColor: string,
}

export default function OtherSpotComponent(
    {params}: {
        params: {
            event: Event,
            events: Event[],
            index: number,
            length: number,
        }
    }
) {
    function getTeamsAmount() {
        let teamEvents = params.events.filter(e => e.customer == params.event.customer)
        return teamEvents.length
    }

    return <div className={`max-height d-flex flex-column dimmed-overlay align-items-center gap-2 spot-border`}>
        <div>
            {`${params.index + 1}) ${params.event.team}`}
        </div>
        <div className={`overflow-hidden other-spot-customer-text customer-border h-75p`}>
            <div className='overflow-hidden whitespace-nowrap'>
                <span>{params.event.customer}</span> <span>{params.event.customer != "" && <b>[{getTeamsAmount()}]</b>}</span>
            </div>
        </div>
        {params.index < params.length - 1 && (
            <hr className="my-1 w-100 mx-auto separator" />
        )}
    </div>
}