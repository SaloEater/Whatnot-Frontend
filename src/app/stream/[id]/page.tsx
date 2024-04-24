'use client'

import React, {useEffect, useState} from "react";
import {Teams} from "@/app/common/teams";
import {get, getEndpoints, post} from "@/app/lib/backend";
import {Break, GetStreamsResponse, AddBreakResponse} from "@/app/entity/entities";
import {useRouter} from "next/navigation";

export default function Page({params} : {params: {id: string}}) {
    let streamId = parseInt(params.id)
    const [breaks, setBreaks] = useState<Break[]>([])
    const [newBreakName, setNewBreakName] = useState("")
    let router = useRouter()

    useEffect(() => {
        let body = {
            id: streamId
        }
        post(getEndpoints().stream_breaks, body)
            .then((breaks: Break[]) => {
                setBreaks(breaks)
            })
    }, []);

    async function addNewBreak() {
        if (newBreakName === "") {
            return
        }

        let date = (new Date()).toISOString()
        let body: Break = {
            id: 0,
            day_id: streamId,
            name: newBreakName,
            start_date: date,
            end_date: date,
            is_deleted: false,
            high_bid_team: '',
        }

        post(getEndpoints().break_add, body)
            .then((response: AddBreakResponse) => {
                setNewBreakName("")
                Teams.forEach((teamName) => {
                    let eventAddBody = {
                        break_id: response.id,
                        customer: '',
                        price: 0,
                        team: teamName,
                        is_giveaway: false,
                        note: '',
                        quantity: 0,
                    }
                    post(getEndpoints().event_add, eventAddBody)
                        .then(() => {
                            console.log(`Team ${teamName} added`)
                        })
                })
                body.id = response.id
                addBreak(body)
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

    return (
        <main>
            <button type='button' className='btn btn-primary' onClick={redirectToDemo}>Demo</button>
            <button type='button' className='btn btn-primary' onClick={redirectToOBS}>OBS</button>
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
                        </li>
                    }
                </ul>
            </div>
        </main>
    )
}