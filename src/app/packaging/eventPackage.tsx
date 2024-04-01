import {useState} from "react";
import {Event} from "../entity/entities";

export default function EventComponent(props: {event: Event, index: number, updateEventState: (index: number, state: boolean) => void, currentState: boolean}) {
    const {event, index, updateEventState, currentState} = props

    let textValue
    if (event.team) {
        textValue = event.team
    } else {
        if (!event.note && event.is_giveaway) {
            textValue = "Giveaway"
        } else {
            textValue = event.note
        }
    }

    function changeState() {
        updateEventState(index, !currentState)
    }

    function getClassName() {
        return currentState ? "item completed" : "item in-progress";
    }

    return (
    <div className={getClassName()} onClick={changeState}>
            {textValue}
    </div>
    )
}