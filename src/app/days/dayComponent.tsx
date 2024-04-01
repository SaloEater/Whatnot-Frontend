import {Dispatch, SetStateAction, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {Day, SelectedBreak} from "@/app/entity/entities";

export default function DayComponent(props: {selectedDay: Day|null, selectedBreak: SelectedBreak, setSelectedBreak:  Dispatch<SetStateAction<SelectedBreak>>, requestedDaysReload: boolean, requestDaysReload: Dispatch<SetStateAction<boolean>>}) {
    const [newBreakName, setNewBreakName] = useState("")

    async function addNewBreak() {
        if (newBreakName === "") {
            return
        }

        const body = {
            year: props.selectedDay?.date.year,
            month: props.selectedDay?.date.month,
            day: props.selectedDay?.date.day,
            name: newBreakName,
            start_date: ((new Date()).getTime()).toString(),
            end_date: ((new Date()).getTime()).toString()
        }
        const response = await post((await getEndpoints()).addBreak, body)
        if (!response.error) {
            props.requestDaysReload(!props.requestedDaysReload)
            setNewBreakName("")
        }
    }

    return (
        <ul className="list-group">
            {
                props.selectedDay && props.selectedDay.breaks.map(
                    (breakName, j, arr) => {
                        const className = ["list-group-item text-white", (props.selectedBreak === breakName ? "bg-secondary" : "")].join(' ')
                        return <li key={breakName} className={className} onClick={e => {
                            props.setSelectedBreak(breakName)
                        }}>
                            <div className="container-fluid">
                                <div className="row">
                                    <div className="col-1">{j + 1})</div>
                                    <div className="col">{breakName}</div>
                                    <div className="col-3">
                                        <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
                                            async e => {
                                                const body = {
                                                    year: props.selectedDay?.date.year,
                                                    month: props.selectedDay?.date.month,
                                                    day: props.selectedDay?.date.day,
                                                    name: breakName,
                                                };
                                                const response = await post((await getEndpoints()).deleteBreak, body);
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
                props.selectedDay && <li key={"add_new"} className="list-group-item">
                    <input
                        className="form-control"
                        value={newBreakName}
                        placeholder="Enter break name.."
                        onChange={e => {
                                setNewBreakName(e.currentTarget.value)
                            }
                        }
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                addNewBreak();
                            }
                        }}
                    />
                    <div className="d-flex justify-content-end mt-2">
                        <button type="button" id="add-btn" className="btn btn-primary" onClick={async e => {addNewBreak()}}>Add</button>
                    </div>
                </li>
            }
        </ul>
    )
}