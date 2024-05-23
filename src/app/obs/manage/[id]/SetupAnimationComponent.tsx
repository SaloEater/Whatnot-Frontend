import React, {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {Teams} from "@/app/common/teams";
import {
    EmptyID, EmptyName, EmptyObsItem,
    ObsItem,
    TeamAnimation
} from "@/app/entity/entities";
import Image from "next/image";
import {isTeamLogoSet} from "@/app/utils/team_logo_utils";

interface SetupAnimationsProps {
    updateTeam: (team: string, animation: ObsItem) => void
    itemsList: ObsItem[]
    data: TeamAnimation
}

function getTeamImageSrc(team: string) {
    return `/images/teams/${team}.webp`;
}

export const SetupAnimationComponent: FC<SetupAnimationsProps> = (props) => {
    const [isSet, setIsSet] = useState(false)

    useEffect(() => {
        let isSet = isTeamLogoSet(props.data)
        if (isSet && props.itemsList.length > 0 && props.itemsList.findIndex(i => i.uuid == props.data.obsItem.uuid && i.name == props.data.obsItem.name) === -1) {
            props.updateTeam(
                props.data.team,
                EmptyObsItem,
            )
        }
        setIsSet(isSet)
    }, [props.data.obsItem.name, props.data.obsItem.uuid]);

    return <div className='border border-1 p-2 w-100p h-100p'>
        <div className='h-50p overflow-hidden'>
            <span>
                <Image src={getTeamImageSrc(props.data.team)} alt={props.data.team} height="45" width="45"/>
            </span>
            {props.data.team.split(' ').slice(-1)}
        </div>
        <div className='border-top border-white h-50p'>
            <div className='w-50p'>
                {
                    props.itemsList.length > 0
                        ? <div className='d-flex align-items-center'>
                            <div>
                                {isSet ? <span className='text-green'>✓</span> : <span className='text-red'>✘</span>}
                            </div>
                            <div className="dropdown p-2">
                                <button className={`btn btn-secondary dropdown-toggle btn-sm`} type="button" id="dropdownMenuButton1" data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                                    {isSet ? (props.itemsList.find(i => i.uuid == props.data.obsItem.uuid)?.name ?? '<unnamed>') : 'Select source'}
                                </button>
                                <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                                    {
                                        props.itemsList.map((i, j) => <li
                                            key={j}
                                            onClick={_ => props.updateTeam(props.data.team, i)}
                                            className={`dropdown-item ${props.data.obsItem.uuid == i.uuid ? 'active' : ''}`}
                                        >{i.name}</li>)
                                    }
                                </ul>
                            </div>
                        </div>: ' No sources found'
                }
            </div>
        </div>
    </div>
}