'use client'

import {createRef, Dispatch, SetStateAction, useCallback, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment, {max} from "moment";
import {Day, Break, Event, SelectedBreak, Demo} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import './page.css'
import EventComponent from "@/app/demo/[id]/eventComponent";
import Image from "next/image";
import {getEventWithHighestPrice} from "@/app/common/event_filter";

export default function Page({params} : {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const [demo, setDemo] = useState<Demo|null>(null)
    const [events, setEvents] = useState<Event[]>([])
    const [giveaways, setGiveaways] = useState<Event[]>([])
    const [highestBidEvent, setHighestBidEvent] = useState<Event|null>(null)

    const refreshDemo = useCallback(() => {
        let eventsBody = {
            stream_id: streamId
        };

        post(getEndpoints().stream_demo, eventsBody)
            .then((response: Demo) => {
                setDemo(response)
            })
    }, [params.id])

    useEffect(() => {
        refreshEvents()
    }, [demo]);

    useEffect(() => {
        refreshDemo()

        setInterval(() => {
            refreshEvents()
        }, 5000)
        setInterval(() => {
            refreshDemo()
        }, 1500)
    }, []);

    function refreshEvents() {
        if (!demo) {
            return
        }

        let eventsBody = {
            break_id: demo.break_id
        };

        post(getEndpoints().break_events, eventsBody)
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
    if (events.length > 0 && demo) {
        let rowsAmount = 16
        for (let i = 0; i < rowsAmount; i++) {
            let index = i
            let eventObject = events[index]
            let eventParams = {
                event: eventObject,
                highlight_username: demo.highlight_username
            }
            let colKey = `col-${index}`
            items.push(<EventComponent key={colKey} params={eventParams}/>)

            index = i + rowsAmount
            eventObject = events[index]
            eventParams = {
                event: eventObject,
                highlight_username: demo.highlight_username
            }
            colKey = `col-${i}-${index}`
            items.push(<EventComponent key={colKey} params={eventParams}/>)
        }
    }

    function launchFullScreen() {
        var elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        }
    }

    return (
        <div className='main'>
            <div className='w-100 h-100 dimmed-bg p-1'>
                <Image className='position-absolute top-0 start-0 bg-img' src='/images/full_screen.png' alt={'fullscreen'} onClick={launchFullScreen} width='50' height='50'/>
                <div className='max-height overflow-hidden d-flex justify-content-center my-flex gap-2 teams-container'>
                    <div className='demo-container white-overlay'>
                        {items.length > 0 && items}
                    </div>
                    <div className='d-flex flex-column align-items-center justify-content-center gap-2'>
                        {
                            giveaways.length > 0 && <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center'>
                                <div className='fs-2 text-black'>
                                    Giveaway Winners:
                                </div>
                                {
                                    giveaways.map((e, j) => <div className={`fs-4 text-black giveaway-winner`} key={e.id}>{e.customer}</div>)
                                }
                            </div>
                        }
                        {
                            highestBidEvent && <div className='white-overlay round-overlay p-2 d-flex flex-column align-items-center max-width'>
                                <div className='fs-2 text-black'>Highest bid:</div>
                                <div className='fs-3 text-black giveaway-winner'>{highestBidEvent.customer}</div>
                                <div className='fs-3 text-black giveaway-winner'>{highestBidEvent.price}$</div>
                            </div>
                        }
                    </div>
                </div>
            </div>
        </div>
    )
}