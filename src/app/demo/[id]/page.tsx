'use client'

import {useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Demo, Event, WNBreak} from "@/app/entity/entities";
import './page.css'
import EventComponent from "@/app/demo/[id]/eventComponent";
import Image from "next/image";
import {filterOnlyEmptyTeams, filterOnlyTakenTeams, getEventWithHighestPrice} from "@/app/common/event_filter";
import {useDemo} from "@/app/hooks/useDemo";
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
    const [giveaways, setGiveaways] = useState<Event[]>([])
    const [highestBidEvent, setHighestBidEvent] = useState<Event|null>(null)
    const demoRef = useRef<Demo|null>(null)
    const [infoShown, setInfoShown] = useState(true)

    useEffect(() => {
        if (channel) {
            setDemoId(channel.demo_id)
        }
    }, [channel]);

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

    function refreshEvents(demo: Demo|null) {
        if (!demo) {
            return
        }
        let eventsBody = { //@ts-ignore
            break_id: demo.break_id
        };

        post(getEndpoints().break_events, eventsBody)
            .then((events: {events: Event[]}) => {
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
                setGiveaways(events.events.filter(e => e.is_giveaway))
                setHighestBidEvent(getEventWithHighestPrice(teamEvents))
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
                giveawayTeam: breakObject?.giveaway_team ?? '',
                events: events
            }}/>)

            index = i + rowsAmount
            if (index < events.length) {
                eventObject = events[index]
                items.push(<EventComponent key={`col-${i}-${index}`} params={{
                    event: eventObject,
                    highlight_username: demo.highlight_username,
                    highBidTeam: breakObject?.high_bid_team ?? '',
                    giveawayTeam: breakObject?.giveaway_team ?? '',
                    events: events
                }}/>)
            }
        }
    }

    function launchFullScreen() {
        var elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else { // @ts-ignore
            if (elem.webkitRequestFullscreen) { // @ts-ignore
                elem.webkitRequestFullscreen(); // @ts-ignore
            }
        }
    }

    function getLeftTeamsAmount() {
        let actualEmptyTeams = filterOnlyEmptyTeams(events).length
        events.filter(i => (i.team == breakObject?.giveaway_team || i.team == breakObject?.high_bid_team) && i.customer == '')
            .forEach(i => actualEmptyTeams--)
        return Math.max(actualEmptyTeams, 0)
    }

    return (
        <div className='main'>
            <div className='w-100 h-100 dimmed-bg p-1'>
                {
                     demo ? <div className='w-100 h-100 z-1 position-relative'>
                        <Image className='position-absolute top-0 start-0 bg-img' src='/images/full_screen.png' alt={'fullscreen'} onClick={launchFullScreen} width='50' height='50'/>
                        <div className='max-height overflow-hidden d-flex justify-content-center my-flex gap-2 teams-container'>
                            <div className='demo-container white-overlay minw' style={{'--rows': rowsAmount} as React.CSSProperties}>
                                {items.length > 0 && items}
                            </div>
                            {
                                infoShown && <div className='d-flex flex-column align-items-center justify-content-center gap-2'>
                                    {
                                        <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center fs-2'>
                                            Teams
                                            <div className='giveaway-winner'>Left: {getLeftTeamsAmount()}</div>
                                            <div className='giveaway-winner'>Taken: {filterOnlyTakenTeams(events).length}</div>
                                        </div>
                                    }
                                    {
                                        highestBidEvent && <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center'>
                                            <div className='fs-2'>Highest bid:</div>
                                            <div className='fs-3 giveaway-winner overflow-hidden d-flex justify-content-center'>{highestBidEvent.customer.length > 15 ? highestBidEvent.customer.substring(0, 15) + '…' : highestBidEvent.customer}</div>
                                            <div className='fs-3 giveaway-winner overflow-hidden'>{highestBidEvent.price}$</div>
                                        </div>
                                    }
                                </div>
                            }
                        </div>
                     </div> : <div>
                         Demo is not set
                     </div>
                }
            </div>
            <div className='position-absolute top-0 end-0' style={{width: 100, height: 100}} onClick={_ => setInfoShown(!infoShown)}></div>
        </div>
    )
}