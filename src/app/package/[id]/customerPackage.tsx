import './page.css'
import {useEffect, useState} from "react";
import "./customerPackage.css"
import {CheckboxState} from "@/app/package/[id]/checkbox";
import {BreakPackage} from "@/app/package/[id]/breakPackage";
import {Event, PackageEvent} from "@/app/entity/entities";

export interface IIndexable {
    [key: string]: number;
}

export function CustomerPackageComponent(props: {customer: string, breaks: Map<string, PackageEvent[]>, amountMap: any}) {
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
    let missingEvents =  0
    let actualAmount = 0
    if (props.amountMap) {
        actualAmount = (props.amountMap as IIndexable)[props.customer]
        missingEvents = actualAmount - (eventsAmount - highBidEventAmount)
    }

    return (
        <div className="package-customer">
            <div className={getClassName()} onClick={switchState}>
                {customer}
                <span className='text-secondary'>
                    [
                        {highBidEventAmount == 0 && <span>{`${eventsAmount}`}</span>}
                        {highBidEventAmount > 0 && <span>{`${eventsAmount - highBidEventAmount}`}</span>}
                        {props.amountMap && <span className='text-primary'>{actualAmount}</span>}
                        {highBidEventAmount > 0 && <span>{`+ ${highBidEventAmount}`}</span>}
                    ]
                </span>
                {missingEvents < 0 ? <span className='bg-danger'>{`Extra ${missingEvents * -1} events`}</span> : ''}
                {missingEvents > 0 ? <span className='bg-danger'>{`Missing ${missingEvents} events`}</span> : ''}
                {props.amountMap && missingEvents == 0 ? <span className='bg-green'> Correct</span>: ''}
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