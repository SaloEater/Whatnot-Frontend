import {Event} from "../entity/entities";
import {BreakPackage} from "@/app/packaging/breakPackage";
import './page.css'
import {useEffect, useState} from "react";
import {CheckboxState} from "@/app/packaging/checkbox";
import "./customerPackage.css"

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
        let newState = checkboxState.cloneAndSet(index, state)
        setIsChecked(newState.allTrue())
        setCheckboxState(newState)
    }

    function switchState() {
        let newChecked = !isChecked
        setCheckboxState((oldState) => {
            let newState = oldState.clone()
            newState.setAll(newChecked)
            return newState
        })
        setIsChecked(newChecked)
    }

    return (
        <div className="package-customer">
            <div className={getClassName()} onClick={switchState}>{`${customer} [${Array.from(breaks.values()).reduce((acc, v) => acc + v.length, 0)}]`}</div>
            <div className="d-flex flex-wrap gap-2">
                {
                    Array.from(breaks.entries()).map(
                        (breakE, index) => {
                            let breakName = breakE[0]
                            let events = breakE[1]
                            return <BreakPackage
                                key={index}
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
        </div>
    )
}