import EventComponent from "@/app/packaging/eventPackage";
import {Event} from "../entity/entities";
import {useEffect, useState} from "react";
import {CheckboxState} from "@/app/packaging/checkbox";

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
        _setCheckboxState((old) => {
            let newState = old.cloneAndSet(childIndex, state)
            updateBreakState(index, newState.allTrue())
            return newState
        })
    }

    function turnOnBreakAndChildren() {
        updateBreakState(index, true)
    }

    return (
        <div className="row">
            <div className="col">
                <div className="container-fluid">
                    <div className="row">
                        <div className={["col", getClassName()].join(' ')} onClick={turnOnBreakAndChildren}>{breakName}</div>
                    </div>
                    <div className="row">
                        <div className="col d-flex flex-wrap gap-2">
                            {
                                events.map((event, childIndex) => {
                                    return <EventComponent
                                        event={event}
                                        index={childIndex}
                                        updateEventState={updateState}
                                        currentState={checkboxState.get(childIndex)}
                                    />
                                })
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}