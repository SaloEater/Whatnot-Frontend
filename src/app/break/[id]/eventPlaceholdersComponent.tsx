import {FC, useEffect, useState} from "react";
import EventPlaceholderComponent from "@/app/break/[id]/eventPlaceholderComponent";
import {Event, EventData, GiveawayTypeNone} from "@/app/entity/entities";

interface EventPlaceholdersProps {
    realEventPlaceholder: Event,
    updateRealEventPlaceholder: (event: Event) => void,
    resetRealEventPlaceholder: () => void,
    events: Event[],
    updateEvent: (id: number, e: Event) => void,
}

export const EventPlaceholdersComponent: FC<EventPlaceholdersProps> = (props) => {
    const events = props.events
    const [selectedEvent, setSelectedEvent] = useState<Event|null>(null)
    let emptyEvent: Event = {
        break_id: 0, customer: "", id: 0, index: 0, is_giveaway: false, note: "", price: 0, quantity: 0, team: "", giveaway_type: GiveawayTypeNone,
    }
    const [wasUnchecked, setWasUnchecked ] = useState(false)

    useEffect(() => {
        if (wasUnchecked) {
            setWasUnchecked(false)
            setSelectedEvent(null)
        } else {
            updateSelectedEventPlaceholder(props.realEventPlaceholder)
            if (props.realEventPlaceholder.customer == '') {
                setSelectedEvent(null)
            }
        }
    }, [props.realEventPlaceholder]);

    function updateSelectedEventPlaceholder(event: Event) {
        if (!selectedEvent) {
            return
        }
        let id = selectedEvent.id
        props.updateEvent(id, event)
    }

    function updateEventPlaceholder(event: Event) {
        props.updateEvent(event.id, event)
    }

    function resetEventPlaceholder(event: Event) {
        props.updateEvent(event.id, {...emptyEvent})
    }

    function deselectEventPlaceholder() {
        setWasUnchecked(true)
        props.resetRealEventPlaceholder()
    }

    function selectEventPlaceholder(event: Event) {
        setSelectedEvent({...event})
        props.updateRealEventPlaceholder({...event})
    }

    return <div>
        {
            events.map((e, j) => <EventPlaceholderComponent key={e.id} params={
                {
                    event: e,
                    updateEventPlaceholder: updateEventPlaceholder,
                    resetEventPlaceholder: resetEventPlaceholder,
                    selectEventPlaceholder: selectEventPlaceholder,
                    deselectEventPlaceholder: deselectEventPlaceholder,
                    isSelected: e.id == (selectedEvent?.id ?? -1),
                    isAuto: j == events.length - 1,
                    inputDisabled: false
                }
            }/>)
        }
    </div>
}