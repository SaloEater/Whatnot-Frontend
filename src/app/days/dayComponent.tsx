import {Dispatch, SetStateAction} from "react";
import {getBreakIndex, SelectedBreak} from "@/app/days/breakComponent";
import {getEndpoints, post} from "@/app/lib/backend";


export interface DayDate {
    year: number
    month: number
    day: number
}

export interface DayData {
    date: DayDate
    breaks: string[]
}
export default function Day(props: {selectedDay: DayData|null, selectedBreak: SelectedBreak, setSelectedBreak:  Dispatch<SetStateAction<SelectedBreak>>, requestedDaysReload: boolean, requestDaysReload: Dispatch<SetStateAction<boolean>>}) {
    return (
        <ul className="list-group">
            {
                props.selectedDay && props.selectedDay.breaks.toReversed().map(
                    (i, j, arr) => {
                        const className = ["list-group-item text-white", (props.selectedBreak === i ? "bg-secondary" : "")].join(' ')
                        return <li key={i} className={className} onClick={e => {
                            props.setSelectedBreak(i)
                        }}>
                            <div className="container-fluid">
                                <div className="row">
                                    <div className="col-1">{arr.length - j})</div>
                                    <div className="col">{i.split('.')[0].split('_').join(' ')}</div>
                                    <div className="col-3">
                                        <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
                                            async e => {
                                                const username = localStorage?.getItem("username") ?? "";
                                                const password = localStorage?.getItem("password") ?? "";
                                                const index = getBreakIndex(props.selectedBreak);
                                                const body = {
                                                    year: props.selectedDay?.date.year,
                                                    month: props.selectedDay?.date.month,
                                                    day: props.selectedDay?.date.day,
                                                    index: index,
                                                };
                                                const response = await post((await getEndpoints()).deleteBreak, body, username, password);
                                                if (response.error === undefined) {
                                                    props.requestDaysReload(!props.requestedDaysReload);
                                                    return true
                                                }
                                                return false
                                            }
                                        }/>
                                    </div>
                                </div>
                            </div>
                        </li>
                    }
                )
            }
            {
                props.selectedDay && <li key={"add_new"} className="list-group-item" onClick={async e => {
                    const username = localStorage?.getItem("username") ?? ""
                    const password = localStorage?.getItem("password") ?? ""
                    const body = {
                        year: props.selectedDay?.date.year,
                        month: props.selectedDay?.date.month,
                        day: props.selectedDay?.date.day,
                    }
                    const response = await post((await getEndpoints()).addBreak, body, username, password)
                    if (response.error === undefined) {
                        props.requestDaysReload(!props.requestedDaysReload)
                    }
                }}>Add new...</li>
            }
        </ul>
    )
}