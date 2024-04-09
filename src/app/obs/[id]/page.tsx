'use client'

import './page.css'
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetEventsByBreakResponse, Event} from "@/app/entity/entities";
import {filterOnlyTeams} from "@/app/common/event_filter";
import EventComponent from "@/app/obs/[id]/eventComponent";

export default function Page({params}: {params: {id: string}}) {
    const [teamCards, setTeamsCards] = useState<Event[]>([])
    let breakId = parseInt(params.id)

    function refreshEvents() {
        let body = {
            break_id: breakId
        }
        post(getEndpoints().events_get_by_break, body)
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

    return <main className='teams-container grid-container'>
        <div className="grid-middle-item logo"/>
        {teamCards.map(e => <EventComponent key={e.team} _event={e}/>)}
    </main>
}