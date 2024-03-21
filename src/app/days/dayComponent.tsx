import {Dispatch, SetStateAction} from "react";
import {SelectedBreak} from "@/app/days/breakComponent";
import {getEndpoints, post} from "@/app/lib/backend";


export interface Date {
    year: number
    month: number
    day: number
}

export interface DayData {
    date: Date
    breaks: string[]
}
export default function Day(props: {selectedDay: DayData|null, selectedBreak: SelectedBreak, setSelectedBreak:  Dispatch<SetStateAction<SelectedBreak>>, requestedDaysReload: boolean, requestDaysReload: Dispatch<SetStateAction<boolean>>}) {
    return (
        <ul className="list-group">
            {
                props.selectedDay && props.selectedDay.breaks.map(
                    (i) => {
                        const className = ["list-group-item", (props.selectedBreak === i ? "bg-primary text-white" : "text-dark")].join(' ')
                        return <li key={i} className={className} onClick={e => {
                            props.setSelectedBreak(i)
                        }}>{i}</li>
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