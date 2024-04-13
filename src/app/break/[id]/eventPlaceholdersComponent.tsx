import {useEffect, useState} from "react";
import EventPlaceholderComponent from "@/app/break/[id]/eventPlaceholderComponent";
import {Event} from "@/app/entity/entities";
import {event} from "next/dist/build/output/log";

export default function EventPlaceholdersComponent({params}: {params: {
    realEventPlaceholder: Event,
    updateRealEventPlaceholder: (event: Event) => void,
    resetRealEventPlaceholder: () => void,
    length: number,
}}) {
    const [events, setEvents] = useState<Event[]>([])
    const [selectedEvent, setSelectedEvent] = useState<Event|null>(null)
    let emptyEvent: Event = {
        break_id: 0, customer: "", id: 0, index: 0, is_giveaway: false, note: "", price: 0, quantity: 0, team: ""
    }

    useEffect(() => {
        let emptyEvents: Event[] = []
        for (let i = 0; i < params.length; i++) {
            let event: Event = {...emptyEvent}
            event.id = i
            emptyEvents[i] = event
        }
        setEvents(emptyEvents)
    }, [params.length]);

    useEffect(() => {
        updateEventPlaceholder(params.realEventPlaceholder)
    }, [params.realEventPlaceholder]);

    function updateEventPlaceholder(event: Event) {
        setEvents((old) => {
            let newE = [...old]
            let index = newE.findIndex(e => e.id == event.id)
            newE[index].customer = event.customer
            newE[index].price = event.price
            return newE
        })
    }

    function resetEventPlaceholder(event: Event) {
        setEvents((old) => {
            let newE = [...old]
            let index = newE.findIndex(e => e.id == event.id)
            newE[index] = {...emptyEvent}
            newE[index].id = event.id
            return newE
        })
    }

    function deselectEventPlaceholder() {
        setSelectedEvent(null)
        params.resetRealEventPlaceholder()
    }

    function selectEventPlaceholder(event: Event) {
        setSelectedEvent({...event})
        params.updateRealEventPlaceholder({...event})
    }

    return <div>
        {
            events.map(e => <EventPlaceholderComponent key={e.id} params={
                {
                    event: e,
                    updateEventPlaceholder: updateEventPlaceholder,
                    resetEventPlaceholder: resetEventPlaceholder,
                    selectEventPlaceholder: selectEventPlaceholder,
                    deselectEventPlaceholder: deselectEventPlaceholder,
                    isSelected: e.id == (selectedEvent?.id ?? -1)
                }
            }/>)
        }
    </div>
}