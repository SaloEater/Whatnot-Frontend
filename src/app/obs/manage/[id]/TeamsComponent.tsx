import { FC, useEffect, useState } from "react";
import { Logger } from "@/app/entity/logger";
import { MyOBSWebsocket } from "@/app/entity/my_obs_websocket";
import { SetupLogosComponent } from "@/app/obs/manage/[id]/SetupLogosComponent";
import { TabsComponent } from "@/app/component/tabsComponent";
import {
  EmptyID,
  EmptyName,
  EmptyObsItem,
  ObsItem,
  ObsScene,
  RawObsItem,
  SimpleAnimations,
  TeamAnimation,
  TeamAnimations,
  TeamLogos,
} from "@/app/entity/entities";
import { Teams } from "@/app/common/teams";
import { SceneComponent } from "@/app/obs/manage/[id]/scene_component";
import { ManageComponent } from "@/app/obs/manage/[id]/manage_component";
import { StepsComponent } from "@/app/component/stepsComponent";
import { SetupAnimationComponent } from "@/app/obs/manage/[id]/SetupAnimationComponent";
import { SetupAnimationsComponent } from "@/app/obs/manage/[id]/SetupAnimationsComponent";
import {
  filterOnlyType,
  RawObsItemTypeImage,
  RawObsItemTypeMedia,
} from "@/app/utils/obs_item_utils";
import { SetupSimpleAnimationsComponent } from "@/app/obs/manage/[id]/SetupSimpleAnimationsComponent";
import { ObjectsControl } from "./ObjectsControl";

interface TeamsProps {
  logger: Logger;
  obs: MyOBSWebsocket;
  streamId: number;
}

const LogosKey = "logos";
const AnimationsKey = "animations";
const SimpleAnimationsKey = "simple_animations";

