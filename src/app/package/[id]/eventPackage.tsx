import {useState} from "react";
import "./eventPackage.css"
import {Event, GiveawayTypeSlab, PackageEvent} from "@/app/entity/entities";


export default function EventComponent(props: {event: PackageEvent, index: number, updateEventState: (index: number, state: boolean) => void, currentState: boolean}) {
    const {event, index, updateEventState, currentState} = props

    function getGiveawayTypeName(type: number) {
        return type == GiveawayTypeSlab ? 'S' : 'P';
    }

    let textValue
    if (event.team) {
        textValue = event.team
    } else {
        if (!event.note && event.is_giveaway) {
            textValue = "Giveaway " + getGiveawayTypeName(event.giveaway_type)
        } else {
            textValue = event.note
        }
    }

    function changeState() {
        updateEventState(index, !currentState)
    }

    function getClassName() {
        return `package-event item ${currentState ? "completed" : "in-progress"} ${event.is_high_bid && !currentState ? 'high-bid' : ''}`;
    }

    return (
    <div className={getClassName()} onClick={changeState}>
            {textValue}
    </div>
    )
}