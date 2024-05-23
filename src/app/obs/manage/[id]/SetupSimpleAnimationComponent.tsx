import React, {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {Teams} from "@/app/common/teams";
import {
    EmptyID, EmptyName, EmptyObsItem,
    ObsItem, ObsScene, SimpleAnimation,
    TeamLogo
} from "@/app/entity/entities";
import Image from "next/image";
import {getLogo, isObsItemSet, isTeamLogoSet} from "@/app/utils/team_logo_utils";

interface SetupSimpleAnimationProps {
    updateAnimation: (id: number, newItem: ObsItem) => void
    deleteAnimation: (id: number) => void
    itemsList: ObsItem[]
    data: SimpleAnimation
}

function getTeamImageSrc(team: string) {
    return `/images/teams/${team}.webp`;
}

export const SetupSimpleAnimationComponent: FC<SetupSimpleAnimationProps> = (props) => {
    const [isSet, setIsSet] = useState(false)

    useEffect(() => {
        let isSet = isObsItemSet(props.data.obsItem)
        if (isSet && props.itemsList.length > 0 && props.itemsList.findIndex(i => i.uuid == props.data.obsItem.uuid && i.name == props.data.obsItem.name) === -1) {
            props.updateAnimation(
                props.data.id,
                EmptyObsItem,
            )
        }
        setIsSet(isSet)
    }, [props.data.obsItem.name, props.data.obsItem.uuid]);

    return <div className='border border-1 p-2 w-100p h-100p'>
        <div className='border-top border-white h-100p'>
            <div className='w-100p'>
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
                                            onClick={_ => props.updateAnimation(props.data.id, i)}
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