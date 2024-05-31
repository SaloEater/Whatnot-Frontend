import {Event} from "@/app/entity/entities";
import {getEventWithHighestPrice} from "@/app/common/event_filter";
import './highBidComponent.css'
import {FC} from "react";
import Image from "next/image";
import "./highBidTeamComponent.css"

interface HighBidTeamProps {
    highBigTeam: string,
}

// @ts-ignore
export const HighBidTeamComponent: FC<HighBidTeamProps> = (props) => {
    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    return <div className='hbt-container'>
        {props.highBigTeam != '' && <Image src={getTeamImageSrc(props.highBigTeam)} alt={props.highBigTeam} height="175" width="175"/>}
    </div>
}