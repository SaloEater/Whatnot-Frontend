import {createRef, Dispatch, SetStateAction, useEffect, useRef, useState} from "react";
import {getEndpoints, post} from "@/app/lib/backend";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment from "moment";
import {Simulate} from "react-dom/test-utils";
import drop = Simulate.drop;
import {Day, Break, Event, SelectedBreak} from "@/app/entity/entities";
import EventComponent from "@/app/days/eventComponent";
import {findDOMNode} from "react-dom";
import NewEventComponent from "@/app/days/newEventComponent";

export function getBreakIndex(selectedBreak: SelectedBreak) {
    return parseInt(selectedBreak.split('.')[0].split('_')[1])
}

export default function BreakComponent(props: {selectedDay: Day, selectedBreak: SelectedBreak, requestedDaysReload: boolean, requestDaysReload: Dispatch<SetStateAction<boolean>>}) {
    const [breakObject, setBreakObject] = useState<Break|null>(null);
    const [requestedBreakObjectRefresh, _requestBreakObjectRefresh] = useState(false)

    function requestBreakObjectRefresh() {
        _requestBreakObjectRefresh((old) => !old)
    }

    const [startDate, setStartDate] = useState(new Date())
    const [endDate, setEndDate] = useState(new Date())


    useEffect(() => {
        if (!props.selectedDay || props.selectedBreak === "") {
            return
        }
        const fetchData = async () => {
            try {
                const body = {
                    year: props.selectedDay?.date.year,
                    month: props.selectedDay?.date.month,
                    day: props.selectedDay?.date.day,
                    name: props.selectedBreak
                }
                const breakData = await post((await getEndpoints()).getBreak, body)

                var _break: Break|null = breakData
                if (breakData.error) {
                    _break = null
                }

                if (_break) {
                    setStartDate(await getStartDate(_break.start_date))
                    setEndDate(await getEndDate(_break.end_date))
                }

                setBreakObject(_break)
            } catch (error) {
                console.error('Failed to fetch break:', error);
            }
        };

        fetchData();
    }, [props.selectedDay, props.selectedBreak, requestedBreakObjectRefresh])


    const dateTimeFormat = "YYYY-MM-dd hh:mm a"

    async function getStartDate(start_date: number) {
        if (start_date <= 0) {
            const ok = await setStartDateRequest((new Date()).getTime().toString())
            if (ok) {
                requestBreakObjectRefresh()
            }
        }

        return new Date(start_date);
    }

    async function getEndDate(end_date: number) {
        if (end_date <= 0) {
            const ok = await setEndDateRequest((new Date()).getTime().toString())
            if (ok) {
                requestBreakObjectRefresh()
            }
        }

        return new Date(end_date);
    }

    async function setStartDateRequest(startDateUnix: string) {
        const body = {
            year: props.selectedDay?.date.year,
            month: props.selectedDay?.date.month,
            day: props.selectedDay?.date.day,
            name: props.selectedBreak,
            start_date: startDateUnix
        };
        const response = await post((await getEndpoints()).setBreakStartDate, body);
        return response.error === undefined
    }

    async function setEndDateRequest(endDateUnix: string) {
        const body = {
            year: props.selectedDay?.date.year,
            month: props.selectedDay?.date.month,
            day: props.selectedDay?.date.day,
            name: props.selectedBreak,
            end_date: endDateUnix
        };
        const response = await post((await getEndpoints()).setBreakEndDate, body);
        return response.error === undefined
    }

    function getDefinedTeams() {
        const predefinedTeamsData = localStorage.getItem("teams") ?? ""
        const teams = predefinedTeamsData == "" ? [] : JSON.parse(predefinedTeamsData)
        return teams.join('\n');
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
                                    requestBreakObjectRefresh()
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
                                    requestBreakObjectRefresh()
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
                                <li key="title" className="list-group-item">Events</li>
                                <li key="new_event" className="list-group-item">
                                    Add new event:
                                    <NewEventComponent
                                        selectedDay={props.selectedDay}
                                        selectedBreak={props.selectedBreak}
                                        requestBreakObjectRefresh={requestBreakObjectRefresh}
                                    />
                                </li>
                                {(breakObject?.events.length > 0) ? breakObject.events.toReversed().map(
                                    (event, j, arr) => {
                                        if (!props.selectedDay) {
                                            return
                                        }

                                        let normalJ = arr.length - j - 1
                                        return <li  key={event.id} className="list-group-item">
                                            <EventComponent
                                                id={event.id}
                                                reversedIndex={j}
                                                normalIndex={normalJ}
                                                isLastElement={normalJ == arr.length - 1}
                                                isFirstElement={normalJ == 0}
                                                selectedDay={props.selectedDay}
                                                selectedBreak={props.selectedBreak}
                                                requestBreakObjectRefresh={requestBreakObjectRefresh}
                                                event={event}
                                            />
                                        </li>;
                                    }
                                ) : <li key="nothing" className="list-group-item">No ev ents yet</li>}
                            </ul>
                        </div>
                        <div className="col form-floating">
                            <textarea readOnly={true} id="username-list" className="form-control username-list" style={{height: "100%"}} onChange={e => console.log('new value is' + e.currentTarget.value, e.currentTarget.value.split('\n'))}/>
                            <label htmlFor="username-list">Usernames</label>
                        </div>
                        <div className="col form-floating">
                            <textarea id="team-list" className="form-control team-list" style={{height: "100%"}} onBlur={e => {
                                const newTeams = e.currentTarget.value.split('\n')
                                localStorage.setItem("teams", JSON.stringify(newTeams))
                            }} value={getDefinedTeams()}/>
                            <label htmlFor="team-list">Teams</label>
                        </div>
                    </div> : <div>

                    </div>
                }
            </div>
        </div>
    )
}