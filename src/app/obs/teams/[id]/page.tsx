'use client'

import {createRef, Dispatch, SetStateAction, useCallback, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment, {max} from "moment";
import {Stream, WNBreak, Event, SelectedBreak, Demo, GetEventsByBreakResponse} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import './page.css'
import Image from "next/image";
import {
    filterOnlyEmptyTeams,
    filterOnlyOther,
    filterOnlyTakenTeams,
    getEventWithHighestPrice
} from "@/app/common/event_filter";
import EventComponent from "@/app/obs/teams/[id]/eventComponent";
import {useChannel} from "@/app/hooks/useChannel";
import {useDemoById} from "@/app/hooks/useDemoById";
import {IsTeam} from "@/app/common/teams";
import OtherSpotComponent from "@/app/obs/teams/[id]/otherSpotComponent";

export default function Page({params} : {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel, setChannel] = useChannel(channelId)
    const [demoId, setDemoId] = useState<number|null>(null)
    const demo = useDemoById(demoId)
    const [breakObject, setBreakObject] = useState<WNBreak|null>(null)
    const [events, setEvents] = useState<Event[]>([])
    const [otherSpots, setOtherSpots] = useState<Event[]>([])

    function refreshBreakObject(demo: Demo|null) {
        if (!demo) {
            return
        }
        let body = {
            id: demo.break_id
        }
        post(getEndpoints().break_get, body)
            .then((breakO: WNBreak) => {
                setBreakObject(breakO)
            })
    }

    useEffect(() => {
        refreshBreakObject(demo)
        refreshEvents(demo)
        let idBreak = setInterval(() => {
            refreshBreakObject(demo)
        }, 300000)
        let idEvent = setInterval(() => {
            refreshEvents(demo)
        }, 60000)
        return () => {
            clearInterval(idBreak)
            clearInterval(idEvent)
        }
    }, [demo]);

    useEffect(() => {
        if (channel) {
            setDemoId(channel.demo_id)
        }
    }, [channel]);

    function refreshEvents(demo: Demo|null) {
        if (!demo) {
            return
        }
        let eventsBody = { //@ts-ignore
            break_id: demo.break_id
        };

        post(getEndpoints().break_events, eventsBody)
            .then((events: GetEventsByBreakResponse) => {
                events.events.sort((a, b) => {
                    if (a.team > b.team) return 1
                    if (a.team < b.team) return -1
                    return 0
                })
                let teamEvents = events.events.filter(e => !e.is_giveaway && !e.note && IsTeam(e.team))
                setEvents(teamEvents)
                setOtherSpots(filterOnlyOther(events.events))
            })
    }

    let items = []
    if (events.length > 0 && demo) {
        let rowsAmount = 16
        for (let i = 0; i < rowsAmount; i++) {
            let index = i
            let eventObject = events[index]
            let eventParams = {
                event: eventObject,
                highlight_username: demo.highlight_username,
                highBidTeam: breakObject?.high_bid_team ?? '',
                giveawayTeam: breakObject?.giveaway_team ?? ''
            }
            let colKey = `col-${index}`
            items.push(<EventComponent key={colKey} params={eventParams}/>)

            index = i + rowsAmount
            eventObject = events[index]
            eventParams = {
                event: eventObject,
                highlight_username: demo.highlight_username,
                highBidTeam: breakObject?.high_bid_team ?? '',
                giveawayTeam: breakObject?.giveaway_team ?? ''
            }
            colKey = `col-${i}-${index}`
            items.push(<EventComponent key={colKey} params={eventParams}/>)
        }
    }

    let otherSpotsItems = []
    for (let i = 0; i < otherSpots.length; i++) {
        let eventObject = otherSpots[i]
        let eventParams = {
            event: eventObject,
            index: i,
            length: otherSpots.length,
        }
        let colKey = `other-${i}`
        otherSpotsItems.push(<OtherSpotComponent key={colKey} params={eventParams}/>)
    }

    return (
        <div className='main'>
            <div className='w-100 h-100 dimmed-bg p-2'>
                {
                     demo ? <div className='w-100 h-100 d-flex justify-content-center gap-1'>
                        <div className='max-height overflow-hidden d-flex justify-content-center my-flex gap-2 teams-container'>
                            <div className='demo-container teams-bg minw'>
                                {items.length > 0 && items}
                            </div>
                        </div>
                         {
                             otherSpotsItems.length > 0 && <div className="max-height d-flex flex-column align-content-center justify-content-center">
                                 <div className='other-spots-container teams-bg pt-2 pb-2'>
                                     {otherSpotsItems}
                                 </div>
                             </div>
                         }
                     </div> : <div>
                         Demo is not set
                     </div>
                }
            </div>
        </div>
    )
}