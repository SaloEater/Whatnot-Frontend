import React, {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {GiveawayTypePack, GiveawayTypeSlab, ObsItem, ObsScene} from "@/app/entity/entities";

interface SceneProps {
    obs: MyOBSWebsocket
    logger: Logger
    setScene: (scene: ObsScene) => void
    scene: ObsScene|null
}

const SceneKey = 'scene'

export const SceneComponent: FC<SceneProps> = (props) => {
    const [scene, setScene] = useState<ObsScene|null>(null)
    const [scenes, setScenes] = useState<ObsScene[]>([])

    function setCachedScene() {
        let localSceneRaw = localStorage.getItem(SceneKey)
        if (localSceneRaw) {
            let localScene = JSON.parse(localSceneRaw)
            setScene(localScene)
            props.setScene(localScene)
        }
    }

    function updateCachedScene() {
        localStorage.setItem(SceneKey, JSON.stringify(scene))
    }

    useEffect(() => {
        setScene(props.scene)
        setCachedScene()
    }, []);

    useEffect(() => {
        setScene(props.scene)
    }, [props.scene]);

    useEffect(() => {
        if (scene) {
            props.setScene(scene)
            updateCachedScene()
        }
    }, [scene]);

    useEffect(() => {
        try {
            if (props.obs.isConnected()) {
                props.obs.getSceneList().then(r => {
                    setScenes(r)
                })
            }
        } catch (e: any) {
            props.logger.add(e.toString())
        }
    }, [props.obs._isConnected]);

    return <div>
        Scene:
        <span className="dropdown p-2">
            <button className="btn btn-secondary dropdown-toggle btn-sm" type="button" id="dropdownMenuButton1" data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                {scene ? scene.name : 'Select scene'}
            </button>
            <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                {
                    scenes.map((i, j) => <li key={j} onClick={_ => setScene(i)} className={`dropdown-item ${scene?.name == i.name ? 'active' : ''}`}>{i.name}</li>)
                }
            </ul>
        </span>
    </div>
}