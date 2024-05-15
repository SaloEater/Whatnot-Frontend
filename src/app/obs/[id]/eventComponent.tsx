import './page.css'
import {FC, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";

interface OBSEventProps {
    event: Event,
    initEvent: (event: Event) => void,
    resetEvent: (event: Event) => void;
}

// @ts-ignore
export const EventComponent: FC<OBSEventProps> = (props) => {
    const containerRef = useRef<HTMLDivElement>(null);

    function getTeamImageSrc() {
        return `/images/new_teams/${props.event.team}${props.event.customer == '' ? '' : ' BW'}.png`;
    }

    return <div ref={containerRef} className={'grid-item'}>
        <img className='team-image' src={getTeamImageSrc()}/>
    </div>
}