import './page.css'
import {FC, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";
import './eventComponent.css'

interface OBSEventProps {
    event: Event,
    initEvent: (event: Event) => void,
    resetEvent: (event: Event) => void;
    isGiveawayTeam: boolean
}

// @ts-ignore
export const EventComponent: FC<OBSEventProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);

    function getTeamImageSrc() {
        return `/images/new_teams/${props.event.team}${props.event.customer == '' ? '' : ' BW'}.png`;
    }

    return <div ref={containerRef} className='grid-item position-relative giveaway-parent'>
        <img className='team-image' src={getTeamImageSrc()}/>
        {props.isGiveawayTeam && <span className='bigboz-font position-absolute giveaway-text fs-1'>
            {/*Free*/}
        </span>}
        {props.isGiveawayTeam && <span className='bigboz-font position-absolute giveaway-text giveaway-text-bottom fs-1'>
            {/*Team*/}
        </span>}
    </div>
}