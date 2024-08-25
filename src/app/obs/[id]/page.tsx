'use client'

import './page.css'
import {useCallback, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {
    GetEventsByBreakResponse,
    Event,
    NoCustomer,
    Demo,
    NoDemoBreak,
    WNBreak,
    WNChannel
} from "@/app/entity/entities";
import {filterOnlyTeams, getEventWithHighestPrice} from "@/app/common/event_filter";
import {EventComponent} from "@/app/obs/[id]/eventComponent";
import {HighBidComponent} from "@/app/obs/[id]/highBidComponent";
import {HighBidTeamComponent} from "@/app/obs/[id]/highBidTeamComponent";
import {useChannel} from "@/app/hooks/useChannel";
import {useDemoById} from "@/app/hooks/useDemoById";

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel, setChannel] = useChannel(channelId, 30000)
    const [demoId, setDemoId] = useState<number|null>(null)
    const demo = useDemoById(demoId)
    const [teamEvents, setTeamsCards] = useState<Event[]>([])
    const [breakObject, setBreakObject] = useState<WNBreak|null>(null);
    const [highBidTeam, setHighBidTeam] = useState('')
    const [giveawayTeam, setGiveawayTeam] = useState('')
    const [highBid, setHighBid] = useState(0)
    const [highBidFloor, setHighBidFloor] = useState(Number.MAX_SAFE_INTEGER)

    useEffect(() => {
        if (channel) {
            setDemoId(channel.demo_id)
        }
    }, [channel]);

    useEffect(() => {
        let amount = getEventWithHighestPrice(teamEvents)?.price ?? 0
        setHighBid(amount)
    }, [teamEvents]);

    useEffect(() => {
        if (breakObject) {
            setHighBidTeam(breakObject.high_bid_team)
            setGiveawayTeam(breakObject.giveaway_team)
            setHighBidFloor(breakObject.high_bid_floor)
        }
    }, [breakObject]);

    function refreshBreak(demo: Demo|null) {
        if (!demo) {
            return
        }

        const body = {
            id: demo.break_id
        }
        post(getEndpoints().break_get, body)
            .then((breakData: WNBreak) => {
                setBreakObject(breakData)
        })
    }

    useEffect(() => {
        refreshEvents(demo)
        refreshBreak(demo)

        let idEvents = setInterval(() => {
            refreshEvents(demo)
        }, 5000)
        let idBreak = setInterval(() => {
            refreshBreak(demo)
        }, 30000)

        return () => {
            clearInterval(idEvents)
            clearInterval(idBreak)
        }

    }, [demo]);

    function refreshEvents(demo: Demo|null) {
        if (!demo || demo.break_id == NoDemoBreak) {
            return
        }

        let body = {
            break_id: demo.break_id
        }
        post(getEndpoints().break_events, body)
            .then((events: GetEventsByBreakResponse) => {
                setTeamsCards(filterOnlyTeams(events.events).sort((a, b) => {
                    if (a.team > b.team) return 1
                    if (a.team < b.team) return -1
                    return 0
                }))
            })
    }

    function setEvent(event: Event) {
        setTeamsCards((old) => {
            let newEvents = [...old]
            let index = newEvents.findIndex(e => e.id == event.id)
            newEvents[index] = event
            return newEvents
        })
    }

    function getNextIndex(event: Event) {
        let maxTakenIndex = 0
        for (let i of teamEvents) {
            if (i.customer && i.index > maxTakenIndex) {
                maxTakenIndex = i.index
            }
        }
        return maxTakenIndex + 1
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

                    let oldEvent = teamEvents.find(e => e.id == event.id)
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

    function resetEvent(event: Event) {
        event.customer = ''
        event.price = 0
        post(getEndpoints().event_update, event)
            .then(response => {
                if (response.success) {
                    let moveBody = {
                        id: event.id,
                        new_index: 33,
                    }

                    setEvent(event)
                }
            })
    }

    function isGiveawayTeam(e: Event) {
        return e.team == giveawayTeam;
    }

    return <main className='teams-container grid-container team-bg p-5'>
        <div className="position-relative grid-middle-item logo h-100p">
            {
                highBidTeam != "" ? <div className='d-flex flex-column align-items-center h-100p justify-content-center gap-2'>
                    <div className='bigboz-font big-font-size hb-fontsize w-75p d-flex align-items-center justify-content-center'>
                        <div>HIGH BID</div>
                    </div>
                    <div className={`d-flex align-items-center w-75p ${highBid >= highBidFloor ? 'justify-content-between' : 'justify-content-center'}`}>
                        <HighBidTeamComponent highBigTeam={highBidTeam}/>
                        {highBid >= highBidFloor && <HighBidComponent highBid={highBid} />}
                    </div>
                </div> : <div className='h-100p bigboz-font big-font-size d-flex flex-column align-items-center justify-content-center'>
                    <div>MOUNT</div>
                    <div>OLYMPUS</div>
                    <div>BREAKS</div>
                </div>
            }
            <img className='overlay' src='/images/mount_golden.png'/>
        </div>
        {teamEvents.map(e => <EventComponent key={e.team} event={e} initEvent={initEvent} resetEvent={resetEvent} isGiveawayTeam={isGiveawayTeam(e)}/>)}
    </main>
}