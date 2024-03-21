'use client'

import {get, getEndpoints} from "@/app/lib/backend";
import {useEffect, useState} from "react";
import Day, {DayData} from "@/app/days/dayComponent";
import Break, {SelectedBreak} from "@/app/days/breakComponent";

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

    return (
        <main>
            <div className="container-fluid">
                <div className="row">
                    <div className="col-2">
                        <ul className="list-group">
                            {
                                data.days.map(
                                    (i) => {
                                        const {year, month, day} = i.date
                                        const date = `${year}-${month}-${day}`
                                        const className = ["list-group-item", (daysAreEqual(selectedDay, i) ? "bg-primary text-white" : "text-dark")].join(' ')
                                        return <li key={date} className={className} onClick={e => {
                                            setSelectedDay(i)
                                        }}><div >{date}</div></li>
                                    }
                                )
                            }
                        </ul>
                    </div>
                    <div className="col-2">
                        <Day selectedDay={selectedDay} selectedBreak={selectedBreak} setSelectedBreak={setSelectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>
                    </div>
                    <div className="col-8">
                        <Break selectedDay={selectedDay} selectedBreak={selectedBreak} requestedDaysReload={requestedDaysReload} requestDaysReload={requestDaysReload}/>
                    </div>
                </div>
            </div>
        </main>
    )
}