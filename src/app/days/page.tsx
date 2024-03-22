'use client'

import {get, getEndpoints, post} from "@/app/lib/backend";
import {useEffect, useState} from "react";
import Day, {DayData, DayDate} from "@/app/days/dayComponent";
import Break, {getBreakIndex, SelectedBreak} from "@/app/days/breakComponent";
import moment from "moment/moment";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";

interface DaysData {
    days: DayData[]
}

function daysAreEqual(a: DayData | null, b: DayData | null) {
    if (!a && !b) {
        return true
    }

    if (!a || !b) {
        return false
    }

    return a.date.year === b.date.year && a.date.month === b.date.month && a.date.day === b.date.day;
}

export default function Page() {
    const [data, setData] = useState<DaysData>({days: []});
    const [selectedDay, setSelectedDay] = useState<DayData | null>(null)
    const [selectedBreak, setSelectedBreak] = useState<SelectedBreak>("")
    const [requestedDaysReload, requestDaysReload] = useState<boolean>(false)
    const date = new Date()
    const [newDayDate, setNewDayDate] = useState<DayDate>({year: date.getFullYear(), month: date.getMonth(), day: date.getDate()})

    useEffect(() => {
        const fetchData = async () => {
            try {
                const username = localStorage?.getItem("username") ?? ""
                const password = localStorage?.getItem("password") ?? ""
                const daysData = await get((await getEndpoints()).days, username, password)

                const days: DaysData = daysData
                if (daysData.error != undefined) {
                    console.log("Error while fetching days: " + daysData.error)
                    days.days = []
                }
                setData(days)
                if (selectedDay) {
                    const updatedSelectedDay = days.days.filter(i => daysAreEqual(i, selectedDay))[0]
                    setSelectedDay(updatedSelectedDay)
                }
            } catch (error) {
                console.error('Failed to fetch data:', error);
            }
        };

        fetchData();
    }, [requestedDaysReload])

    const dateTimeFormat = "YYYY-MM-dd"

    return (
        <main>
            <div className="container-fluid mt-2">
                <div className="row gx-2">
                    <div className="col-3">
                        <ul className="list-group">
                            <li className="list-group-item">
                                <TuiDateTimePicker
                                    key={`${newDayDate.year}-${newDayDate.month}-${newDayDate.day}`}
                                    handleChange={async e => {
                                        const newDate = moment(e, dateTimeFormat.toUpperCase()).toDate()
                                        setNewDayDate({year: newDate.getFullYear(), month: newDate.getMonth(), day: newDate.getDate()})
                                    }}
                                    format={dateTimeFormat}
                                    date={new Date(newDayDate.year, newDayDate.month, newDayDate.day)}
                                    inputWidth="auto"
                                />
                                <button type="button" id="add-day" className="bg-primary" onClick={
                                    async e => {
                                        const username = localStorage?.getItem("username") ?? "";
                                        const password = localStorage?.getItem("password") ?? "";
                                        const body = {
                                            year: newDayDate.year,
                                            month: newDayDate.month,
                                            day: newDayDate.day,
                                        };
                                        const response = await post((await getEndpoints()).addDay, body, username, password);
                                        if (response.error === undefined) {
                                            requestDaysReload(!requestedDaysReload);
                                            return true
                                        }
                                        return false
                                    }
                                }>Add</button>
                            </li>
                            {
                                data.days.toReversed().map(
                                    (i) => {
                                        const {year, month, day} = i.date
                                        const date = `${year}-${month}-${day}`
                                        const className = ["list-group-item text-white", (daysAreEqual(selectedDay, i) ? "bg-secondary" : "")].join(' ')
                                        return <li key={date} className={className} onClick={e => {
                                            setSelectedDay(i)
                                        }}>
                                            <div className="container-fluid">
                                                <div className="row">
                                                    <div className="col">{moment(new Date(year, month, day)).format("YYYY/MM/DD")}</div>
                                                    <div className="col-2">
                                                        <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
                                                            async e => {
                                                                const username = localStorage?.getItem("username") ?? "";
                                                                const password = localStorage?.getItem("password") ?? "";
                                                                const body = {
                                                                    year: selectedDay?.date.year,
                                                                    month:selectedDay?.date.month,
                                                                    day: selectedDay?.date.day,
                                                                };
                                                                const response = await post((await getEndpoints()).deleteDay, body, username, password);
                                                                if (response.error === undefined) {
                                                                    requestDaysReload(!requestedDaysReload);
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
                        </ul>
                    </div>
                    <div className="col-2">
                        <Day selectedDay={selectedDay} selectedBreak={selectedBreak} setSelectedBreak={setSelectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>
                    </div>
                    <div className="col-7">
                        <Break selectedDay={selectedDay} selectedBreak={selectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>
                    </div>
                </div>
            </div>
        </main>
    )
}