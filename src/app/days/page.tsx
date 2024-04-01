'use client'

import {get, getEndpoints, post} from "@/app/lib/backend";
import {useEffect, useState} from "react";
import DayComponent from "@/app/days/dayComponent";
import BreakComponent from "@/app/days/breakComponent";
import moment from "moment/moment";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import CreateNewDate from "@/app/days/CreateNewDate";
import {Day, DayDate, SelectedBreak} from "@/app/entity/entities";
import {daysAreEqual} from "@/app/common/helpers";
import {useRouter} from "next/navigation";
import {cleanAuth, requestClientAuthClean} from "@/app/lib/auth_storage";

interface DaysData {
    days: Day[]
}

export default function Page() {
    const [data, setData] = useState<DaysData>({days: []});
    const [selectedDay, setSelectedDay] = useState<Day | null>(null)
    const [selectedBreak, setSelectedBreak] = useState<SelectedBreak>("")
    const [requestedDaysReload, requestDaysReload] = useState<boolean>(false)
    const date = new Date()
    const defaultDayDate = {year: date.getFullYear(), month: date.getMonth(), day: date.getDate()}
    const [newDayDate, setNewDayDate] = useState<DayDate>({...defaultDayDate})

    useEffect(() => {
        const fetchData = async () => {
            try {
                const daysData = await get((await getEndpoints()).days)
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
    const router = useRouter()

    return (
        <main>
            <div className="container-fluid mt-2">
                <div className="row gx-2">
                    <div className="col-3">
                        <ul className="list-group">
                            <li className="list-group-item">
                                <CreateNewDate
                                    newDayDate={newDayDate}
                                    setNewDayDate={setNewDayDate}
                                    dateTimeFormat={dateTimeFormat}
                                    requestedDaysReload={requestedDaysReload}
                                    requestDaysReload={requestDaysReload}
                                />
                            </li>
                            {
                                selectedDay && <li className="d-flex justify-content-end">
                                    <button type="button" className="btn btn-primary" onClick={
                                        e => {
                                            let packagingParams = {
                                                year: selectedDay?.date.year,
                                                month: selectedDay?.date.month,
                                                day: selectedDay?.date.day
                                            }
                                            let href = `/packaging?year=${selectedDay?.date.year}&month=${selectedDay?.date.month}&day=${selectedDay?.date.day}`
                                            router.push(href)
                                        }
                                    }>Package</button>
                                </li>
                            }
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
                                                                const body = {
                                                                    year: selectedDay?.date.year,
                                                                    month:selectedDay?.date.month,
                                                                    day: selectedDay?.date.day,
                                                                };
                                                                const response = await post((await getEndpoints()).deleteDay, body);
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
                    <div className="col-2" key={(selectedBreak ?? "") + (new Date()).getTime().toString()}>
                        <DayComponent selectedDay={selectedDay} selectedBreak={selectedBreak} setSelectedBreak={setSelectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>
                    </div>
                    <div className="col-7">
                        {selectedDay && <BreakComponent selectedDay={selectedDay} selectedBreak={selectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>}
                    </div>
                </div>
            </div>
        </main>
    )
}