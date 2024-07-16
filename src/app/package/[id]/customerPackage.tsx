import './page.css'
import {FC, useEffect, useState} from "react";
import "./customerPackage.css"
import {CheckboxState} from "@/app/package/[id]/checkbox";
import {BreakPackage} from "@/app/package/[id]/breakPackage";
import {Event, PackageEvent, PackageUserData, PackageUsersData} from "@/app/entity/entities";

export interface IIndexable {
    [key: string]: number;
}

interface CustomerPackageProps {
    customer: string,
    breaks: Map<string, PackageEvent[]>,
    packageUserData: PackageUserData|undefined
}

export const CustomerPackageComponent:FC<CustomerPackageProps> = (props) => {
    const [checkboxState, setCheckboxState] = useState(new CheckboxState(0))
    const [isChecked, setIsChecked] = useState(false)
    const [missingEvents, setMissingEvents] = useState(0)
    const [actualAmount, setActualAmount] = useState(0)
    const [highBidEventAmount, setHighBidEventAmount] = useState(0)
    const [eventsAmount, setEventsAmount] = useState(0)
    const [missingAuctions, setMissingAuctions] = useState(0)
    const [missingGiveaways, setMissingGiveaways] = useState(0)
    const [missingGiveawayTypes, setMissingGiveawayTypes] = useState(new Map<number, number>())

    useEffect(() => {
        setCheckboxState(new CheckboxState(props.breaks.size))
        setHighBidEventAmount(Array.from(props.breaks.values()).reduce((acc, v) => acc + v.filter(i => i.is_high_bid).length, 0))
        setEventsAmount(Array.from(props.breaks.values()).reduce((acc, v) => acc + v.length, 0))
    }, [props.breaks]);

    useEffect(() => {
        setActualAmount(props.packageUserData?.totalQuantity ?? 0)
    }, [props.packageUserData]);

    useEffect(() => {
        if (props.packageUserData) {
            let auctionQuantity = 0
            let giveawayQuantity = 0
            let giveawayTypes = new Map<number, number>()
            Array.from(props.breaks.values()).forEach((events) => {
                events.forEach((event) => {
                    if (event.is_giveaway) {
                        giveawayQuantity += 1
                        let current = giveawayTypes.get(event.giveaway_type) ?? 0
                        giveawayTypes.set(event.giveaway_type, current + 1)
                    } else if(!event.is_high_bid) {
                        auctionQuantity += 1
                    }
                })
            })

            let expectedAuctionQuantity = props.packageUserData.auctionQuantity
            let expectedGiveawayQuantity = props.packageUserData.giveawayQuantity
            let expectedGiveawayTypes = props.packageUserData.giveawayTypes
            setMissingEvents(expectedAuctionQuantity - auctionQuantity + expectedGiveawayQuantity - giveawayQuantity )
            setMissingAuctions(expectedAuctionQuantity - auctionQuantity )
            setMissingGiveaways(expectedGiveawayQuantity - giveawayQuantity)
            let missingGiveawayTypes = new Map<number, number>()
            giveawayTypes.forEach((v, k) => {
                let actual = expectedGiveawayTypes.get(k) ?? 0
                missingGiveawayTypes.set(k, v - actual)
            })
            setMissingGiveawayTypes(missingGiveawayTypes)
        }
    }, [props.packageUserData, props.breaks]);

    /*useEffect(() => {
        if (props.packageUserData) {
            setMissingEvents(actualAmount - (eventsAmount - highBidEventAmount))
        }
    }, [actualAmount, eventsAmount, highBidEventAmount]);*/

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
            <div className={getClassName()} onClick={switchState}>
                {props.customer}
                <span className='text-secondary'>
                    [
                        {highBidEventAmount == 0 && <span>{`${eventsAmount}`}</span>}
                        {highBidEventAmount > 0 && <span>{`${eventsAmount - highBidEventAmount}`}</span>}
                        {props.packageUserData && <span className='text-primary'>{actualAmount}</span>}
                        {highBidEventAmount > 0 && <span>{`+ ${highBidEventAmount}`}</span>}
                    ]
                </span>
                {missingEvents < 0 ? <span className='bg-danger'>{`Extra ${missingEvents * -1} events`}</span> : ''}
                {missingEvents > 0 ? <span className='bg-danger'>{`Missing ${missingEvents} events: ${missingAuctions}a, ${missingGiveaways}g`}</span> : ''}
                {props.packageUserData && missingEvents == 0 ? <span className='bg-green'> Correct</span>: ''}
            </div>
            <div className="d-flex flex-wrap gap-2">
                {
                    Array.from(props.breaks.entries()).map(
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