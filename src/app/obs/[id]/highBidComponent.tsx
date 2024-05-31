import {Event, WNBreak} from "@/app/entity/entities";
import {getEventWithHighestPrice} from "@/app/common/event_filter";
import './highBidComponent.css'
import {FC, useEffect, useState} from "react";

interface HighBidProps {
    highBid: number
}

// @ts-ignore
export const HighBidComponent: FC<HighBidProps> = (props) => {

    return <div className='hb-container p-2 h-100p d-flex align-items-center justify-content-center'>
        <span className='bigboz-font'>
            $<span className='higbid-color'>{props.highBid}</span>
        </span>
    </div>

}