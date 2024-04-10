'use client'

import {createRef, Dispatch, SetStateAction, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment, {max} from "moment";
import {Day, Break, Event, SelectedBreak} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import './page.css'
import EventComponent from "@/app/demo/[id]/eventComponent";
import Image from "next/image";
import {getEventWithHighestPrice} from "@/app/common/event_filter";

export default function Page({params} : {params: {id: string}}) {
    const breakId = parseInt(params.id)
    const [events, setEvents] = useState<Event[]>([])
    const [giveaways, setGiveaways] = useState<Event[]>([])
    const [highestBidEvent, setHighestBidEvent] = useState<Event|null>(null)

    useEffect(() => {
        refreshEvents()
        setTimeout(() => {
            refreshEvents()
        }, 10000)
    }, []);

    function refreshEvents() {
        let eventsBody = {
            break_id: breakId
        };

        post(getEndpoints().events_get_by_break, eventsBody)
            .then((events: {events: Event[]}) => {
                events.events.sort((a, b) => {
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
    if (events.length > 0) {
        let rowsAmount = 16
        let colsAmount = 2
        for (let i = 0; i < rowsAmount; i++) {
            for (let j = 0; j < colsAmount; j++) {
                let index = i * colsAmount + j
                let eventObject = events[index]
                let eventParams = {
                    event: eventObject
                }
                let colKey = `col-${i}-${j}`
                items.push(<EventComponent key={colKey} params={eventParams}/>)
            }
        }
    }

    function launchFullScreen() {
        var elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        }
    }

    return (
        <div className='p-1 main'>
            <Image className='position-absolute top-0 start-0' src='/images/full_screen.png' alt={'fullscreen'} onClick={launchFullScreen} width='50' height='50'/>
            <div className='max-height overflow-hidden d-flex justify-content-center my-flex gap-2'>
                <div className='items-container'>
                    {items.length > 0 && items}
                </div>
                <div className='d-flex flex-column align-items-center justify-content-center gap-2'>
                    {
                        giveaways.length > 0 && <div className='dimmed-overlay p-2 d-flex flex-column align-items-center'>
                            <div className='fs-2'>
                                Giveaway Winners:
                            </div>
                            {
                                giveaways.map((e, j) => <div className='fs-4' key={e.id}>{e.customer}</div>)
                            }
                        </div>
                    }
                    {
                        highestBidEvent && <div className='dimmed-overlay p-2 d-flex flex-column align-items-center max-width'>
                            <div className='fs-2'>Highest bid:</div>
                            <div className='fs-3'>{highestBidEvent.customer}</div>
                            <div className='fs-3'>{highestBidEvent.price}$</div>
                        </div>
                    }
                </div>
            </div>
        </div>
    )
}