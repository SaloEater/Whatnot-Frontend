import {Event} from "../entity/entities";
import {BreakPackage} from "@/app/packaging/breakPackage";
import './page.css'
import {useEffect, useState} from "react";
import {CheckboxState} from "@/app/packaging/checkbox";


export function CustomerPackageComponent(props: {customer: string, breaks: Map<string, Event[]>}) {
    const {breaks, customer} = props
    const [checkboxState, setCheckboxState] = useState(new CheckboxState(0))
    const [isChecked, setIsChecked] = useState(false)

    useEffect(() => {
        setCheckboxState(new CheckboxState(breaks.size))
    }, [breaks]);

    function getClassName() {
        return isChecked ? "item completed" : "item in-progress";
    }

    function updateState(index: number, state: boolean) {
        setCheckboxState((old) => {
            let newState = old.cloneAndSet(index, state)
            setIsChecked(newState.allTrue())
            return newState
        })
    }

    function switchState() {
        setIsChecked((old) => {
            let newChecked = !old
            setCheckboxState((oldState) => {
                let newState = oldState.clone()
                newState.setAll(newChecked)
                return newState
            })
            return newChecked
        })
    }

    return (
        <div className="container-fluid">
            <div className="row">
                <div className={["col", getClassName()].join(' ')} onClick={switchState}>{customer}</div>
            </div>
            {
                Array.from(breaks.entries()).map(
                    (breakE, index) => {
                        let breakName = breakE[0]
                        let events = breakE[1]
                        return <BreakPackage
                            breakName={breakName}
                            events={events}
                            index={index}
                            currentState={checkboxState.get(index)}
                            updateBreakState={updateState}
                        />
                    }
                )
            }
        </div>
    )
}