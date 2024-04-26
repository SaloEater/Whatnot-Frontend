'use client'

import {BreakComponent} from "@/app/break/[id]/breakComponent";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import moment from "moment/moment";
import React, {useEffect, useState} from "react";
import {Break} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";
import {useRouter} from "next/navigation";
import {Teams} from "@/app/common/teams";

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
            high_bid_team: newBreak.high_bid_team,
        }
        return post(getEndpoints().break_update, body)
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

    function updateHighBidTeam(team: string) {
        if (!breakObject) {
            return
        }
        let newO = {...breakObject}
        newO.high_bid_team = team
        setNewBreakObject(newO)
    }

    return <div>
        {
            breakObject && <div>
                <div className="d-flex align-items-end gap-2">
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
                        <div>High Bid Team:</div>
                        <div className="dropdown">
                            <button className="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton1" data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                                {breakObject.high_bid_team == '' ? 'Select' : breakObject.high_bid_team}
                            </button>
                            <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                                {
                                    Teams.map(i => <li key={i} onClick={_ => updateHighBidTeam(i)} className={`dropdown-item ${breakObject.high_bid_team == i ? 'active' : ''}`}>{i}</li>)
                                }
                            </ul>
                        </div>
                    </div>
                </div>
                <BreakComponent breakObject={breakObject}/>
            </div>
        }
    </div>
}