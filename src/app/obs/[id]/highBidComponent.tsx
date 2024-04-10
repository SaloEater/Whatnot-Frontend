import {Event} from "@/app/entity/entities";
import {getEventWithHighestPrice} from "@/app/common/event_filter";
import './highBidComponent.css'

// @ts-ignore
export default function HighBidComponent({_events}) {
    let events: Event[] = _events
    let highestAmount = getEventWithHighestPrice(events)
    return <div className='hb-container position-absolute bottom-0 end-0 d-flex flex-column align-items-center p-2'>
        <div className='bigboz-font'>
            HB:
        </div>
        <div className='bigboz-font'>
            ${highestAmount?.price ?? 0}
        </div>
    </div>
}