'use client'

import React, {useEffect, useState} from "react";
import {Teams} from "@/app/common/teams";
import {getEndpoints, post} from "@/app/lib/backend";
import {AddBreakResponse, Event, GiveawayTypeNone, WNBreak} from "@/app/entity/entities";
import {useRouter} from "next/navigation";
import {sortBreaksById} from "@/app/common/breaks";
import {useStream} from "@/app/hooks/useStream";
import {AddBreakWizardComponent} from "@/app/stream/[id]/addBreakWizardComponent";

export default function Page({params} : {params: {id: string}}) {
    let streamId = parseInt(params.id)
    let [stream, refreshStream] = useStream(streamId)
    const [breaks, setBreaks] = useState<WNBreak[]>([])
    const [toastMessage, setToastMessage] = useState<string | null>(null)
    let router = useRouter()

    useEffect(() => {
        let body = {
            id: streamId
        }
        post(getEndpoints().stream_breaks, body)
            .then((breaks: WNBreak[]) => {
                setBreaks(sortBreaksById(breaks))
            })
    }, []);

    async function addNewBreak(name: string, customSpots: string[] = []) {
        if (!name) return

        let date = (new Date()).toISOString()
        let body: WNBreak = {
            high_bid_floor: 0,
            id: 0,
            day_id: streamId,
            name,
            start_date: date,
            end_date: date,
            is_deleted: false,
            high_bid_team: '',
            giveaway_team: ''
        }

        return post(getEndpoints().break_add, body)
            .then((response: AddBreakResponse) => {
                let chain = Promise.resolve()
                const allSpots = [...Teams, ...customSpots]
                allSpots.forEach((teamName, j) => {
                    chain = chain.then(() => {
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
                        return post(getEndpoints().event_add, eventAddBody)
                    })
                })
                body.id = response.id
                return chain.then(() => {
                    addBreak(body)
                    setToastMessage(`All events added for ${body.name}`)
                    setTimeout(() => setToastMessage(null), 3000)
                })
            })
    }

    function addBreak(newBreak: WNBreak) {
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

    return (
        <main>
            {toastMessage && <div className='position-fixed top-0 start-50 translate-middle-x mt-3 alert alert-success z-3'>
                {toastMessage}
            </div>}
            <div className="d-flex justify-content-center">
                <div className='pe-3'>
                    <div>
                        <button type="button" className="btn btn-primary" onClick={
                            e => {
                                let href = `/package/${streamId}`
                                router.push(href)
                            }
                        }>Package all
                        </button>
                    </div>
                    <div>
                        <button type="button" className={`btn ${!!stream && !stream.is_ended ? 'btn-primary' : 'btn-danger'}`} disabled={!!stream && stream.is_ended} onClick={
                            _ => {
                                post(getEndpoints().notify_stream_ended, {stream_id: streamId}).then(refreshStream)
                            }
                        }>{!!stream && !stream.is_ended ? 'End stream' : 'Stream ended'}
                        </button>
                    </div>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}/import`)}>
                            Import livestream
                        </button>
                    </div>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}/import-giveaways`)}>
                            Import giveaways
                        </button>
                    </div>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}/verify-teams`)}>
                            Verify teams
                        </button>
                    </div>
                    <div>
                        <button type="button" className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}/verify-giveaways`)}>
                            Verify giveaways
                        </button>
                    </div>
                </div>
                <div className="d-flex flex-column">
                    <ul className="list-group">
                        {
                            breaks.map(
                                (breakObject, index) => {
                                    return <li key={breakObject.id} className="list-group-item text-white">
                                        <div className="container-fluid">
                                            <div className="row">
                                                <div className="col" onClick={() => redirectToBreak(breakObject.id)}>{breakObject.name}</div>
                                            </div>
                                        </div>
                                    </li>
                                }
                            )
                        }
                    </ul>
                    <AddBreakWizardComponent onAdd={addNewBreak}/>
                </div>
            </div>
        </main>
    )
}