'use client'

import React, {useEffect, useState} from "react";
import {Teams} from "@/app/common/teams";
import {get, getEndpoints, post} from "@/app/lib/backend";
import {Event, Break, GetStreamsResponse, AddBreakResponse, GiveawayTypeNone} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import {sortByIndex} from "@/app/common/event_filter";
import {sortBreaksById} from "@/app/common/breaks";

export default function Page({params} : {params: {id: string}}) {
    let streamId = parseInt(params.id)
    const [breaks, setBreaks] = useState<Break[]>([])
    const [newBreakName, setNewBreakName] = useState("")
    const [newBreaksAmount, setNewBreaksAmount] = useState(1)
    let router = useRouter()

    useEffect(() => {
        let body = {
            id: streamId
        }
        post(getEndpoints().stream_breaks, body)
            .then((breaks: Break[]) => {
                setBreaks(sortBreaksById(breaks))
            })
    }, []);

    async function addNewBreak(name: string = "") {
        let nextName = name == "" ? newBreakName : name
        if (nextName === "") {
            return
        }

        let date = (new Date()).toISOString()
        let body: Break = {
            id: 0,
            day_id: streamId,
            name: nextName,
            start_date: date,
            end_date: date,
            is_deleted: false,
            high_bid_team: '',
            giveaway_team: ''
        }

        return post(getEndpoints().break_add, body)
            .then((response: AddBreakResponse) => {
                setNewBreakName("")
                let promises: any[] = []
                Teams.forEach((teamName, j) => {
                    let eventAddBody: Event = {
                        id: 0,
                        index: j,
                        giveaway_type: GiveawayTypeNone,
                        break_id: response.id,
                        customer: '',
                        price: 0,
                        team: teamName,
                        is_giveaway: false,
                        note: '',
                        quantity: 0

                    }
                    promises.push(post(getEndpoints().event_add, eventAddBody)
                        .then(() => {
                            console.log(`Team ${teamName} added`)
                        })
                    )
                })
                body.id = response.id
                return Promise.all(promises).then(_ => addBreak(body))
            })
    }

    function addBreak(newBreak: Break) {
        setBreaks((old) => {
            let newBreaks = [...old]
            newBreaks.push(newBreak)
            return newBreaks
        })
    }

    function removeBreak(index: number) {
        setBreaks((old) => {
            let newBreaks = [...old]
            newBreaks.splice(index, 1)
            return newBreaks
        })
    }

    function redirectToBreak(id: number) {
        router.push(`/break/${id}`)
    }

    function redirectToDemo() {
        router.push(`/demo/${streamId}`)
    }

    function redirectToOBS() {
        router.push(`/obs/${streamId}`)
    }

    async function addBreaks() {
        let amount = newBreaksAmount
        setNewBreaksAmount(0)
        for (let i = 1; i <= amount; i++) {
            await addNewBreak(`Break ${i}`)
        }
    }

    function redirectToOBSManage() {
        router.push(`/obs/manage/${streamId}`)
    }

    return (
        <main>
            <button type='button' className='btn btn-primary' onClick={redirectToDemo}>Demo</button>
            <button type='button' className='btn btn-primary' onClick={redirectToOBS}>OBS</button>
            <button type='button' className='btn btn-primary' onClick={redirectToOBSManage}>Manage OBS</button>
            <div className="d-flex justify-content-center">
                <div className='pe-3'>
                    <button type="button" className="btn btn-primary" onClick={
                        e => {
                            let href = `/package/${streamId}`
                            router.push(href)
                        }
                    }>Package all</button>
                </div>
                <ul className="list-group">
                    {
                        breaks.map(
                            (breakObject, index, arr) => {
                                return <li key={breakObject.id} className="list-group-item text-white">
                                    <div className="container-fluid">
                                        <div className="row">
                                            <div className="col-1">{index + 1})</div>
                                            <div className="col" onClick={() => redirectToBreak(breakObject.id)}>{breakObject.name}</div>
                                            <div className="col-3">
                                                <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
                                                    async e => {
                                                        const body = {
                                                            id: breakObject.id,
                                                            name: breakObject,
                                                        };
                                                        post(getEndpoints().break_delete, body)
                                                            .then(response => {
                                                                removeBreak(index)
                                                            })
                                                    }
                                                }/>
                                            </div>
                                        </div>
                                    </div>
                                </li>
                            }
                        )
                    }
                    {
                        <li key="add_new" className="list-group-item">
                            <div className='d-flex'>
                                <div className='w-75p'>
                                    <input
                                        className="form-control"
                                        value={newBreakName}
                                        placeholder="Enter break name.."
                                        onChange={e => {
                                            setNewBreakName(e.currentTarget.value)
                                        }
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                addNewBreak();
                                            }
                                        }}
                                    />
                                    <div className="d-flex justify-content-end mt-2">
                                        <button type="button" id="add-btn" className="btn btn-primary" onClick={async e => {addNewBreak()}}>Add</button>
                                    </div>
                                </div>
                                <div className='w-25p'>
                                    <input
                                        className="form-control"
                                        value={newBreaksAmount}
                                        onChange={e => {
                                            let nextValue = parseInt(e.currentTarget.value)
                                            setNewBreaksAmount(isNaN(nextValue) ? 0 : nextValue)
                                        }
                                        }
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                addBreaks();
                                            }
                                        }}
                                    />
                                    <div className="d-flex justify-content-end mt-2">
                                        <button type="button" id="add-btn" className="btn btn-primary" onClick={async e => {addBreaks()}}>Add</button>
                                    </div>
                                </div>
                            </div>
                        </li>
                    }
                </ul>
            </div>
        </main>
    )
}