import {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {Teams} from "@/app/common/teams";
import {SetupLogoComponent} from "@/app/obs/manage/[id]/SetupLogoComponent";
import {
    WNBreak, Demo,
    EmptyID,
    Event, NoCustomer,
    ObsItem,
    ObsScene,
    TeamAnimations,
} from "@/app/entity/entities";
import {ManageTeamComponent} from "@/app/obs/manage/[id]/manage_team_component";
import {getEndpoints, post} from "@/app/lib/backend";
import {filterOnlyTeams} from "@/app/common/event_filter";
import {useDemo} from "@/app/hooks/useDemo";
import {useChannel} from "@/app/hooks/useChannel";
import {useDemoById} from "@/app/hooks/useDemoById";

interface ManageProps {
    obs: MyOBSWebsocket
    logger: Logger
    scene: ObsScene
    animations: TeamAnimations
    channelId: number
}

export const ManageComponent: FC<ManageProps> = (props) => {
    const channelId = props.channelId
    const channel = useChannel(channelId)
    const [demoId, setDemoId] = useState<number|null>(null)
    const demo = useDemoById(demoId)
    const [teamEvents, setTeamEvents] = useState<Map<string, Event>>(new Map<string, Event>())

    useEffect(() => {
        if (channel) {
            setDemoId(channel.demo_id)
        }
    }, [channel]);

    useEffect(() => {
        if (demo) {
            getEvents(demo)
            let idEvent = setInterval(() => {
                getEvents(demo)
            }, 60000)
            return () => {
                clearInterval(idEvent)
            }
        }
    }, [demo]);

    function getEvents(demo: Demo) {
        let body = {
            break_id: demo.break_id
        }
        post(getEndpoints().break_events, body)
            .then((breakEvents: {events: Event[]}) => {
                let newMap = new Map<string, Event>()
                filterOnlyTeams(breakEvents.events).forEach(i => {
                    newMap.set(i.team, i)
                })
                setTeamEvents(newMap)
            })
    }

    function initEvent(event: Event) {
        let body = {...event}
        body.customer = NoCustomer
        post(getEndpoints().event_update, body)
            .then(response => {
                if (response.success) {
                    let moveBody = {
                        id: event.id,
                        new_index: getNextIndex(event)
                    }

                    let oldEvent = teamEvents.get(event.team)
                    if (!oldEvent || oldEvent.customer != '') {
                        return
                    }
                    event.customer = body.customer

                    setEvent(event)

                    post(getEndpoints().event_move, moveBody)
                        .then(_ => {
                            event.index = moveBody.new_index
                            setEvent(event)
                        })
                }

            })
    }

    function getNextIndex(event: Event) {
        let maxTakenIndex = 0
        for (let i of Array.from(teamEvents.values())) {
            if (i.customer && i.index > maxTakenIndex) {
                maxTakenIndex = i.index
            }
        }
        return maxTakenIndex + 1
    }

    function setEvent(event: Event) {
        setTeamEvents((old) => {
            let newEvents = new Map<string, Event>(old)
            newEvents.set(event.team, event)
            return newEvents
        })
    }

    return <div className='d-flex flex-wrap gap-2 w-100p'>
        {props.animations.animations.filter(i => teamEvents.get(i.team)?.customer == '').map((i, j) => <div className='w-15p' key={j}>
            <ManageTeamComponent animation={i} obs={props.obs} logger={props.logger} scene={props.scene} event={teamEvents.get(i.team)} initEvent={initEvent} animationScene={props.animations.sceneName}/>
        </div>)}
    </div>
}