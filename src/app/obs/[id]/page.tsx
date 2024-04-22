'use client'

import './page.css'
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event, NoCustomer} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";
import {EventComponent} from "@/app/obs/[id]/eventComponent";
import HighBidComponent from "@/app/obs/[id]/highBidComponent";

export default function Page({params}: {params: {id: string}}) {
    const [teamEvents, setTeamsCards] = useState<Event[]>([])
    let breakId = parseInt(params.id)

    function refreshEvents() {
        let body = {
            break_id: breakId
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

    return <main className='teams-container grid-container overflow-hidden'>
        <div className="position-relative grid-middle-item logo">
            <HighBidComponent _events={teamEvents}/>
        </div>
        {teamEvents.map(e => <EventComponent key={e.team} event={e} initEvent={initEvent} resetEvent={resetEvent}/>)}
    </main>
}