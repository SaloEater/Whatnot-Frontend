import './page.css'
import {useEffect, useState} from "react";
import "./customerPackage.css"
import {CheckboxState} from "@/app/package/[id]/checkbox";
import {BreakPackage} from "@/app/package/[id]/breakPackage";
import {Event, PackageEvent} from "@/app/entity/entities";

export function CustomerPackageComponent(props: {customer: string, breaks: Map<string, PackageEvent[]>}) {
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

    let highBidEventAmount = Array.from(breaks.values()).reduce((acc, v) => acc + v.filter(i => i.is_high_bid).length, 0)
    let eventsAmount = Array.from(breaks.values()).reduce((acc, v) => acc + v.length, 0)

    return (
        <div className="package-customer">
            <div className={getClassName()} onClick={switchState}>
                {customer}
                {highBidEventAmount == 0 && <span className='text-secondary'>{`[${eventsAmount}]`}</span>}
                {highBidEventAmount > 0 && <span className='text-secondary'>{`[${eventsAmount - 1} + ${highBidEventAmount}]`}</span>}
            </div>
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