import {DayData} from "@/app/days/dayComponent";
import {Dispatch, SetStateAction, useEffect, useState} from "react";
import {get, getEndpoints, post} from "@/app/lib/backend";

export type SelectedBreak = string

interface ProductSoldEvent {
    customer: string
    price: number
    quantity: number
    product_id: string
    order_id: string
}

interface SoldEvent {
    id: string
    timestamp: string
    object: ProductSoldEvent
}

interface Break {
    sold_events: SoldEvent[]
    outcomes: string[]
    start_date: bigint
    end_date: bigint
}

function getBreakIndex(selectedBreak: SelectedBreak) {
    return parseInt(selectedBreak.split('.')[0].split('_')[1])
}

export default function Break(props: {selectedDay: DayData|null, selectedBreak: SelectedBreak, requestedDaysReload: boolean, requestDaysReload: Dispatch<SetStateAction<boolean>>}) {
    const [breakObject, setBreakObject] = useState<Break|null>(null);
    const [newOutcome, setNewOutcome] = useState<string>("")

    useEffect(() => {
        if (!props.selectedDay || props.selectedBreak === "") {
            return
        }
        const fetchData = async () => {
            try {
                const username = localStorage?.getItem("username") ?? ""
                const password = localStorage?.getItem("password") ?? ""
                const body = {
                    year: props.selectedDay?.date.year,
                    month: props.selectedDay?.date.month,
                    day: props.selectedDay?.date.day,
                    index: getBreakIndex(props.selectedBreak)
                }
                const breakData = await post((await getEndpoints()).getBreak, body, username, password)

                var _break: Break|null = breakData
                if (breakData.error) {
                    _break = null
                }
                setBreakObject(_break)
            } catch (error) {
                console.error('Failed to fetch break:', error);
            }
        };

        fetchData();
    }, [props.selectedDay, props.selectedBreak])

    return (

        <div className="container-fluid">
            <div className="row">
                <div className="col-4">
                    <ul className="list-group">
                        <li key="title" className="list-group-item">Sold products</li>
                        {
                            (breakObject && breakObject?.sold_events.length > 0) ? breakObject.sold_events.map(
                                i => {
                                    const {customer, price} = i.object
                                    return <li key={i.id} className="list-group-item">{`${customer} - ${price}$`}</li>
                                }
                            ) : <li key="nothing" className="list-group-item">No events yet</li>
                        }
                    </ul>
                </div>
                <div className="col-4">
                    <ul className="list-group">
                    <li key="title" className="list-group-item">Outcomes</li>
                        {
                            breakObject && breakObject.outcomes.map(
                                (i, j) => {
                                    return <li key={j} className="list-group-item">{i}</li>
                                }
                            )
                        }
                        {
                            breakObject && <li key={"add_new"} className="list-group-item" contentEditable={true} onKeyDown={async e => {
                                if (e.key === 'Enter') {
                                    const username = localStorage?.getItem("username") ?? ""
                                    const password = localStorage?.getItem("password") ?? ""
                                    const index = getBreakIndex(props.selectedBreak)
                                    const newOutcomes = breakObject?.outcomes.map(i => i).push(newOutcome)
                                    const body = {
                                        year: props.selectedDay?.date.year,
                                        month: props.selectedDay?.date.month,
                                        day: props.selectedDay?.date.day,
                                        index: index,
                                        outcomes: newOutcomes
                                    }
                                    const response = await post((await getEndpoints()).changeOutcome, body, username, password)
                                    if (response.error === undefined) {
                                        props.requestDaysReload(!props.requestedDaysReload)
                                    }
                                }
                            }}>{newOutcome === "" ? "Add new..." : newOutcome}</li>
                        }
                    </ul>
                </div>
            </div>
        </div>
    )
}