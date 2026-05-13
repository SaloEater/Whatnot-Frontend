import {FC, useEffect, useState} from "react";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {Logger} from "@/app/entity/logger";
import {Teams} from "@/app/common/teams";
import {SetupLogoComponent} from "@/app/obs/manage/[id]/SetupLogoComponent";
import {
    WNBreak,
    EmptyID,
    Event, NoCustomer,
    ObsItem,
    ObsScene,
    TeamAnimations,
    WNStream,
} from "@/app/entity/entities";
import {ManageTeamComponent} from "@/app/obs/manage/[id]/manage_team_component";
import {getEndpoints, post} from "@/app/lib/backend";
import {filterOnlyTeams} from "@/app/common/event_filter";
import {useChannel} from "@/app/hooks/useChannel";
import {useActiveStream} from "@/app/hooks/useActiveStream";

interface ManageProps {
    obs: MyOBSWebsocket
    logger: Logger
    scene: ObsScene
    animations: TeamAnimations
    channelId: number
}

export const ManageComponent: FC<ManageProps> = (props) => {
    const channelId = props.channelId
    const [channel, setChannel] = useChannel(channelId)
    const stream = useActiveStream(channel)
    const [teamEvents, setTeamEvents] = useState<Map<string, Event>>(new Map<string, Event>())

    useEffect(() => {
        if (stream) {
            getEvents(stream)
            let idEvent = setInterval(() => {
                getEvents(stream)
            }, 60000)
            return () => {
                clearInterval(idEvent)
            }
        }
    }, [stream]);

    function getEvents(stream: WNStream) {
        if (!stream.active_break_id) {
            return
        }
        post(getEndpoints().break_events, {break_id: stream.active_break_id})
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
        {props.animations.animations.filter(i => teamEvents.get(i.team)?.customer == '').map((i, j) => <div className='w-15p' key={i.team}>
            <ManageTeamComponent animation={i} obs={props.obs} logger={props.logger} scene={props.scene} event={teamEvents.get(i.team)} initEvent={initEvent} animationScene={props.animations.sceneName}/>
        </div>)}
    </div>
}
