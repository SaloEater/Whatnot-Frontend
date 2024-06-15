import TeamsListComponent from "@/app/break/[id]/teamsListComponent";
import {Event, EventData, GiveawayTypeNone, GiveawayTypePack, GiveawayTypeSlab} from "@/app/entity/entities";
import {FC, useEffect, useState} from "react";
import DemoSettingsComponent from "@/app/break/[id]/demoSettingsComponent";
import {arrayUnique} from "@/app/common/helpers";
import {onlyWithUsernames} from "@/app/common/event_filter";
import {EventPlaceholdersComponent} from "@/app/break/[id]/eventPlaceholdersComponent";
import {WhatnotSoldEventPlaceholdersComponent} from "@/app/break/[id]/whatnotSoldEventPlaceholdersComponent";

const Tabs = [
    'Events',
    'Whatnot Events'
]
const ManualPlaceholdersIndex = 0;
const WhatnotPlaceholdersIndex = 1;

interface EventPlaceholdersTabsProps {
    saveNewGiveawayCustomer: (value: string, type: number) => void,
    realEventPlaceholder: Event,
    updateRealEventPlaceholder: (event: Event) => void,
    resetRealEventPlaceholder: () => void,
    length: number,
}

const WhatnotSoldEventName = 'new_event_event'

interface WhatnotSoldEvent {
    price: number
    customer: string
    name: string
}

export const EventPlaceholdersTabsComponent: FC<EventPlaceholdersTabsProps> = (props) => {
    const [selectedTabIndex, setSelectedTabIndex] = useState(0)
    const [newEvent, setNewEvent] = useState<WhatnotSoldEvent | null>(null)
    const [whatnotEvents, setWhatnotEvents] = useState<EventData[]>([])
    const [events, setEvents] = useState<Event[]>([])
    let emptyEvent: Event = {
        break_id: 0, customer: "", id: 0, index: 0, is_giveaway: false, note: "", price: 0, quantity: 0, team: "", giveaway_type: GiveawayTypeNone,
    }

    useEffect(() => {
        let emptyEvents: Event[] = []
        for (let i = 0; i < props.length; i++) {
            let event: Event = {...emptyEvent}
            event.id = i
            emptyEvents[i] = event
        }
        setEvents(emptyEvents)

    }, [props.length]);

    function isGiveaway(newEvent: WhatnotSoldEvent) {
        let name = newEvent.name === undefined ? '' : newEvent.name;
        return name.toLowerCase().indexOf('giveaway') !== -1;
    }

    function getGiveawayType(newEvent: WhatnotSoldEvent) {
        let name = newEvent.name === undefined ? '' : newEvent.name;
        return (name.toLowerCase().indexOf('slb') !== -1 || name.toLowerCase().indexOf('mag') !== -1) ? GiveawayTypeSlab : GiveawayTypePack ;
    }

    useEffect(() => {
        if (newEvent) {
            if (isGiveaway(newEvent)) {
                props.saveNewGiveawayCustomer(newEvent.customer, getGiveawayType(newEvent))
            } else {
                setWhatnotEvents((old) => {
                    let newE = [...old]
                    newE.push({customer: newEvent.customer, price: newEvent.price})
                    return newE
                })
            }
            setNewEvent(null)
        }
    }, [newEvent]);

    useEffect(() => {
        // @ts-ignore
        window.addEventListener(WhatnotSoldEventName, handleWhatnotSoldEvent);

        return () => {
            // @ts-ignore
            window.removeEventListener(WhatnotSoldEventName, handleWhatnotSoldEvent);
        }
    }, []);

    function handleWhatnotSoldEvent(e: CustomEvent) {
        let newEvent: WhatnotSoldEvent = e.detail.event
        setNewEvent(newEvent)
    }

    function deleteEvent(index: number) {
        setWhatnotEvents((old) => {
            let newE = [...old]
            newE.splice(index, 1)
            return newE
        })
    }

    function updateEvent(id: number, event: Event) {
        setEvents((old) => {
            let newE = [...old]
            let index = newE.findIndex(e => e.id == id)
            newE[index].customer = event.customer
            newE[index].price = event.price
            return newE
        })
    }

    return <div className='rounded rounded-3 border-primary border p-2'>
        <div className='d-flex flex-wrap gap-1 w-100p'>
            {Tabs.map((tabName, j) => <div key={j} className={`p-2 border border-dashed  ${selectedTabIndex == j ? 'bg-primary' : ''}`} onClick={_ => {
                props.resetRealEventPlaceholder()
                setSelectedTabIndex(j)
            }}>
                <strong>{tabName}</strong>
            </div>)}
        </div>
        {selectedTabIndex == ManualPlaceholdersIndex && <EventPlaceholdersComponent
            realEventPlaceholder={props.realEventPlaceholder}
            updateRealEventPlaceholder={props.updateRealEventPlaceholder}
            resetRealEventPlaceholder={props.resetRealEventPlaceholder}
            events={events}
            updateEvent={updateEvent}
        />}
        {selectedTabIndex == WhatnotPlaceholdersIndex && <WhatnotSoldEventPlaceholdersComponent
            realEventPlaceholder={props.realEventPlaceholder}
            updateRealEventPlaceholder={props.updateRealEventPlaceholder}
            resetRealEventPlaceholder={props.resetRealEventPlaceholder}
            events={whatnotEvents}
            deleteEvent={deleteEvent}
        />}
    </div>
}