'use client'

import {createRef, Dispatch, SetStateAction, useCallback, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment, {max} from "moment";
import {Stream, WNBreak, Event, SelectedBreak, Demo} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import './page.css'
import EventComponent from "@/app/demo/[id]/eventComponent";
import Image from "next/image";
import {
    filterOnlyEmptyTeams, filterOnlyOther,
    filterOnlyTakenTeams,
    filterOnlyTeams,
    getEventWithHighestPrice
} from "@/app/common/event_filter";
import {useDemo} from "@/app/hooks/useDemo";
import {useChannel} from "@/app/hooks/useChannel";
import {useDemoById} from "@/app/hooks/useDemoById";
import OtherSpotComponent from "@/app/demo/[id]/otherSpotComponent";

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
    const [otherSpots, setOtherSpots] = useState<Event[]>([])

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
                    if (a.team > b.team) return 1
                    if (a.team < b.team) return -1
                    return 0
                })
                let teamEvents = filterOnlyTeams(events.events)
                setEvents(teamEvents)
                setGiveaways(events.events.filter(e => e.is_giveaway))
                setHighestBidEvent(getEventWithHighestPrice(teamEvents))

                setOtherSpots(filterOnlyOther(events.events))
            })
    }

    let allEvents = [...events, ...otherSpots]

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
                giveawayTeam: breakObject?.giveaway_team ?? '',
                events: allEvents
            }
            let colKey = `col-${index}`
            items.push(<EventComponent key={colKey} params={eventParams}/>)

            index = i + rowsAmount
            eventObject = events[index]
            eventParams = {
                event: eventObject,
                highlight_username: demo.highlight_username,
                highBidTeam: breakObject?.high_bid_team ?? '',
                giveawayTeam: breakObject?.giveaway_team ?? '',
                events: allEvents
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
            events: allEvents,
            index: i,
            length: otherSpots.length,
        }
        let colKey = `other-${i}`
        otherSpotsItems.push(<OtherSpotComponent key={colKey} params={eventParams}/>)
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
                            <div className='demo-container white-overlay minw'>
                                {items.length > 0 && items}
                            </div>
                        </div>
                     </div> : <div>
                         Demo is not set
                     </div>
                }
                {
                    infoShown && <div className='d-flex flex-column align-items-center justify-content-center gap-2 position-absolute end-0 top-0 h-100 w-25p'>
                        {
                            <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center w-75p fs-2 text-black'>
                                Teams:
                                <div className='giveaway-winner'>Left: {getLeftTeamsAmount()}</div>
                                <div className='giveaway-winner'>Taken: {filterOnlyTakenTeams(events).length}</div>
                            </div>
                        }
                        {
                            highestBidEvent && <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center w-75p'>
                                <div className='fs-2 text-black'>Highest bid:</div>
                                <div className='fs-3 text-black giveaway-winner w-95p overflow-hidden d-flex justify-content-center'>{highestBidEvent.customer}</div>
                                <div className='fs-3 text-black giveaway-winner overflow-hidden'>{highestBidEvent.price}$</div>
                            </div>
                        }
                        {
                            otherSpotsItems.length > 0 &&
                            <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center w-75p fs-2 text-black'>
                                Other spots:
                                {otherSpotsItems}
                            </div>
                        }
                    </div>
                }
            </div>
            <div className='position-absolute top-0 end-0' style={{width: 100, height: 100}} onClick={_ => setInfoShown(!infoShown)}></div>
        </div>
    )
}