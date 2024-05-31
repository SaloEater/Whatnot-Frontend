import {Event, WNBreak} from "@/app/entity/entities";
import {getEventWithHighestPrice} from "@/app/common/event_filter";
import './highBidComponent.css'
import {FC, useEffect, useState} from "react";

interface HighBidProps {
    events: Event[]
    highBidFloor: number
}

// @ts-ignore
export const HighBidComponent: FC<HighBidProps> = (props) => {
    const [highestAmount, setHighestAmount] = useState(0)

    useEffect(() => {
        let amount = getEventWithHighestPrice(events)?.price ?? 0
        setHighestAmount(amount)
    }, [props.events]);

    let events: Event[] = props.events

    function isHighBid() {
        return highestAmount >= props.highBidFloor && props.highBidFloor != 0 && highestAmount != 0;
    }

    return isHighBid() ? <div className='hb-container p-2 h-100p d-flex align-items-center justify-content-center'>
        <span className='bigboz-font'>
            $<span className='higbid-color'>{highestAmount}</span>
        </span>
    </div> : <div></div>

}