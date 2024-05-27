import {Event} from "@/app/entity/entities";
import {getEventWithHighestPrice} from "@/app/common/event_filter";
import './highBidComponent.css'

// @ts-ignore
export default function HighBidComponent({_events}) {
    let events: Event[] = _events
    let highestAmount = getEventWithHighestPrice(events)
    return <div className='hb-container p-2'>
        {(highestAmount?.price ?? 0) >= 20 && <span className='bigboz-font'>
            High Bid: ${highestAmount?.price ?? 0}
        </span>}
    </div>
}