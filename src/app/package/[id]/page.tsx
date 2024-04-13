'use client'

import {useRouter, useSearchParams} from 'next/navigation'
import React, {useEffect, useState} from "react";
import {daysAreEqual} from "@/app/common/helpers";
import {router} from "next/client";
import "./page.css"
import {Break, Day, GetDaysDay, GetDaysResponse, Event, GetEventsByBreakResponse} from "@/app/entity/entities";
import {get, getEndpoints, post} from "@/app/lib/backend";
import {CustomerPackageComponent} from "@/app/package/[id]/customerPackage";

interface DaysData {
    days: Day[]
}

export default function Page({params} : {params: {id: string}}) {
    let dayId = parseInt(params.id)
    const [breakCustomers, setBreakCustomers] = useState(new Map<string, Map<string, Event[]>>())

    useEffect(() => {
        const fetchData = async () => {
            let body = {
                day_id: dayId
            }
            post(getEndpoints().break_get_by_day, body)
                .then(async (breaks: Break[]) => {
                    let newBreakCustomers = new Map<string, Map<string, Event[]>>()

                    for (let breakObject of breaks) {
                        let eventBody = {
                            break_id: breakObject.id
                        }
                        let events: GetEventsByBreakResponse = await post(getEndpoints().events_get_by_break, eventBody)
                        for (let event of events.events) {
                            let customer = event.customer.trim();
                            if (!newBreakCustomers.has(customer)) {
                                newBreakCustomers.set(customer, new Map<string, Event[]>())
                            }
                            let breakCustomer = newBreakCustomers.get(customer) as Map<string, Event[]>
                            let breakName = breakObject.name.trim();
                            if (!breakCustomer.has(breakName)) {
                                breakCustomer.set(breakName, [])
                            }
                            let existingEvents = breakCustomer.get(breakName) as Event[]
                            existingEvents.push(event)
                            breakCustomer.set(breakName, existingEvents)
                            newBreakCustomers.set(customer, breakCustomer)
                        }
                    }

                    setBreakCustomers(newBreakCustomers)
                })
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