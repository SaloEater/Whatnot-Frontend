import { FC, useEffect, useState } from "react";
import EventPlaceholderComponent from "@/app/break/[id]/eventPlaceholderComponent";
import { Event, EventData, GiveawayTypeNone } from "@/app/entity/entities";

interface EventPlaceholdersProps {
  realEventPlaceholder: Event;
  updateRealEventPlaceholder: (event: Event) => void;
  resetRealEventPlaceholder: () => void;
  events: EventData[];
  deleteEvent: (index: number) => void;
}

export const WhatnotSoldEventPlaceholdersComponent: FC<
  EventPlaceholdersProps
> = (props) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  let emptyEvent: Event = {
    break_id: 0,
    customer: "",
    id: 0,
    index: 0,
    is_giveaway: false,
    note: "",
    price: 0,
    quantity: 0,
    team: "",
    giveaway_type: GiveawayTypeNone,
  };
  const [wasUnchecked, setWasUnchecked] = useState(false);

  useEffect(() => {
    let emptyEvents: Event[] = [];
    props.events.forEach((i, j) => {
      let newEvent = { ...emptyEvent };
      newEvent.id = j;
      newEvent.customer = i.customer;
      newEvent.price = i.price;
      emptyEvents.push(newEvent);
    });
    setEvents(emptyEvents);

    if (!selectedEvent && emptyEvents.length > 0) {
      selectEventPlaceholder(emptyEvents[0]);
    }
  }, [props.events]);

  useEffect(() => {
    if (wasUnchecked) {
      setWasUnchecked(false);
      setSelectedEvent(null);
    } else if (props.realEventPlaceholder.customer == "" && selectedEvent) {
      props.deleteEvent(selectedEvent.id);
      setSelectedEvent(null);
    }
  }, [props.realEventPlaceholder]);

  function updateEventPlaceholder(event: Event) {
    setEvents((old) => {
      let newE = [...old];
      let index = newE.findIndex((e) => e.id == event.id);
      newE[index].customer = event.customer;
      newE[index].price = event.price;
      return newE;
    });
  }

  function deselectEventPlaceholder() {
    setWasUnchecked(true);
    props.resetRealEventPlaceholder();
  }

  function selectEventPlaceholder(event: Event) {
    setSelectedEvent({ ...event });
    props.updateRealEventPlaceholder({ ...event });
  }

  function resetRealEventPlaceholder(event: Event) {
    props.deleteEvent(event.id);
    // props.resetRealEventPlaceholder();
  }

  return (
    <div>
      {events.map((e, j) => (
        <EventPlaceholderComponent
          key={e.id}
          params={{
            event: e,
            updateEventPlaceholder: updateEventPlaceholder,
            resetEventPlaceholder: resetRealEventPlaceholder,
            selectEventPlaceholder: selectEventPlaceholder,
            deselectEventPlaceholder: deselectEventPlaceholder,
            isSelected: e.id == (selectedEvent?.id ?? -1),
            isAuto: j == events.length - 1,
            inputDisabled: true,
          }}
        />
      ))}
      {events.length <= 0 && <div>No events yet...</div>}
    </div>
  );
};
