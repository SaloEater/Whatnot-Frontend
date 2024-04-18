'use client'

import {BreakComponent} from "@/app/break/[id]/breakComponent";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment from "moment/moment";
import React, {useEffect, useState} from "react";
import {Break} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";
import {useRouter} from "next/navigation";

export default function Page({params} : {params: {id: string}}) {
    const breakId = parseInt(params.id)
    const [breakObject, setBreakObject] = useState<Break|null>(null);
    const [newName, setNewName] = useState("")

    const dateTimeFormat = "YYYY-MM-dd hh:mm a"

    useEffect(() => {
        const body = {
            id: breakId
        }
        post(getEndpoints().break_get, body)
            .then((breakData: Break) => {
                setBreakObject(breakData)
                setNewName(breakData.name)
            })
    }, [])

    function setNewBreakObject(newBreak: Break) {
        let body = {
            id: newBreak.id,
            name: newBreak.name,
            start_date: newBreak.start_date,
            end_date: newBreak.end_date,
        }
        post(getEndpoints().break_update, body)
            .then(response => {
                if (response.success) {
                    setBreakObject(newBreak)
                }
            })
    }

    function setBreakStartDate(startDateUnix: string) {
        if (!breakObject) {
            return
        }

        let newBreak = {...breakObject}
        newBreak.start_date = startDateUnix

        setNewBreakObject(newBreak)
    }

    function setBreakEndDate(endDateUnix: string) {
        if (!breakObject) {
            return
        }

        let newBreak = {...breakObject}
        newBreak.end_date = endDateUnix

        setNewBreakObject(newBreak)
    }

    function changeNewName(e: React.ChangeEvent<HTMLInputElement>) {
        setNewName(e.target.value)
    }

    function updateNewName() {
        if (!breakObject) {
            return
        }

        let newBreak = {...breakObject}
        newBreak.name = newName

        setNewBreakObject(newBreak)
    }

    let router = useRouter()

    function redirectToOBS() {
        if (!breakObject) {
            return
        }

        router.push(`/obs/${breakObject.id}`)
    }

    return <div>
        {
            breakObject && <div>
                <div className="d-flex align-items-center">
                    <div>
                        <div>
                            Name
                        </div>
                        <input type="text" value={newName} onChange={e => changeNewName(e)} onKeyUp={e => {
                            if (e.key === 'Enter') {
                                updateNewName()
                            }
                        }} onBlur={updateNewName}/>
                    </div>
                    <div>
                        Start Date
                        <TuiDateTimePicker
                            handleChange={async e => {
                                let date = moment(e, dateTimeFormat.toUpperCase()).utc(false)
                                const startDateUnix = date.toISOString()
                                setBreakStartDate(startDateUnix)
                            }}
                            format={dateTimeFormat}
                            date={new Date(breakObject.start_date)}
                            inputWidth="auto"
                        />
                    </div>
                    <div>
                        End Date
                        <TuiDateTimePicker
                            handleChange={async e => {
                                let date = moment(e, dateTimeFormat.toUpperCase()).utc(false)
                                const endDateUnix = date.toISOString()
                                setBreakEndDate(endDateUnix)
                            }}
                            format={dateTimeFormat}
                            date={new Date(breakObject.end_date)}
                            inputWidth="auto"
                        />
                    </div>
                    <div>
                        <button type='button' className='btn btn-primary' onClick={redirectToOBS}>OBS</button>
                    </div>
                </div>
                <BreakComponent breakObject={breakObject}/>
            </div>
        }
    </div>
}