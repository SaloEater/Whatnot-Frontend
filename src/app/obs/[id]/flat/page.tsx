'use client'

import './page.css'
import {useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Event, GetEventsByBreakResponse, WNStream} from "@/app/entity/entities";
import {useChannel} from "@/app/hooks/useChannel";
import {useActiveStream} from "@/app/hooks/useActiveStream";
import {IsTeam} from "@/app/common/teams";
import {FlatEventComponent} from "./flatEventComponent";

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId, 30000)
    const stream = useActiveStream(channel)
    const [events, setEvents] = useState<Event[]>([])

    useEffect(() => {
        refreshEvents(stream)
        const id = setInterval(() => refreshEvents(stream), 5000)
        return () => clearInterval(id)
    }, [stream])

    function refreshEvents(stream: WNStream | null) {
        if (!stream?.active_break_id) return
        post(getEndpoints().break_events, {break_id: stream.active_break_id})
            .then((data: GetEventsByBreakResponse) => {
                setEvents(
                    data.events
                        .filter(e => !e.is_giveaway && !e.note)
                        .sort((a, b) => {
                            const aIsTeam = IsTeam(a.team)
                            const bIsTeam = IsTeam(b.team)
                            if (aIsTeam && !bIsTeam) return -1
                            if (!aIsTeam && bIsTeam) return 1
                            if (a.team > b.team) return 1
                            if (a.team < b.team) return -1
                            return 0
                        })
                )
            })
    }

    return (
        <div className="flat-grid">
            {events.map(e => <FlatEventComponent key={e.id} event={e} />)}
        </div>
    )
}
