import './highBidComponent.css'
import {FC} from "react";
import Image from "next/image";
import "./highBidTeamComponent.css"
import {Teams} from "@/app/common/teams";

interface HighBidTeamProps {
    highBigTeam: string,
}

// @ts-ignore
export const HighBidTeamComponent: FC<HighBidTeamProps> = (props) => {
    function getHighBidImageSrc(team: string) {
        if (Teams.indexOf(team) != -1) {
            return `/images/teams/${team}.webp`;
        }
        let boxName = team.split(' ')[1] ?? 'random'
        return `/images/boxes/${boxName}.jpg`;
    }

    return <div className='hbt-container'>
        {props.highBigTeam != '' && <Image src={getHighBidImageSrc(props.highBigTeam)} alt={props.highBigTeam} height="150" width="150"/>}
    </div>
}