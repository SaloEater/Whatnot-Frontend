'use client'

import {useRouter, useSearchParams} from 'next/navigation'
import React, {useEffect, useState} from "react";
import {daysAreEqual} from "@/app/common/helpers";
import {router} from "next/client";
import "./page.css"
import {
    Break,
    Day,
    GetStreamsStream,
    GetStreamsResponse,
    Event,
    GetEventsByBreakResponse,
    PackageEvent
} from "@/app/entity/entities";
import {get, getEndpoints, post} from "@/app/lib/backend";
import {CustomerPackageComponent} from "@/app/package/[id]/customerPackage";

interface DaysData {
    days: Day[]
}

export default function Page({params} : {params: {id: string}}) {
    let streamId = parseInt(params.id)
    const [breakCustomers, setBreakCustomers] = useState(new Map<string, Map<string, PackageEvent[]>>())
    const [eventsCount, setEventsCount] = useState(0)

    useEffect(() => {
        const fetchData = async () => {
            let body = {
                id: streamId
            }
            post(getEndpoints().stream_breaks, body)
                .then(async (breaks: Break[]) => {
                    let newBreakCustomers = new Map<string, Map<string, PackageEvent[]>>()

                    let eventsCountCounter = 0
                    for (let breakObject of breaks) {
                        let eventBody = {
                            break_id: breakObject.id
                        }
                        let events: GetEventsByBreakResponse = await post(getEndpoints().break_events, eventBody)
                        for (let event of events.events) {
                            let customer = event.customer.trim();
                            if (!newBreakCustomers.has(customer)) {
                                newBreakCustomers.set(customer, new Map<string, PackageEvent[]>())
                            }
                            let breakCustomer = newBreakCustomers.get(customer) as Map<string, PackageEvent[]>
                            let breakName = breakObject.name.trim();
                            if (!breakCustomer.has(breakName)) {
                                breakCustomer.set(breakName, [])
                            }
                            let existingEvents = breakCustomer.get(breakName) as PackageEvent[]
                            let packageEvent: PackageEvent = {...event, is_high_bid: breakObject.high_bid_team == event.team}
                            existingEvents.push(packageEvent)
                            breakCustomer.set(breakName, existingEvents)
                            newBreakCustomers.set(customer, breakCustomer)
                        }
                        eventsCountCounter += events.events.length
                    }

                    setBreakCustomers(newBreakCustomers)
                    setEventsCount(eventsCountCounter)
                })
        };

        fetchData();
    }, [])

    return <div>
        <div className='fs-1'>
            Events: {eventsCount}
        </div>
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