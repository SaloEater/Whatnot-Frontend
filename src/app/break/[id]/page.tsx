'use client'

import {BreakComponent} from "@/app/break/[id]/breakComponent";
import React, {useEffect, useState} from "react";
import {Event, WNBreak} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";
import {HighBidOptions, IsNone, Teams} from "@/app/common/teams";
import {BreakSwitchComponent} from "@/app/break/[id]/breakSwitchComponent";
import {ImportBreakComponent} from "@/app/break/[id]/importBreakComponent";

export default function Page({params} : {params: {id: string}}) {
    const breakId = parseInt(params.id)
    const [breakObject, setBreakObject] = useState<WNBreak|null>(null);
    const [newName, setNewName] = useState("")
    const [events, setEvents] = useState<Event[]>([])

    const dateTimeFormat = "YYYY-MM-dd hh:mm a"

    function refreshEvents() {
        post(getEndpoints().break_events, {break_id: breakId})
            .then((resp: {events: Event[]}) => {
                setEvents(resp.events.filter(e => !e.is_giveaway))
            })
    }

    useEffect(() => {
        const body = {
            id: breakId
        }
        post(getEndpoints().break_get, body)
            .then((breakData: WNBreak) => {
                setBreakObject(breakData)
                setNewName(breakData.name)
            })
        refreshEvents()
    }, [])

    function setNewBreakObject(newBreak: WNBreak) {
        let body: WNBreak = {
            id: newBreak.id,
            is_deleted: newBreak.is_deleted,
            day_id: newBreak.day_id,
            name: newBreak.name,
            start_date: newBreak.start_date,
            end_date: newBreak.end_date,
            high_bid_team: newBreak.high_bid_team,
            giveaway_team: newBreak.giveaway_team,
            high_bid_floor: newBreak.high_bid_floor
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
        if (team == "None") {
            team = ''
        }
        let newO = {...breakObject}
        newO.high_bid_team = team
        setNewBreakObject(newO)
    }

    function updateGiveawayTeam(team: string) {
        if (!breakObject) {
            return
        }
        let newO = {...breakObject}
        newO.giveaway_team = team
        setNewBreakObject(newO)
    }

    function updateHighBidFloor(floor: number) {
        if (!breakObject) {
            return
        }
        let newO = {...breakObject}
        newO.high_bid_floor = floor
        setNewBreakObject(newO)
    }

    return <div>
        {
            breakObject && <div>
                <div className='d-flex justify-content-between'>
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
                            <div>High Bid Team:</div>
                            <div className="dropdown">
                                <button className="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton1"
                                        data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                                    {breakObject.high_bid_team == '' ? 'Select' : breakObject.high_bid_team}
                                </button>
                                <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                                    {
                                        HighBidOptions.map(i => <li key={i} onClick={_ => updateHighBidTeam(i)}
                                                           className={`dropdown-item ${IsNone(breakObject.high_bid_team) == i ? 'active' : ''}`}>{i}</li>)
                                    }
                                </ul>
                            </div>
                        </div>
                        <div>
                            <div>Giveaway Team:</div>
                            <div className="dropdown">
                                <button className="btn btn-secondary dropdown-toggle" type="button" id="dropdownMenuButton1"
                                        data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
                                    {breakObject.giveaway_team == '' ? 'Select' : breakObject.giveaway_team}
                                </button>
                                <ul className="dropdown-menu cursor-pointer" aria-labelledby="dropdownMenuButton1">
                                    {
                                        Teams.map(i => <li key={i} onClick={_ => updateGiveawayTeam(i)}
                                                           className={`dropdown-item ${breakObject.giveaway_team == i ? 'active' : ''}`}>{i}</li>)
                                    }
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="d-flex align-items-end gap-2">
                        <ImportBreakComponent breakId={breakId} events={events} onImported={refreshEvents}/>
                        {breakObject && <BreakSwitchComponent currentBreak={breakObject}/>}
                    </div>
                </div>
                <BreakComponent breakObject={breakObject} updateHighBidFloor={updateHighBidFloor}/>
            </div>
        }
    </div>
}