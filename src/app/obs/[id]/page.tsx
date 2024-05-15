'use client'

import './page.css'
import {useCallback, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event, NoCustomer, Demo, NoDemoBreak, Break} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";
import {EventComponent} from "@/app/obs/[id]/eventComponent";
import HighBidComponent from "@/app/obs/[id]/highBidComponent";
import {HighBidTeamComponent} from "@/app/obs/[id]/highBidTeamComponent";

export default function Page({params}: {params: {id: string}}) {
    const [teamEvents, setTeamsCards] = useState<Event[]>([])
    const [breakObject, setBreakObject] = useState<Break|null>(null);
    const [demo, setDemo] = useState<Demo|null>(null)
    const demoRef = useRef<Demo|null>(null)
    const streamId = parseInt(params.id)
    const [highBidTeam, setHighBidTeam] = useState('')

    function refreshDemo (){
        let eventsBody = {
            stream_id: streamId
        };

        post(getEndpoints().stream_demo, eventsBody)
            .then((response: Demo) => {
                if (!demo || response.id != demo.id) {
                    setDemo(response)
                }
            })
    }

    useEffect(() => {
        setHighBidTeam(breakObject?.high_bid_team ?? '')
    }, [breakObject]);

    function refreshBreak() {
        let demoO = demoRef.current
        if (!demoO) {
            return
        }

        const body = {
            id: demoO.break_id
        }
        post(getEndpoints().break_get, body)
            .then((breakData: Break) => {
                setBreakObject(breakData)
        })
    }

    useEffect(() => {
        refreshEvents()
        demoRef.current = demo
    }, [demo]);

    useEffect(() => {
        refreshDemo()

        setInterval(() => {
            refreshEvents()
        }, 5000)
        setInterval(() => {
            refreshDemo()
        }, 20000)
        setInterval(() => {
            refreshBreak()
        }, 30000)
    }, []);

    function refreshEvents() {
        if (!demoRef.current || demoRef.current.break_id == NoDemoBreak) {
            return
        }

        let body = {
            break_id: demoRef.current.break_id
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

    useEffect(() => {
        refreshEvents()
        setInterval(refreshEvents, 5000)
    }, []);

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

    return <main className='teams-container grid-container team-bg p-5'>
        <div className="position-relative grid-middle-item logo h-100p">
            <div className='bigboz-font big-font-size d-flex flex-column align-items-center justify-content-center'>
                <div>MOUNT OLYMPUS</div>
                <div>BREAKS</div>
            </div>
            <div className='d-flex flex-column align-items-center'>
                {demo && <HighBidTeamComponent highBigTeam={highBidTeam}/>}
                <HighBidComponent _events={teamEvents}/>
            </div>
            <div className="overlay"></div>
        </div>
        {teamEvents.map(e => <EventComponent key={e.team} event={e} initEvent={initEvent} resetEvent={resetEvent}/>)}
    </main>
}