'use client'

import {useRouter, useSearchParams} from 'next/navigation'
import {useEffect, useState} from "react";
import {get, getEndpoints, post} from "../lib/backend";
import {Break, Day, Event} from "../entity/entities";
import {daysAreEqual} from "@/app/common/helpers";
import {router} from "next/client";
import EventComponent from "@/app/packaging/eventPackage";
import "./page.css"
import {CustomerPackageComponent} from "@/app/packaging/customerPackage";

interface DaysData {
    days: Day[]
}

export default function SearchBar() {
    const [breakCustomers, setBreakCustomers] = useState(new Map<string, Map<string, Event[]>>())

    const searchParams = useSearchParams()

    const year = searchParams?.get('year') as string
    const month = searchParams?.get('month') as string
    const day = searchParams?.get('day') as string

    function routeToDays() {
        console.log('route to days...')
        return
        const router = useRouter()
        router.push('/days')
    }

    if (!year || !month || !day) {
        routeToDays()
    }
    const dayDateToLog: Day = {
        date: {year: parseInt(year), month: parseInt(month), day: parseInt(day)},
        breaks: []
    }

    useEffect(() => {
        const fetchData = async () => {
            try {
                const daysData = await get((await getEndpoints()).days)
                const days: DaysData = daysData
                if (daysData.error != undefined) {
                    console.log("Error while fetching days: " + daysData.error)
                    return
                }

                const day = days.days.filter(i => daysAreEqual(i, dayDateToLog))[0]
                if (!day) {
                    console.log('Day is not found')
                }

                let breaksName: string[] = []
                day.breaks.forEach(breakName => {breaksName.push(breakName)})

                let breaks: Break[] = []

                for (let breakName of breaksName) {
                    try {
                        const body = {
                            year: day.date.year,
                            month: day.date.month,
                            day: day.date.day,
                            name: breakName
                        }
                        const breakData = await post((await getEndpoints()).getBreak, body)

                        var _break: Break|null = breakData
                        if (!_break || breakData.error) {
                            throw new Error("break is null")
                        }

                        breaks.push(_break)
                    } catch (error) {
                        console.error('Failed to fetch break:', error);
                        return
                    }
                }

                let newBreakCustomers = new Map<string, Map<string, Event[]>>()

                for (let breakObject of breaks) {
                    for (let event of breakObject.events) {
                        if (!newBreakCustomers.has(event.customer)) {
                            newBreakCustomers.set(event.customer, new Map<string, Event[]>())
                        }
                        let breakCustomer = newBreakCustomers.get(event.customer) as Map<string, Event[]>
                        if (!breakCustomer.has(breakObject.name)) {
                            breakCustomer.set(breakObject.name, [])
                        }
                        let existingEvents = breakCustomer.get(breakObject.name) as Event[]
                        existingEvents.push(event)
                        breakCustomer.set(breakObject.name, existingEvents)
                        newBreakCustomers.set(event.customer, breakCustomer)
                    }
                }

                setBreakCustomers(newBreakCustomers)
            } catch (error) {
                console.error('Failed to fetch data:', error);
            }
        };

        fetchData();
    }, [])

    return <div>
        <div className="d-flex flex-wrap gap-4">
            {
                Array.from(breakCustomers.entries()).sort((i, j) => {
                    let a = i[0].toLowerCase();
                    let b = j[0].toLowerCase();
                    if (a < b) return -1
                    if (a > b) return 1
                    return 0
                }).map(
                    (customerInfo, i) => {
                        let customer = customerInfo[0]
                        let breaks = customerInfo[1]
                        return <CustomerPackageComponent key={i} customer={customer} breaks={breaks}/>
                    }
                )
            }
        </div>
    </div>
}