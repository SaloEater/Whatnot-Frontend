'use client'

import {createRef, Dispatch, SetStateAction, useCallback, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment, {max} from "moment";
import {Stream, WNBreak, Event, SelectedBreak, Demo, GetEventsByBreakResponse} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import './page.css'
import Image from "next/image";
import {filterOnlyEmptyTeams, filterOnlyTakenTeams, getEventWithHighestPrice} from "@/app/common/event_filter";
import EventComponent from "@/app/obs/teams/[id]/eventComponent";
import {useChannel} from "@/app/hooks/useChannel";
import {useDemoById} from "@/app/hooks/useDemoById";
import {IsTeam} from "@/app/common/teams";

export default function Page({params} : {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel, setChannel] = useChannel(channelId)
    const [demoId, setDemoId] = useState<number|null>(null)
    const demo = useDemoById(demoId)
    const [breakObject, setBreakObject] = useState<WNBreak|null>(null)
    const [events, setEvents] = useState<Event[]>([])

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
                    const aIsTeam = IsTeam(a.team)
                    const bIsTeam = IsTeam(b.team)
                    if (aIsTeam && !bIsTeam) return -1
                    if (!aIsTeam && bIsTeam) return 1
                    if (a.team > b.team) return 1
                    if (a.team < b.team) return -1
                    return 0
                })
                let teamEvents = events.events.filter(e => !e.is_giveaway && !e.note)
                setEvents(teamEvents)
            })
    }

    let items = []
    let rowsAmount = Math.ceil(events.length / 2)
    if (events.length > 0 && demo) {
        for (let i = 0; i < rowsAmount; i++) {
            let index = i
            let eventObject = events[index]
            items.push(<EventComponent key={`col-${index}`} params={{
                event: eventObject,
                highlight_username: demo.highlight_username,
                highBidTeam: breakObject?.high_bid_team ?? '',
                giveawayTeam: breakObject?.giveaway_team ?? ''
            }}/>)

            index = i + rowsAmount
            if (index < events.length) {
                eventObject = events[index]
                items.push(<EventComponent key={`col-${i}-${index}`} params={{
                    event: eventObject,
                    highlight_username: demo.highlight_username,
                    highBidTeam: breakObject?.high_bid_team ?? '',
                    giveawayTeam: breakObject?.giveaway_team ?? ''
                }}/>)
            }
        }
    }

    return (
        <div className='main'>
            <div className='w-100 h-100 dimmed-bg p-1'>
                {
                     demo ? <div className='w-100 h-100'>
                        <div className='max-height overflow-hidden d-flex justify-content-center my-flex gap-2 teams-container'>
                            <div className='demo-container teams-bg minw' style={{'--rows': rowsAmount} as React.CSSProperties}>
                                {items.length > 0 && items}
                            </div>
                        </div>
                     </div> : <div>
                         Demo is not set
                     </div>
                }
            </div>
        </div>
    )
}