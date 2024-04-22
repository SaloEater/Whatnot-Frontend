import {Event} from "@/app/entity/entities";
import {getEventWithHighestPrice} from "@/app/common/event_filter";
import './highBidComponent.css'
import {FC} from "react";
import Image from "next/image";

interface HighBidTeamProps {
    highBigTeam: string,
}

// @ts-ignore
export const HighBidTeamComponent: FC<HighBidTeamProps> = (props) => {
    function getTeamImageSrc(team: string) {
        return `/images/teams/${team}.webp`;
    }

    return <div className='hb-container p-2'>
        <span className='bigboz-font'>
            High Bid Team:
            {props.highBigTeam != '' && <Image src={getTeamImageSrc(props.highBigTeam)} alt={props.highBigTeam} height="75" width="75"/>}
        </span>
    </div>
}