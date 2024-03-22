import {DayData} from "@/app/days/dayComponent";
import {Dispatch, SetStateAction, useEffect, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment from "moment";

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
    start_date: number
    end_date: number
}

export function getBreakIndex(selectedBreak: SelectedBreak) {
    return parseInt(selectedBreak.split('.')[0].split('_')[1])
}

export default function Break(props: {selectedDay: DayData|null, selectedBreak: SelectedBreak, requestedDaysReload: boolean, requestDaysReload: Dispatch<SetStateAction<boolean>>}) {
    const [breakObject, setBreakObject] = useState<Break|null>(null);
    const [requestedBreakObjectRefresh, requestBreakObjectRefresh] = useState(false)
    const [newOutcome, setNewOutcome] = useState<string>("")
    const [startDate, setStartDate] = useState(new Date())
    const [endDate, setEndDate] = useState(new Date())

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
                setStartDate(await getStartDate(_break?.start_date ?? 0))
                setEndDate(await getEndDate(_break?.end_date ?? 0))
            } catch (error) {
                console.error('Failed to fetch break:', error);
            }
        };

        fetchData();
    }, [props.selectedDay, props.selectedBreak, requestedBreakObjectRefresh])

    async function changeOutcomes(newOutcomes: string[]) {
        const username = localStorage?.getItem("username") ?? "";
        const password = localStorage?.getItem("password") ?? "";
        const index = getBreakIndex(props.selectedBreak);
        const body = {
            year: props.selectedDay?.date.year,
            month: props.selectedDay?.date.month,
            day: props.selectedDay?.date.day,
            index: index,
            outcomes: newOutcomes
        };
        const response = await post((await getEndpoints()).changeOutcome, body, username, password);
        if (response.error === undefined) {
            props.requestDaysReload(!props.requestedDaysReload);
            return true
        }
        return false
    }

    async function addNewOutcome(outcome: string) {
        const newOutcomes = (breakObject?.outcomes ?? []).map(i => i)
        newOutcomes.push(outcome);
        return await changeOutcomes(newOutcomes);
    }

    const dateTimeFormat = "YYYY-MM-dd hh:mm a"

    async function getStartDate(start_date: number) {
        if (start_date <= 0) {
            const ok = await setStartDateRequest((new Date()).getTime().toString())
            if (ok) {
                requestBreakObjectRefresh(!requestedBreakObjectRefresh)
            }
        }

        return new Date(start_date);
    }

    async function getEndDate(end_date: number) {
        if (end_date <= 0) {
            const ok = await setEndDateRequest((new Date()).getTime().toString())
            if (ok) {
                requestBreakObjectRefresh(!requestedBreakObjectRefresh)
            }
        }

        return new Date(end_date);
    }

    async function setStartDateRequest(startDateUnix: string) {
        const username = localStorage?.getItem("username") ?? "";
        const password = localStorage?.getItem("password") ?? "";
        const index = getBreakIndex(props.selectedBreak);
        const body = {
            year: props.selectedDay?.date.year,
            month: props.selectedDay?.date.month,
            day: props.selectedDay?.date.day,
            index: index,
            start_date: startDateUnix
        };
        const response = await post((await getEndpoints()).setBreakStartDate, body, username, password);
        return response.error === undefined
    }

    async function setEndDateRequest(endDateUnix: string) {
        const username = localStorage?.getItem("username") ?? "";
        const password = localStorage?.getItem("password") ?? "";
        const index = getBreakIndex(props.selectedBreak);
        const body = {
            year: props.selectedDay?.date.year,
            month: props.selectedDay?.date.month,
            day: props.selectedDay?.date.day,
            index: index,
            end_date: endDateUnix
        };
        const response = await post((await getEndpoints()).setBreakEndDate, body, username, password);
        return response.error === undefined
    }

    return (
        <div>
            {
                breakObject && <div>
                    <div>
                        Start Date
                        <TuiDateTimePicker
                            handleChange={async e => {
                                const startDateUnix = moment(e, dateTimeFormat.toUpperCase()).format("x")
                                const ok = await setStartDateRequest(startDateUnix)
                                if (ok) {
                                    requestBreakObjectRefresh(!requestedBreakObjectRefresh)
                                }
                            }}
                            format={dateTimeFormat}
                            date={startDate}
                            inputWidth="auto"
                        />
                        End Date
                        <TuiDateTimePicker
                            handleChange={async e => {
                                const endDateUnix = moment(e, dateTimeFormat.toUpperCase()).format("x")
                                const ok = await setEndDateRequest(endDateUnix)
                                if (ok) {
                                    requestBreakObjectRefresh(!requestedBreakObjectRefresh)
                                }
                            }}
                            format={dateTimeFormat}
                            date={endDate}
                            inputWidth="auto"
                        />
                    </div>
                </div>
            }
            <div className="container-fluid">
                {
                    breakObject ? <div className="row">
                        <div className="col">

                            <ul className="list-group">
                                <li key="title" className="list-group-item">Sold products</li>
                                {(breakObject?.sold_events.length > 0) ? breakObject.sold_events.toReversed().map(
                                    (i, j, arr) => {
                                        const {customer, price} = i.object;
                                        return <li key={i.id} className="list-group-item">
                                            <div className="container-fluid">
                                                <div className="col-1">{arr.length - j}</div>
                                                <div className="col-4">{`${customer} - ${price}$`}</div>
                                            </div>
                                        </li>;
                                    }
                                ) : <li key="nothing" className="list-group-item">No events yet</li>}
                            </ul>
                        </div>
                        <div className="col">
                            <ul className="list-group">
                                <li key="title" className="list-group-item">Outcomes</li>
                                {
                                    <li key={"add_new"} className="list-group-item">
                                        <div className="form-group">
                                            <input
                                                className="form-control"
                                                value={newOutcome}
                                                placeholder="Add new outcome.."
                                                onChange={e => {
                                                    setNewOutcome(e.currentTarget.value)
                                                }
                                                }
                                                onKeyDown={async (e) => {
                                                    if (e.key === 'Enter') {
                                                        const ok = await addNewOutcome(newOutcome);
                                                        if (ok) {
                                                            setNewOutcome("")
                                                        }
                                                    }
                                                }}
                                            />
                                            <div className="d-flex justify-content-start gap-1 mt-1">
                                                <button type="button" id="skip-btn" className="btn btn-danger" onClick={e => addNewOutcome("Skip")}>Skip</button>
                                                <button type="button" id="giveaway-btn" className="btn btn-info" onClick={e => addNewOutcome("Giveaway")}>Giveaway</button>
                                                <button type="button" id="add-btn" className="btn btn-primary" onClick={e => addNewOutcome(newOutcome)}>Add</button>
                                            </div>
                                        </div>
                                    </li>
                                }
                                {breakObject.outcomes.toReversed().map(
                                    (i, j, arr) => {
                                        function getOutcomeBg() {
                                            if (i === "Skip") {
                                                return "bg-danger"
                                            }
                                            if (i === "Giveaway") {
                                                return "bg-info"
                                            }

                                            return ""
                                        }

                                        const outcomeBg = getOutcomeBg()

                                        const className = ["list-group-item", outcomeBg].join(" ")
                                        return <li key={j} className={className}>
                                            <div className="container-fluid">
                                                <div className="row">
                                                    <div className="col-2">{arr.length - j})</div>
                                                    <div className="col-4">
                                                        {
                                                            <div>
                                                                {i}
                                                            </div>
                                                        }
                                                    </div>
                                                    <div className="col-2">
                                                        <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="Delete" onClick={
                                                            e => {
                                                                changeOutcomes(breakObject.outcomes.toSpliced(arr.length - j - 1, 1))
                                                            }
                                                        }/>
                                                    </div>
                                                </div>
                                            </div>
                                        </li>;
                                    }
                                )}
                            </ul>
                        </div>
                    </div> : <div>Select break to access it's data...</div>
                }
            </div>
        </div>
    )
}