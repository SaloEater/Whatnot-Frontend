'use client'

import {useRouter, useSearchParams} from 'next/navigation'
import React, {useEffect, useState} from "react";
import {daysAreEqual} from "@/app/common/helpers";
import {router} from "next/client";
import "./page.css"
import {
    WNBreak,
    Day,
    GetStreamsStream,
    GetStreamsResponse,
    Event,
    GetEventsByBreakResponse,
    PackageEvent, GiveawayTypeSlab
} from "@/app/entity/entities";
import {get, getEndpoints, post} from "@/app/lib/backend";
import {CustomerPackageComponent, IIndexable} from "@/app/package/[id]/customerPackage";
import {TextInput} from "@/app/common/textInput";
import {sortBreaksById} from "@/app/common/breaks";

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
    const [giveawayAmount, setGiveawayAmount] = useState<Map<number, number>>(new Map<number, number>())

    useEffect(() => {
        const fetchData = async () => {
            let body = {
                id: streamId
            }
            post(getEndpoints().stream_breaks, body)
                .then(async (breaks: WNBreak[]) => {
                    let giveaways = new Map<number, number>()
                    let newBreakCustomers = new Map<string, Map<string, PackageEvent[]>>()

                    let eventsCountCounter = 0
                    let highBidTeamCounter = 0
                    breaks = sortBreaksById(breaks)
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

                            if (packageEvent.is_giveaway) {
                                giveaways.set(packageEvent.giveaway_type, (giveaways.get(packageEvent.giveaway_type) ?? 0) + 1)
                            }
                        }
                        eventsCountCounter += events.events.length
                    }
                    setHighBidTeamCount(highBidTeamCounter)
                    setBreakCustomers(newBreakCustomers)
                    setEventsCount(eventsCountCounter)
                    setGiveawayAmount(giveaways)
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

    function getGiveawayTypeFullName(type: number) {
        return type == GiveawayTypeSlab ? 'Slab' : 'Pack';
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
            <div>
                Giveaways:
                {
                    Array.from(giveawayAmount.entries()).map((mapData) => {
                        return <div key={mapData[0]}>
                            {getGiveawayTypeFullName(mapData[0])}: {mapData[1]}
                        </div>
                    })
                }
            </div>
            <div className='w-25p'>
                <TextInput
                    value={amountMapRaw}
                    update={setAmountMapRaw}
                    save={parseAmountMap}
                    font_size={null}
                    placeholder={'Enter amount data'}
                    onClick={null}
                    onBlur={null}
                    disabled={false}
                />
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