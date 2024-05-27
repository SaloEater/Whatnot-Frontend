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
    return <div className='hb-container p-2'>
        {highestAmount >= props.highBidFloor && props.highBidFloor != 0 && highestAmount != 0 && <span className='bigboz-font'>
            High Bid: {highestAmount}
        </span>}
    </div>
}