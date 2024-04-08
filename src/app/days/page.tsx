'use client'

import {get, getEndpoints, post} from "@/app/lib/backend";
import {useEffect, useState} from "react";
import moment from "moment/moment";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import {DayData} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import {GetDaysDay, GetDaysResponse} from "@/app/entity/entities";

export default function Page(timestamp: number) {
    const [days, setDays] = useState<GetDaysDay[]>([]);
    const date = new Date()
    const defaultDayDate = {year: date.getFullYear(), month: date.getMonth(), day: date.getDate()}
    const [newDayDate, setNewDayDate] = useState<DayData>({...defaultDayDate})

    useEffect(() => {
        get(getEndpoints().days_get)
            .then(daysData => {
                const days: GetDaysResponse = daysData
                setDays(days.days)
            })
    }, [])

    const dateTimeFormat = "YYYY-MM-dd"
    const router = useRouter()

    function removeDay(index: number) {
        setDays((oldDays) => {
            let newDays = [...oldDays]
            newDays.splice(index, 1)
            return newDays
        })
    }

    function addDay(id: number, timestamp: number) {
        setDays((oldDays) => {
            let newDays = [...oldDays]
            newDays.push({id: id, timestamp: timestamp})
            return newDays
        })
    }

    let pickerDate = new Date()
    pickerDate.setUTCFullYear(newDayDate.year, newDayDate.month, newDayDate.day)

    return (
        <main>
            <div className="d-flex justify-content-center">
                <ul className="list-group">
                    <li className="list-group-item">
                        <div>
                            <TuiDateTimePicker
                                key='new-date-picker'
                                handleChange={async e => {
                                    const newDate = moment(e, dateTimeFormat.toUpperCase()).toDate()
                                    let nextDate = {year: newDate.getFullYear(), month: newDate.getMonth(), day: newDate.getDate()}
                                    console.log(e, nextDate)
                                    setNewDayDate(nextDate)
                                }}
                                format={dateTimeFormat}
                                date={pickerDate}
                                inputWidth="auto"
                            />
                            <button type="button" id="add-day" className="btn bg-primary" onClick={
                                async e => {
                                    const body = {
                                        year: newDayDate.year,
                                        month: newDayDate.month + 1,
                                        day: newDayDate.day + 1,
                                    };
                                    post(getEndpoints().day_add, body)
                                        .then(response => {
                                            let date = (new Date(body.year, body.month - 1, body.day - 1))
                                            let ms = date.getTime()
                                            addDay(response.id, ms)
                                        })
                                }
                            }>Add</button>
                        </div>
                    </li>
                    {
                        days.toReversed().map(
                            (day: GetDaysDay, index: number, arr: GetDaysDay[]) => {
                                return <li key={day.id} className="list-group-item text-white">
                                    <div className="container-fluid">
                                        <div className="row">
                                            <div className="col" onClick={e => {
                                                router.push(`/day/${day.id}`)
                                            }}>{moment(new Date(day.timestamp)).format("YYYY/MM/DD")}</div>
                                            <div className="col-2">
                                                <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
                                                    async e => {
                                                        const body = {
                                                            id: day.id
                                                        };
                                                        const response = await post((await getEndpoints()).day_delete, body);
                                                        if (response.success) {
                                                            removeDay(arr.length - index - 1)
                                                        }
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
                {/*<div className="container-fluid">*/}
                {/*    <div className="row gx-2">*/}
                {/*        <div className="col-3">*/}
                {/*        </div>*/}
                {/*        <div className="col-2" key={(selectedBreak ?? "") + (new Date()).getTime().toString()}>*/}
                {/*            <DayComponent selectedDay={selectedDay} selectedBreak={selectedBreak} setSelectedBreak={setSelectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>*/}
                {/*        </div>*/}
                {/*        <div className="col-7">*/}
                {/*            {selectedDay && <Page selectedDay={selectedDay} selectedBreak={selectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>}*/}
                {/*        </div>*/}
                {/*    </div>*/}
                {/*</div>*/}
            </div>
        </main>
    )
}