export const TeamsComponent: FC<TeamsProps> = (props) => {
  const [animations, setAnimations] = useState<TeamAnimations>({
    sceneName: EmptyName,
    animations: [],
  });
  const [teamLogos, setTeamLogos] = useState<TeamLogos>({
    sceneName: EmptyName,
    logos: [],
  });
  const [simpleAnimations, setSimpleAnimations] = useState<SimpleAnimations>({
    sceneName: EmptyName,
    animations: [],
  });
  const [obsItemsList, setObsItemsList] = useState<RawObsItem[]>([]);
  const [obsScene, setObsScene] = useState<ObsScene | null>(null);

  function createEmptyTeamLogos() {
    let teamLogos: TeamLogos = { sceneName: EmptyName, logos: [] };
    Teams.forEach((i, j) => {
      teamLogos.logos.push({ obsItem: EmptyObsItem, team: i });
    });
    updateLogosStorage(teamLogos);
    return teamLogos;
  }

  function initTeamLogos(): TeamLogos {
    let key = LogosKey;
    if (localStorage.getItem(key) === null) {
      return createEmptyTeamLogos();
    }

    let local = localStorage.getItem(key);
    if (local === null) {
      let message = "Team logos are not init";
      props.logger.add(message);
      throw new Error(message);
    }

    return JSON.parse(local);
  }

  function createAnimations() {
    let emptyAnimations: TeamAnimations = {
      sceneName: EmptyName,
      animations: [],
    };
    Teams.forEach((i, j) => {
      emptyAnimations.animations.push({ obsItem: EmptyObsItem, team: i });
    });
    updateAnimationStorage(emptyAnimations);
    return emptyAnimations;
  }

  function updateTeamLogo(team: string, logo: ObsItem) {
    setTeamLogos((old) => {
      let newA = { ...old };
      let entryIndex = newA.logos.findIndex((i) => i.team == team);
      if (entryIndex === -1) {
        return old;
      }
      newA.logos[entryIndex].obsItem = logo;
      return newA;
    });
  }

  function updateLogosStorage(value: TeamLogos) {
    localStorage.setItem(LogosKey, JSON.stringify(value));
  }

  function updateAnimationStorage(value: TeamAnimations) {
    localStorage.setItem(AnimationsKey, JSON.stringify(value));
  }

  function initAnimations(): TeamAnimations {
    let key = AnimationsKey;
    if (localStorage.getItem(key) === null) {
      return createAnimations();
    }

    let local = localStorage.getItem(key);
    if (local === null) {
      let message = "Animations are not init";
      props.logger.add(message);
      throw new Error(message);
    }

    return JSON.parse(local);
  }

  function updateSimpleAnimationsStorage(value: SimpleAnimations) {
    localStorage.setItem(SimpleAnimationsKey, JSON.stringify(value));
  }

  function createSimpleAnimations() {
    let simpleAnimationsEmpty: SimpleAnimations = {
      sceneName: EmptyName,
      animations: [],
    };
    updateSimpleAnimationsStorage(simpleAnimationsEmpty);
    return simpleAnimationsEmpty;
  }

  function initSimpleAnimations(): SimpleAnimations {
    let key = SimpleAnimationsKey;
    if (localStorage.getItem(key) === null) {
      return createSimpleAnimations();
    }

    let local = localStorage.getItem(key);
    if (local === null) {
      let message = "Simple Animations are not init";
      props.logger.add(message);
      throw new Error(message);
    }

    return JSON.parse(local);
  }

  useEffect(() => {
    setAnimations(initAnimations());
    setTeamLogos(initTeamLogos());
    setSimpleAnimations(initSimpleAnimations());
  }, []);

  useEffect(() => {
    if (teamLogos.logos.length > 0) {
      updateLogosStorage(teamLogos);
    }
  }, [teamLogos]);

  useEffect(() => {
    if (animations.animations.length > 0) {
      updateAnimationStorage(animations);
    }
  }, [animations]);

  useEffect(() => {
    if (simpleAnimations.animations.length > 0) {
      updateSimpleAnimationsStorage(simpleAnimations);
    }
  }, [simpleAnimations]);

  useEffect(() => {
    if (obsScene) {
      props.obs.getSceneItemList(obsScene).then((r) => {
        setObsItemsList(r);
      });
    }
  }, [obsScene]);

  function updateTeamLogosScene(scene: ObsScene) {
    setTeamLogos((old) => {
      let newT = { ...old };
      newT.sceneName = scene.name;
      return newT;
    });
  }

  function updateAnimationsScene(scene: ObsScene) {
    setAnimations((old) => {
      let newT = { ...old };
      newT.sceneName = scene.name;
      return newT;
    });
  }

  function updateAnimation(team: string, logo: ObsItem) {
    setAnimations((old) => {
      let newA = { ...old };
      let entryIndex = newA.animations.findIndex((i) => i.team == team);
      if (entryIndex === -1) {
        return old;
      }
      newA.animations[entryIndex].obsItem = logo;
      return newA;
    });
  }

  function updateSimpleAnimation(id: number, newItem: ObsItem) {
    setSimpleAnimations((old) => {
      let newA = { ...old };
      let entryIndex = newA.animations.findIndex((i) => i.id == id);
      if (entryIndex === -1) {
        return old;
      }
      newA.animations[entryIndex].obsItem = newItem;
      return newA;
    });
  }

  function updateSimpleAnimationsScene(scene: ObsScene) {
    setSimpleAnimations((old) => {
      let newA = { ...old };
      newA.sceneName = scene.name;
      return newA;
    });
  }

  function deleteSimpleAnimation(id: number) {
    setSimpleAnimations((old) => {
      let newA = { ...old };
      let entryIndex = newA.animations.findIndex((i) => i.id == id);
      if (entryIndex === -1) {
        return old;
      }
      newA.animations.splice(entryIndex, 1);
      return newA;
    });
  }

  return (
    <div>
      {props.obs.isConnected() && (
        <SceneComponent
          obs={props.obs}
          logger={props.logger}
          setScene={setObsScene}
          scene={obsScene}
        />
      )}
      {obsScene && (
        <StepsComponent
          steps={[
            {
              name: "Animations",
              node: (
                <StepsComponent
                  steps={[
                    {
                      name: "Team Logo",
                      node: (
                        <SetupLogosComponent
                          updateTeam={updateTeamLogo}
                          itemsList={filterOnlyType(
                            obsItemsList,
                            RawObsItemTypeImage
                          )}
                          scene={obsScene}
                          teamLogos={teamLogos}
                          updateScene={updateTeamLogosScene}
                        />
                      ),
                    },
                    {
                      name: "Advanced Animations",
                      node: (
                        <SetupAnimationsComponent
                          updateAnimation={updateAnimation}
                          itemsList={filterOnlyType(
                            obsItemsList,
                            RawObsItemTypeMedia
                          )}
                          data={animations}
                          updateScene={updateAnimationsScene}
                          scene={obsScene}
                        />
                      ),
                    },
                    {
                      name: "Simple Animations",
                      node: (
                        <SetupSimpleAnimationsComponent
                          updateAnimation={updateSimpleAnimation}
                          itemsList={filterOnlyType(
                            obsItemsList,
                            RawObsItemTypeMedia
                          )}
                          data={simpleAnimations}
                          updateScene={updateSimpleAnimationsScene}
                          scene={obsScene}
                          deleteAnimation={deleteSimpleAnimation}
                        />
                      ),
                    },
                    {
                      name: "Stream",
                      node: (
                        <ManageComponent
                          logger={props.logger}
                          obs={props.obs}
                          scene={obsScene}
                          animations={animations}
                          channelId={props.streamId}
                        />
                      ),
                    },
                  ]}
                />
              ),
            },
            {
              name: "Objects",
              node: <ObjectsControl obs={props.obs} obsScene={obsScene} />,
            },
          ]}
        />
      )}
    </div>
  );
};
