'use client'

import {useRouter, useSearchParams} from 'next/navigation'
import React, {ChangeEventHandler, useEffect, useState} from "react";
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
    PackageEvent, GiveawayTypeSlab, ReportUser, ReportUserFailed, PackageUsersData, PackageUserData
} from "@/app/entity/entities";
import {get, getEndpoints, post} from "@/app/lib/backend";
import {CustomerPackageComponent, IIndexable} from "@/app/package/[id]/customerPackage";
import {TextInput} from "@/app/common/textInput";
import {sortBreaksById} from "@/app/common/breaks";
import Papa from "papaparse";
import {getGiveawayType, isGiveaway} from "@/app/utils/whatnot_product";

interface DaysData {
    days: Day[]
}

export default function Page({params} : {params: {id: string}}) {
    let streamId = parseInt(params.id)
    const [breakCustomers, setBreakCustomers] = useState(new Map<string, Map<string, PackageEvent[]>>())
    const [eventsCount, setEventsCount] = useState(0)
    const [highBidTeamCount, setHighBidTeamCount] = useState(0)
    const [packageUsersData, setPackageUsersData] = useState<PackageUsersData|null>(null)
    const [giveawayAmount, setGiveawayAmount] = useState<Map<number, number>>(new Map<number, number>())
    const [file, setFile] = useState<File|null>(null)
    const [missingCustomers, setMissingCustomers] = useState<string[]>([])
    const [nonExistingCustomers, setNonExistingCustomers] = useState<string[]>([])
    const [amountDiff, setAmountDiff] = useState(0)
    const [packageUsersDataLength, setPackageUsersDataLength] = useState(0)

    useEffect(() => {
        if (file) {
            let parse = (data: ReportUser[]) => {
                let map: PackageUsersData = {data: new Map<string, PackageUserData>()}
                let packageUsersDataLength = 0
                data.forEach(i => {
                    if (i.cancelled_or_failed.toLowerCase() == ReportUserFailed) {
                        return
                    }
                    packageUsersDataLength++
                    let customer = i.buyer;
                    if (!map.data.has(customer)) {
                        map.data.set(customer, {
                            giveawayQuantity: 0,
                            giveawayTypes: new Map<number, number>(),
                            totalQuantity: 0,
                            auctionQuantity: 0,
                        })
                    }
                    let customerData = map.data.get(customer) as PackageUserData
                    let quantity = parseInt(i.product_quantity)
                    customerData.totalQuantity += quantity
                    let isGiveawayProduct = isGiveaway(i.product_name)
                    if (isGiveawayProduct) {
                        customerData.giveawayQuantity += quantity
                        let type = getGiveawayType(i.product_name)
                        if (!customerData.giveawayTypes.has(type)) {
                            customerData.giveawayTypes.set(type, 0)
                        }
                        let typeQuantity = customerData.giveawayTypes.get(type) as number
                        customerData.giveawayTypes.set(type, typeQuantity + quantity)
                    } else {
                        customerData.auctionQuantity += quantity
                    }
                })
                setPackageUsersData(map)
                setPackageUsersDataLength(packageUsersDataLength)
            }

            Papa.parse<ReportUser>(file, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    parse(results.data)
                },
                transformHeader(header: string, index: number): string {
                    return header.trim().replaceAll(' ', '_')
                }
            });
        }
    }, [file]);

    useEffect(() => {
        if (packageUsersData) {
            let missingCustomers: string[] = []
            packageUsersData.data.forEach((value, key) => {
                if (!breakCustomers.has(key)) {
                    missingCustomers.push(key)
                }
            })
            setMissingCustomers(missingCustomers)

            let nonExistingCustomers: string[] = []
            Array.from(breakCustomers.keys()).forEach(i => {
                if (!packageUsersData.data.has(i)) {
                    nonExistingCustomers.push(i)
                }
            })
            setNonExistingCustomers(nonExistingCustomers)
        }
    }, [packageUsersData]);

    useEffect(() => {
        if (packageUsersData) {
            let diff = packageUsersDataLength - (eventsCount - highBidTeamCount)
            setAmountDiff(diff)
        }
    }, [missingCustomers, nonExistingCustomers])

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

    function getGiveawayTypeFullName(type: number) {
        return type == GiveawayTypeSlab ? 'Slab' : 'Pack';
    }

    function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (e.target.files) {
            setFile(e.target.files[0])
        }
    }

    return <div>
        <div >
            <div className='fs-1'>
                Events:
                {eventsCount}
                {packageUsersData && <span><span className='text-primary'> {packageUsersDataLength} </span> (<span className='text-secondary'>{highBidTeamCount}</span>)</span>}
                {packageUsersData && amountDiff > 0 ? <span className='text-danger'>Missing {amountDiff} events</span> : ''}
                {packageUsersData && amountDiff < 0 ? <span className='text-danger'>Extra {amountDiff * -1} events</span> : ''}
                {packageUsersData && amountDiff == 0 ? <span className='bg-green'>Correct</span> : ''}
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
            <div>
                <input type="file" accept=".csv" onChange={e => handleFileUpload(e)}/>
            </div>
            {
                missingCustomers.length > 0 && <div className='bg-danger'>
                    Missing these customers:
                    {missingCustomers.map(i => <div key={i}>
                        {i} [{packageUsersData?.data.get(i)?.totalQuantity ?? 0}]
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
                        return <CustomerPackageComponent key={i} customer={customer} breaks={breaks} packageUserData={packageUsersData?.data.get(customer)}/>
                    }
                )
            }
        </div>
    </div>
}