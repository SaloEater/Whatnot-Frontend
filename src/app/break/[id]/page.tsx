'use client'

import {createRef, Dispatch, SetStateAction, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment, {max} from "moment";
import {Day, Break, Event, SelectedBreak} from "@/app/entity/entities";
import EventComponent from "@/app/break/[id]/eventComponent";
import {useRouter} from "next/navigation";
import GiveawayComponent from "@/app/break/[id]/giveawayComponent";
import TextInput from "@/app/common/textInput";
import EventPlaceholderComponent from "@/app/break/[id]/eventPlaceholderComponent";
import './page.css'
import TeamsListComponent from "@/app/break/[id]/teamsListComponent";

export default function Page({params} : {params: {id: string}}) {
    const breakId = parseInt(params.id)
    const [breakObject, setBreakObject] = useState<Break|null>(null);
    const [newName, setNewName] = useState("")
    const [events, setEvents] = useState<Event[]>([])
    const [giveaways, setGiveaways] = useState<Event[]>([])
    const [newGiveawayCustomer, setNewGiveawayCustomer] = useState("")
    const [toDemo, setToDemo] = useState(false)
    let emptyEvent: Event = {
        break_id: 0, customer: "", id: 0, index: 0, is_giveaway: false, note: "", price: 0, quantity: 0, team: ""
    }
    const [eventPlaceholder, setEventPlaceholder] = useState<Event>({...emptyEvent})

    useEffect(() => {
        const body = {
            id: breakId
        }
        post(getEndpoints().break_get, body)
            .then((breakData: Break) => {
                setBreakObject(breakData)
                setNewName(breakData.name)
                refreshEvents()
            })
    }, [])

    useEffect(() => {

    }, [toDemo]);

    function refreshEvents() {
        let eventsBody = {
            break_id: breakId
        };
        post(getEndpoints().events_get_by_break, eventsBody)
            .then((events: {events: Event[]}) => {
                const updatedEvents = [...events.events];
                updatedEvents.sort((a, b) => {
                    if (a.team > b.team) return 1
                    if (a.team < b.team) return -1
                    return 0
                })
                console.log('refreshed and set events', updatedEvents)
                setEvents(updatedEvents.filter(e => !e.is_giveaway))
                setGiveaways(updatedEvents.filter(e => e.is_giveaway))
            })
    }

    const dateTimeFormat = "YYYY-MM-dd hh:mm a"

    function setNewBreakObject(newBreak: Break) {
        let body = {
            id: newBreak.id,
            name: newBreak.name,
            start_date: newBreak.start_date,
            end_date: newBreak.end_date,
        }
        post(getEndpoints().break_update, body)
            .then(response => {
                if (response.success) {
                    setBreakObject(newBreak)
                }
            })
    }

    function setBreakStartDate(startDateUnix: string) {
        if (!breakObject) {
            return
        }

        let newBreak = {...breakObject}
        newBreak.start_date = startDateUnix

        setNewBreakObject(newBreak)
    }

    function setBreakEndDate(endDateUnix: string) {
        if (!breakObject) {
            return
        }

        let newBreak = {...breakObject}
        newBreak.end_date = endDateUnix

        setNewBreakObject(newBreak)
    }

    function changeNewName(e: React.ChangeEvent<HTMLInputElement>) {
        setNewName(e.target.value)
    }

    function updateNewName() {
        if (!breakObject) {
            return
        }

        let newBreak = {...breakObject}
        newBreak.name = newName

        setNewBreakObject(newBreak)
    }

    function setEvent(event: Event, index: number) {
        setEvents((old) => {
            let newEvents = [...old]
            newEvents[index] = event
            return newEvents
        })
    }

    function getNextIndex(event: Event) {
        let maxTakenIndex = 0
        for (let event of events) {
            if (event.customer && event.index > maxTakenIndex) {
                maxTakenIndex = event.index
            }
        }
        return maxTakenIndex + 1
    }

    function updateEvent(event: Event, index: number) {
        let updateEventBody = {...event}
        post(getEndpoints().event_update, updateEventBody)
            .then(response => {
                if (response.success) {
                    let moveBody = {
                        id: event.id,
                        new_index: getNextIndex(event)
                    }

                    let oldEvent = events[index]
                    setEvent(event, index)

                    if (oldEvent.customer != '') {
                        return
                    }
                    post(getEndpoints().event_move, moveBody)
                        .then(_ => {
                            event.index = moveBody.new_index
                            setEvent(event, index)
                        })
                }

            })
    }

    function resetEvent(event: Event, index: number) {
        let updateEventBody = {...event}
        updateEventBody.customer = ''
        post(getEndpoints().event_update, updateEventBody)
            .then(response => {
                if (response.success) {
                    let moveBody = {
                        id: event.id,
                        new_index: 33,
                    }

                    post(getEndpoints().event_move, moveBody)
                        .then(_ => {
                            refreshEvents()
                        })
                }
            })
    }

    let router = useRouter()

    function redirectToDemo() {
        router.push(`/demo/${breakId}`)
    }

    function redirectToOBS() {
        router.push(`/obs/${breakId}`)
    }

    function updateGiveaway(event: Event) {
        let updateEventBody = {...event}
        post(getEndpoints().event_update, updateEventBody)
            .then(response => {
                if (response.success) {
                    let moveBody = {
                        id: event.id,
                        new_index: getNextIndex(event)
                    }
                    setGiveaways((old) => {
                        let newGiveaway = [...old]
                        let changeEvent = newGiveaway.filter(e => e.id == event.id)
                        if (changeEvent.length > 0) {
                            changeEvent[0].customer = event.customer
                        }
                        return newGiveaway
                    })
                }

            })
    }

    function deleteGiveaway(event: Event) {
        let updateEventBody = {id: event.id}
        post(getEndpoints().event_delete, updateEventBody)
            .then(response => {
                if (response.success) {
                    setGiveaways((old) => {
                        return [...old].filter(e => e.id != event.id)
                    })
                }
            })
    }

    function updateNewGiveawayCustomer(value: string) {
        setNewGiveawayCustomer(value)
    }

    function saveNewGiveawayCustomer() {
        if (newGiveawayCustomer == '') {
            return
        }
        let event: Event = {
            id: 0,
            index: -1,
            break_id: breakId,
            customer: newGiveawayCustomer,
            price: 0,
            team: '',
            is_giveaway: true,
            note: '',
            quantity: 1,
        }
        post(getEndpoints().event_add, event)
            .then(response => {
                event.id = response.id
                setGiveaways((old) => {
                    let newE = [...old]
                    newE.push(event)
                    return newE
                })
                setNewGiveawayCustomer('')
            })
    }

    function updateEventPlaceholder(newEvent: Event) {
        setEventPlaceholder((old) => {
            let newE = {...old}
            newE.price = newEvent.price
            newE.customer = newEvent.customer
            return newE
        })
    }

    function resetEventPlaceholder() {
        setEventPlaceholder({...emptyEvent})
    }

    function moveEvent(event: Event, newIndex: number) {
        let body = {
            id: event.id,
            new_index: newIndex,
        }
        post(getEndpoints().event_move, body)
            .then(response => {
                if (response.success) {
                    refreshEvents()
                }
            })
    }

    function getEventPlaceholder() {
        let newE = {...eventPlaceholder}
        let reset = {...emptyEvent}
        console.log(reset)
        setEventPlaceholder(reset)
        return newE
    }

    function isPlaceholderEmpty() {
        return eventPlaceholder.customer == ''
    }

    function swapCustomerAndPrice(a: Event, b: Event) {
        let oldTeamACustomer = a.customer
        let oldTeamAPrice = a.price
        a.customer = b.customer
        a.price = b.price
        b.customer = oldTeamACustomer
        b.price = oldTeamAPrice
        let updateA = post(getEndpoints().event_update, {...a})
        let updateB = post(getEndpoints().event_update, {...b})
        Promise.all([updateA, updateB]).then(() => {
            console.log('refreshing')
            refreshEvents()
        })
    }

    return (
        <div>
            {
                breakObject && <div>
                    <div className="d-flex align-items-center">
                        <div>
                            <div>
                                Name
                            </div>
                            <input type="text" value={newName} onChange={e => changeNewName(e)} onKeyUp={e => {
                                if (e.key === 'Enter') {
                                    updateNewName()
                                }
                            }} onBlur={updateNewName}/>
                        </div>
                        <div>
                            Start Date
                            <TuiDateTimePicker
                                handleChange={async e => {
                                    let date = moment(e, dateTimeFormat.toUpperCase()).utc(false)
                                    const startDateUnix = date.toISOString()
                                    setBreakStartDate(startDateUnix)
                                }}
                                format={dateTimeFormat}
                                date={new Date(breakObject.start_date)}
                                inputWidth="auto"
                            />
                        </div>
                        <div>
                            End Date
                            <TuiDateTimePicker
                                handleChange={async e => {
                                    let date = moment(e, dateTimeFormat.toUpperCase()).utc(false)
                                    const endDateUnix = date.toISOString()
                                    setBreakEndDate(endDateUnix)
                                }}
                                format={dateTimeFormat}
                                date={new Date(breakObject.end_date)}
                                inputWidth="auto"
                            />
                        </div>
                        <div>
                            <button type='button' className='btn btn-primary' onClick={redirectToDemo}>Demo</button>
                            <button type='button' className='btn btn-primary' onClick={redirectToOBS}>OBS</button>
                        </div>
                    </div>
                </div>
            }
            <div className='w-95 d-flex m-2 justify-content-evenly'>
                {
                    breakObject && <div className='w-75'>
                        <div className='fs-1'>
                            Teams:
                        </div>
                        <div className="d-flex flex-wrap gap-4 events-container justify-content-center">
                            {events.map(
                                (eventObject, index, arr) => {
                                    let params = {
                                        event: eventObject,
                                        events: arr,
                                        updateEvent: updateEvent,
                                        index: index,
                                        resetEvent: resetEvent,
                                        getEventPlaceholder: getEventPlaceholder,
                                        moveEvent: moveEvent,
                                        isPlaceholderEmpty: isPlaceholderEmpty,
                                        swapCustomerAndPrice: swapCustomerAndPrice,
                                    }
                                    return <EventComponent key={eventObject.id} params={params}/>
                                }
                            )}
                        </div>
                    </div>
                }
                <div className='w-15 justify-content-center'>
                    <div className='border border-primary rounded rounded-3 border-1 d-flex flex-column align-items-center'>
                        <div>Giveaways:</div>
                        <div>
                            <ul className="list-group gap-1">
                                {
                                    giveaways.map((giveaway, index) => {
                                        return <GiveawayComponent key={giveaway.id} params={{
                                            event: giveaway,
                                            updateEvent: updateGiveaway,
                                            resetEvent: deleteGiveaway,
                                        }}/>
                                    })
                                }
                            </ul>
                            <div className='w-75 m-2'>
                                <TextInput params={{
                                    value: newGiveawayCustomer,
                                    update: updateNewGiveawayCustomer,
                                    save: saveNewGiveawayCustomer,
                                    placeholder: 'Enter nickname',
                                    font_size: null,
                                    max_width: 175,
                                }}/>
                            </div>
                        </div>
                    </div>
                    <EventPlaceholderComponent params={{
                        event: eventPlaceholder,
                        updateEventPlaceholder: updateEventPlaceholder,
                        resetEventPlaceholder: resetEventPlaceholder,
                    }}/>
                </div>
                <div className='w-10'>
                    <TeamsListComponent params={{events: events}} />
                </div>
            </div>
        </div>
    )
}