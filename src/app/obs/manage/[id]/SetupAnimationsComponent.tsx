import {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {Teams} from "@/app/common/teams";
import {SetupLogoComponent} from "@/app/obs/manage/[id]/SetupLogoComponent";
import {EmptyID, EmptyName, ObsItem, ObsScene, TeamAnimations, TeamLogos} from "@/app/entity/entities";
import {SetupAnimationComponent} from "@/app/obs/manage/[id]/SetupAnimationComponent";

interface SetupAnimationsProps {
    updateAnimation: (team: string, logo: ObsItem) => void
    updateScene: (scene: ObsScene) => void
    itemsList: ObsItem[]
    data: TeamAnimations
    scene: ObsScene
}

export const SetupAnimationsComponent: FC<SetupAnimationsProps> = (props) => {
    return props.scene.name == props.data.sceneName
    ? <div className='d-flex flex-wrap w-100p'>
        {props.data.animations.map((i, j) => <div className='w-15p' key={j}>
            <SetupLogoComponent itemsList={props.itemsList} data={i} updateTeam={props.updateAnimation}/>
        </div>)}
    </div> : <div>
        {
            props.data.sceneName != EmptyName
                ? <div>Current scene should be set to <b>{props.data.sceneName}</b> or</div>
                : <div>Scene is not set</div>
        }
        <span><button className='btn btn-sm btn-primary' onClick={_ => props.updateScene(props.scene)}>
            Set to {props.scene.name}
        </button></span>
    </div>
}