import {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {Teams} from "@/app/common/teams";
import {SetupLogoComponent} from "@/app/obs/manage/[id]/SetupLogoComponent";
import {EmptyID, EmptyName, ObsItem, ObsScene, TeamAnimations, TeamLogos} from "@/app/entity/entities";

interface SetupProps {
    updateTeam: (team: string, logo: ObsItem) => void
    updateScene: (scene: ObsScene) => void
    itemsList: ObsItem[]
    scene: ObsScene
    teamLogos: TeamLogos
}

export const SetupLogosComponent: FC<SetupProps> = (props) => {
    return props.scene.name == props.teamLogos.sceneName
    ? <div className='d-flex flex-wrap w-100p'>
        {props.teamLogos.logos.map((i, j) => <div className='w-15p' key={j}>
            <SetupLogoComponent itemsList={props.itemsList} data={i} updateTeam={props.updateTeam}/>
        </div>)}
    </div> : <div>
        {
            props.teamLogos.sceneName != EmptyName
                ? <div>Current scene should be set to <b>{props.teamLogos.sceneName}</b> or</div>
                : <div>Scene is not set</div>
        }
        <span><button className='btn btn-sm btn-primary' onClick={_ => props.updateScene(props.scene)}>
            Set to {props.scene.name}
        </button></span>
    </div>
}