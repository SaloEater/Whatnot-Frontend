import {useEffect, useState} from "react";
import "./breakPackage.css"
import {CheckboxState} from "@/app/package/[id]/checkbox";
import EventComponent from "@/app/package/[id]/eventPackage";

export function BreakPackage(props: {breakName: string, events: Event[], index: number, updateBreakState: (index: number, state: boolean) => void, currentState: boolean}) {
    const {breakName, events, index, updateBreakState, currentState} = props
    const [checkboxState, _setCheckboxState] = useState(new CheckboxState(0))

    useEffect(() => {
        let newState = new CheckboxState(events.length);
        _setCheckboxState(newState)
    }, [events]);

    useEffect(() => {
        let newState = new CheckboxState(events.length);
        newState.setAll(currentState)
        _setCheckboxState(newState)
    }, [currentState]);

    function getClassName() {
        return checkboxState.allTrue() ? "item completed" : "item in-progress";
    }

    function updateState(childIndex: number, state: boolean) {
        let newState = checkboxState.cloneAndSet(childIndex, state)
        updateBreakState(index, newState.allTrue())
        _setCheckboxState(newState)
    }

    function switchState() {
        updateBreakState(index, !currentState)
    }

    return (
        <div className="package-break">
            <div className={getClassName()} onClick={switchState}>{`${breakName} [${events.length}]`}</div>
            <div className="d-flex flex-wrap gap-2">
                {
                    events.map((event, childIndex) => {
                        return <EventComponent
                            key={childIndex}
                            event={event}
                            index={childIndex}
                            updateEventState={updateState}
                            currentState={checkboxState.get(childIndex)}
                        />
                    })
                }
            </div>
        </div>
    )
}