'use client'

import {useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Demo, Event, WNBreak} from "@/app/entity/entities";
import './page.css'
import EventComponent from "@/app/demo/[id]/eventComponent";
import Image from "next/image";
import {filterOnlyEmptyTeams, filterOnlyTakenTeams, getEventWithHighestPrice} from "@/app/common/event_filter";
import {useChannel} from "@/app/hooks/useChannel";
import {useDemoById} from "@/app/hooks/useDemoById";
import {IsTeam} from "@/app/common/teams";

const BUYER_PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e67e22', '#e91e63',
    '#00bcd4', '#8bc34a', '#ff5722', '#607d8b',
    '#ff9800', '#673ab7', '#009688', '#f06292',
]

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
    const [sortMode, setSortMode] = useState<'alpha' | 'buyer'>(() =>
        (localStorage.getItem('demo-sort-mode') as 'alpha' | 'buyer') ?? 'alpha'
    )

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

    const displayEvents = sortMode === 'alpha'
        ? events
        : [...events].sort((a, b) => {
            const aEmpty = a.customer === ''
            const bEmpty = b.customer === ''
            if (aEmpty && !bEmpty) return -1
            if (!aEmpty && bEmpty) return 1
            if (aEmpty && bEmpty) return a.team < b.team ? -1 : a.team > b.team ? 1 : 0
            return a.customer < b.customer ? -1 : a.customer > b.customer ? 1 : 0
        })

    const buyerColorMap = new Map<string, string>()
    const counts = new Map<string, number>()
    for (const e of displayEvents) {
        if (e.customer) counts.set(e.customer, (counts.get(e.customer) ?? 0) + 1)
    }
    let colorIdx = 0
    for (const [buyer, count] of Array.from(counts.entries())) {
        if (count > 1) {
            buyerColorMap.set(buyer, BUYER_PALETTE[colorIdx % BUYER_PALETTE.length])
            colorIdx++
        }
    }

    let teamEvents = displayEvents.filter(e => IsTeam(e.team))
    let otherEvents = displayEvents.filter(e => !IsTeam(e.team))

    // Reorder: teams fill first 16 rows (left col then right col), others follow after
    let orderedEvents: Event[] = []
    let teamRows = Math.ceil(teamEvents.length / 2)
    for (let i = 0; i < teamRows; i++) {
        orderedEvents.push(teamEvents[i])
        let rightIndex = i + teamRows
        if (rightIndex < teamEvents.length) {
            orderedEvents.push(teamEvents[rightIndex])
        }
    }
    let otherRows = Math.ceil(otherEvents.length / 2)
    for (let i = 0; i < otherRows; i++) {
        orderedEvents.push(otherEvents[i])
        let rightIndex = i + otherRows
        if (rightIndex < otherEvents.length) {
            orderedEvents.push(otherEvents[rightIndex])
        }
    }

    let rowsAmount = teamRows + otherRows
    let items: React.ReactNode[] = []
    if (orderedEvents.length > 0 && demo) {
        for (let i = 0; i < orderedEvents.length; i++) {
            items.push(<EventComponent key={`col-${i}`} params={{
                event: orderedEvents[i],
                highlight_username: demo.highlight_username,
                highBidTeam: breakObject?.high_bid_team ?? '',
                giveawayTeam: breakObject?.giveaway_team ?? '',
                events: events,
                buyerColor: buyerColorMap.get(orderedEvents[i].customer),
            }}/>)
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
                        <button
                            className='position-absolute top-0 end-0 btn btn-sm btn-outline-light m-1 z-2'
                            onClick={() => setSortMode(m => {
                                const next = m === 'alpha' ? 'buyer' : 'alpha'
                                localStorage.setItem('demo-sort-mode', next)
                                return next
                            })}
                        >
                            {sortMode === 'alpha' ? 'Sort by buyer' : 'Sort A–Z'}
                        </button>
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