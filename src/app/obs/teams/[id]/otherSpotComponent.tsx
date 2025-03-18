import {Event} from "@/app/entity/entities";
import Image from "next/image";
import './eventComponent.css'
import './otherSpotComponent.css'

interface HighlightColors {
    backgroundColor: string,
    textColor: string,
}

export default function OtherSpotComponent(
    {params}: {
        params: {
            event: Event,
            index: number,
            length: number,
        }
    }
) {
    return <div className={`d-flex flex-column justify-content-start dimmed-overlay align-items-center gap-2 w-100p`}>
        <div className="fs-3">
            {`${params.index + 1}) ${params.event.team}`}
        </div>
        <div className={`overflow-hidden other-spot-customer-text customer-border`}>
            <div className='teams-customer'>
                {params.event.customer}
            </div>
        </div>
        {params.index < params.length - 1 && (
            <hr className="my-1 w-100 mx-auto separator" />
        )}
    </div>
}