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
import {CustomerPackageComponent, IIndexable} from "@/app/package/[id]/customerPackage";
import TextInput from "@/app/common/textInput";

interface DaysData {
    days: Day[]
}

export default function Page({params} : {params: {id: string}}) {
    let streamId = parseInt(params.id)
    const [breakCustomers, setBreakCustomers] = useState(new Map<string, Map<string, PackageEvent[]>>())
    const [eventsCount, setEventsCount] = useState(0)
    const [highBidTeamCount, setHighBidTeamCount] = useState(0)
    const [amountMap, setAmountMap] = useState<any|null>(null)
    const [amountMapRaw, setAmountMapRaw] = useState('')

    useEffect(() => {
        const fetchData = async () => {
            let body = {
                id: streamId
            }
            post(getEndpoints().stream_breaks, body)
                .then(async (breaks: Break[]) => {
                    let newBreakCustomers = new Map<string, Map<string, PackageEvent[]>>()

                    let eventsCountCounter = 0
                    let highBidTeamCounter = 0
                    for (let breakObject of breaks) {
                        let eventBody = {
                            break_id: breakObject.id
                        }
                        if (breakObject.high_bid_team != '') {
                            highBidTeamCounter++
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
                    setHighBidTeamCount(highBidTeamCounter)
                    setBreakCustomers(newBreakCustomers)
                    setEventsCount(eventsCountCounter)
                })
        };

        fetchData();
    }, [])

    function parseAmountMap() {
        if (amountMapRaw == '') {
            return
        }
        let raw = JSON.parse(amountMapRaw)
        setAmountMap(raw)
    }

    let amount = 0
    let amountDiff = 0
    let missingCustomers: string[] = []
    let nonExistingCustomers: string[] = []
    if (amountMap) {
        for (const [key, value] of Object.entries(amountMap)) {
            amount += (value as number)
            if (!breakCustomers.has(key)) {
                missingCustomers.push(key)
            }
        }

        Array.from(breakCustomers.keys()).forEach(i => {
            if ((amountMap as IIndexable)[i] == undefined) {
                nonExistingCustomers.push(i)
            }
        })

        amountDiff = amount - (eventsCount - highBidTeamCount)
    }

    return <div>
        <div >
            <div className='fs-1'>
                Events:
                {eventsCount}
                {amountMap && <span className='text-primary'> {amount} </span>}
                {amountMap && amountDiff > 0 ? <span className='text-danger'>Missing {amountDiff} events</span> : ''}
                {amountMap && amountDiff < 0 ? <span className='text-danger'>Extra {amountDiff * -1} events</span> : ''}
                {amountMap && amountDiff == 0 ? <span className='bg-green'>Correct</span> : ''}
            </div>
            <div className='w-25p'>
                <TextInput params={{
                    value: amountMapRaw,
                    update: setAmountMapRaw,
                    save: parseAmountMap,
                    max_width: 150,
                    font_size: null,
                    placeholder: 'Enter amount data',
                    onClick: null,
                    onBlur: null,
                }}/>
            </div>{
            missingCustomers.length > 0 && <div className='bg-danger'>
                    Missing these customers:
                    {missingCustomers.map(i => <div key={i}>
                        {i} [{(amountMap as IIndexable)[i]}]
                    </div>)}
                </div>
            }
            {
                nonExistingCustomers.length > 0 && <div className='bg-danger'>
                    These customers not exist:
                    {nonExistingCustomers.map(i => <div key={i}>
                        {i}
                    </div>)}
                </div>
            }
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
                        return <CustomerPackageComponent key={i} customer={customer} breaks={breaks} amountMap={amountMap}/>
                    }
                )
            }
        </div>
    </div>
}