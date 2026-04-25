'use client'

import React, {useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {
    Event,
    GetStreamUsernamesResponse,
    GiveawayTypeNone,
    GiveawayTypeSlab,
    NoCustomer,
    WNBreak
} from "@/app/entity/entities";
import {EventComponent} from "@/app/break/[id]/eventComponent";
import GiveawayComponent from "@/app/break/[id]/giveawayComponent";
import {TextInput} from "@/app/common/textInput";
import './breakComponent.css'
import ToolsComponent from "@/app/break/[id]/toolsComponent";
import {
    sortByIndexAscTeamAsc,
    sortByIndexDescTeamAsc,
    sortByTeamAscIndexDesc,
    sortByTeamName
} from "@/app/common/event_filter";
import {ToolsTabComponent} from "@/app/break/[id]/toolsTabComponent";
import {arrayUnique, sortStringsAlphabetically} from "@/app/common/helpers";
import {EventPlaceholdersTabsComponent} from "@/app/break/[id]/eventPlaceholdersTabsComponent";
import {AddNewCardComponent} from "@/app/break/[id]/addNewCardComponent";

interface WNBreakOverview {
    data: {
        getBreak: {
            id: string
            spots: {title: string; buyer: {username: string} | null}[]
        }
    }
}

let pendingBreakOverview: WNBreakOverview | null = null

const SortIndexAsc = 0
const SortIndexDesc = 1
const SortTeamFirst = 2

interface BreakComponentProps {
    breakObject: WNBreak
    updateHighBidFloor: (value: number) => void
    onPendingChange?: (hasPending: boolean) => void
}

export const BreakComponent: React.FC<BreakComponentProps> = (params) => {
    const [events, setEvents] = useState<Event[]>([])
    const [giveaways, setGiveaways] = useState<Event[]>([])
    const [newGiveawayCustomer, setNewGiveawayCustomer] = useState("")
    const eventsRef = useRef(events)
    const currentWNBreakIdRef = useRef<string | null>(null)
    const applyOverviewRef = useRef<(o: WNBreakOverview) => void>(() => {})
    const [toDemo, setToDemo] = useState(false)
    let emptyEvent: Event = {
        break_id: 0, customer: "", id: 0, index: 0, is_giveaway: false, note: "", price: 0, quantity: 0, team: "", giveaway_type: GiveawayTypeNone,
    }
    const [eventPlaceholder, setEventPlaceholder] = useState<Event>({...emptyEvent})
    const [sortDir, setSortDir] = useState<number|null>(SortTeamFirst)
    const [usernames, setUsernames] = useState<string[]>([])
    const [newEvent, setNewEvent] = useState<Event|null>(null)
    const [autoFill, setAutoFill] = useState(false)

    function getUsernames() {
        let body = {
            id: params.breakObject.day_id
        }
        post(getEndpoints().stream_usernames, body)
            .then((i: GetStreamUsernamesResponse) => {
                setUsernames(sortStringsAlphabetically(arrayUnique(i.usernames.filter(j => j != '').map(i => i.trim()))))
            })
    }

    useEffect(() => {
        refreshEvents()
        getUsernames()
        setInterval(() => {
            refreshEvents()
        }, 5000)
    }, [])

    useEffect(() => {
        if (newEvent && !isPlaceholderEmpty()) {
            newEvent.customer = eventPlaceholder.customer
            newEvent.price = eventPlaceholder.price
            console.log(`set ${newEvent.team}`)
            setNewEvent(null)
            updateEvent(newEvent)
            resetEventPlaceholder()
        }
    }, [newEvent, eventPlaceholder]);

    useEffect(() => {
        eventsRef.current = events
    }, [events]);

    applyOverviewRef.current = (overview: WNBreakOverview) => {
        const spots = overview.data.getBreak.spots
        for (const event of eventsRef.current) {
            if (event.is_giveaway) continue
            const spot = spots.find(s => s.title === event.team)
            const newCustomer = spot?.buyer?.username ?? ''
            if (event.customer !== newCustomer) {
                updateEvent({...event, customer: newCustomer})
            }
        }
    }

    useEffect(() => {
        if (pendingBreakOverview) {
            currentWNBreakIdRef.current = pendingBreakOverview.data.getBreak.id
            applyOverviewRef.current(pendingBreakOverview)
            pendingBreakOverview = null
        }

        function handleBreakOverview(e: CustomEvent) {
            const overview = e.detail as WNBreakOverview
            const incomingId = overview.data.getBreak.id
            if (currentWNBreakIdRef.current === null || currentWNBreakIdRef.current === incomingId) {
                currentWNBreakIdRef.current = incomingId
                applyOverviewRef.current(overview)
            } else {
                pendingBreakOverview = overview
                params.onPendingChange?.(true)
            }
        }

        window.addEventListener('break_overview_event', handleBreakOverview as EventListener)
        return () => window.removeEventListener('break_overview_event', handleBreakOverview as EventListener)
    }, [])

    function refreshEvents() {
        let eventsBody = {
            break_id: params.breakObject.id
        };
        post(getEndpoints().break_events, eventsBody)
            .then((breakEvents: {events: Event[]}) => {
                const updatedEvents = [...breakEvents.events];
                const teamEvents = updatedEvents.filter(e => !e.is_giveaway)
                const giveawayEvents = updatedEvents.filter(e => e.is_giveaway)
                giveawayEvents.sort((a, b) => {
                    if (a.index > b.index) return 1
                    if (a.index < b.index) return -1
                    return 0
                })

                let currentEvents = eventsRef.current
                if (currentEvents.length > 0){
                    let newEvents = teamEvents.filter(i => {
                        let event = currentEvents.find(j => j.id == i.id)
                        return (event?.customer ?? NoCustomer) != i.customer
                    })
                    let newEvent = newEvents.length > 0 ? newEvents[0] : null
                    if (newEvent && newEvent.customer != '') {
                        setNewEvent({...newEvent})
                    } else {
                        setNewEvent(null)
                    }

                }
                setEvents(teamEvents)
                setGiveaways(giveawayEvents)
                setUsernames((old) => {
                    let newU = [...old]
                    teamEvents.filter(i => i.customer != '' && i.customer != NoCustomer).forEach(i => {
                        if (newU.indexOf(i.customer) === -1) {
                            newU.push(i.customer)
                        }
                    })
                    return newU
                })
            })
    }

    function setEvent(event: Event) {
        setEvents((old) => {
            let newEvents = [...old]
            let index = newEvents.findIndex(e => e.id == event.id)
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

    function updateEvent(event: Event) {
        let oldEvent = events.find(e => e.id == event.id)
        if (!oldEvent || (
            event.customer == oldEvent.customer &&
            event.price == oldEvent.price &&
            event.team == oldEvent.team &&
            event.break_id == oldEvent.break_id &&
            event.is_giveaway == oldEvent.is_giveaway &&
            event.quantity == oldEvent.quantity &&
            event.note == oldEvent.note
        )) {
            return
        }
        post(getEndpoints().event_update, event)
            .then(response => {
                if (response.success) {
                    let moveBody = {
                        id: event.id,
                        new_index: getNextIndex(event)
                    }

                    let oldEvent = events.find(e => e.id == event.id)
                    if (!oldEvent) {
                        return
                    }

                    setEvent(event)

                    if (oldEvent.customer != '') {
                        return
                    }
                    post(getEndpoints().event_move, moveBody)
                        .then(_ => {
                            event.index = moveBody.new_index
                            setEvent(event)
                        })
                }

            })
    }

    function resetEvent(event: Event) {
        let updateEventBody = {...event}
        updateEventBody.customer = ''
        updateEventBody.price = 0
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

    function saveNewGiveawayCustomer(forceValue: string = '', type: number = GiveawayTypeNone) {
        let value = forceValue == '' ? newGiveawayCustomer : forceValue
        if (value == '') {
            return
        }
        let event: Event = {
            id: 0,
            index: -1,
            break_id: params.breakObject.id,
            customer: value,
            price: 0,
            team: '',
            is_giveaway: true,
            note: '',
            quantity: 1,
            giveaway_type: type,
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
        let reset = {...newE}
        reset.customer = ''
        reset.price = 0
        setEventPlaceholder(reset)
        return newE
    }

    function isPlaceholderEmpty() {
        return eventPlaceholder.customer == ''
    }

    function swapTeams(a: Event[], b: Event[]) {
        let aCustomer = a[0].customer
        let bCustomer = b[0].customer
        let aUpdated = a.map(e => {
            let newE = {...e}
            newE.customer = bCustomer
            return newE
        })
        let bUpdated = b.map(e => {
            let newE = {...e}
            newE.customer = aCustomer
            return newE
        })


        let body = {
            events: [...aUpdated, ...bUpdated]
        }
        post(getEndpoints().event_update_all, body).then(() => {
            refreshEvents()
        })
    }

    let eventsSorted = [...events]

    if (sortDir == SortIndexAsc) {
        eventsSorted = sortByIndexAscTeamAsc(eventsSorted)
    } else if (sortDir == SortIndexDesc) {
        eventsSorted = sortByIndexDescTeamAsc(eventsSorted)
    } else if (sortDir == SortTeamFirst) {
        eventsSorted = sortByTeamAscIndexDesc(eventsSorted)
    } else {
        eventsSorted = sortByTeamName(eventsSorted)
    }

    function getNextSortDirName() {
        switch (sortDir) {
            case null:
                return 'Sort by Index Asc'
            case SortIndexAsc:
                return 'Sort by Index Desc'
            case SortIndexDesc:
                return 'Sort by Team First'
            case SortTeamFirst:
                return 'Sort by Team Alphabetical'
        }
    }

    function setNextSortDir() {
        let nextDir = null
        switch (sortDir) {
            case null:
                nextDir = SortIndexAsc
                break;
            case SortIndexAsc:
                nextDir = SortIndexDesc
                break;
            case SortIndexDesc:
                nextDir = SortTeamFirst
                break;
            case SortTeamFirst:
                nextDir = null
                break;
        }
        setSortDir(nextDir)
    }

    function addUsername(username: string) {
        setUsernames((old) => {
            if (old.indexOf(username) !== -1) {
                return old
            }
            let newU = [...old]
            newU.push(username)
            sortStringsAlphabetically(newU)
            return newU
        })
    }

    function autoFillTeamEvent(teamName: string, customer: string, price: number) {
        const event = events.find(e => e.team === teamName)
        if (!event) return
        updateEvent({...event, customer, price})
    }

    function addNewCard(newEvent: Event) {
        newEvent.index = getNextIndex(newEvent)
        newEvent.break_id = params.breakObject.id
        post(getEndpoints().event_add, newEvent)
            .then(response => {
                newEvent.id = response.id
                setEvents((old) => {
                    let newEvents = [...old]
                    newEvents.push(newEvent)
                    return newEvents
                })
            })
    }

    return <div className='d-flex m-2 justify-content-evenly'>
            <div className='w-75p'>
                <div className='d-flex align-items-baseline justify-content-between'>
                    <div className='fs-1'>Teams:</div>
                    <div onClick={setNextSortDir} className='text-primary cursor-pointer'>
                        {getNextSortDirName()}
                    </div>
                </div>
                <div className="d-flex flex-wrap gap-4 events-container justify-content-center">
                    {eventsSorted.map(
                        (eventObject, index, arr) => {
                            return <EventComponent key={eventObject.id}
                                event={{...eventObject}}
                                events={arr}
                                updateEvent={updateEvent}
                                resetEvent={resetEvent}
                                getEventPlaceholder={getEventPlaceholder}
                                moveEvent={moveEvent}
                                isPlaceholderEmpty={isPlaceholderEmpty}
                                usernames={usernames}
                                addUsername={addUsername}
                                isHighBid={eventObject.team == params.breakObject.high_bid_team}
                            />
                        }
                    )}
                    {
                        <AddNewCardComponent addNewCard={addNewCard}/>
                    }
                </div>
            </div>
            <div className='w-15p justify-content-center'>
                <div className="form-check mb-1">
                    <input
                        className="form-check-input"
                        type="checkbox"
                        id="autoFillCheck"
                        checked={autoFill}
                        onChange={e => setAutoFill(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="autoFillCheck">Auto-fill</label>
                </div>
                <EventPlaceholdersTabsComponent
                    realEventPlaceholder={{...eventPlaceholder}}
                    updateRealEventPlaceholder={updateEventPlaceholder}
                    resetRealEventPlaceholder={resetEventPlaceholder}
                    length={4}
                    saveNewGiveawayCustomer={saveNewGiveawayCustomer}
                    autoFill={autoFill}
                    onAutoFill={autoFillTeamEvent}
                />
                <div className='border border-primary rounded rounded-3 border-1 d-flex flex-column align-items-center'>
                    <div>Giveaways:</div>
                    <div>
                        <div className='w-75p m-2' id='giveaway'>
                            <TextInput
                                value={newGiveawayCustomer}
                                update={updateNewGiveawayCustomer}
                                save={(value: string|null) => saveNewGiveawayCustomer(value ?? '')}
                                placeholder={'Enter nickname'}
                                font_size={null}
                                onClick={null}
                                onBlur={null}
                                disabled={false}
                            />
                        </div>
                        <div>
                            Slab: <span>{giveaways.reduce((acc, i) => i.giveaway_type == GiveawayTypeSlab ? acc + 1 : acc, 0)}</span>
                        </div>
                        <div>
                            Pack: <span>{giveaways.reduce((acc, i) => i.giveaway_type != GiveawayTypeSlab ? acc + 1 : acc, 0)}</span>
                        </div>
                        <ul className="list-group gap-1">
                            {
                                giveaways.toReversed().map((giveaway, index) => {
                                    return <GiveawayComponent key={giveaway.id} params={{
                                        event: giveaway,
                                        updateEvent: updateGiveaway,
                                        resetEvent: deleteGiveaway,
                                    }}/>
                                })
                            }
                        </ul>
                    </div>
                </div>
                <ToolsComponent params={{events: events, swapTeams: swapTeams}}/>
            </div>
            <div className='w-15p'>
                <ToolsTabComponent events={events} changeIndex={moveEvent} streamId={params.breakObject.day_id} breakO={params.breakObject} highBidTeam={params.breakObject.high_bid_team} giveawayTeam={params.breakObject.giveaway_team} updateHighBidFloor={params.updateHighBidFloor}/>
            </div>
    </div>
}