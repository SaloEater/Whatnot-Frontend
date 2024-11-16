// @ts-ignore
import {useEffect, useState} from "react";
import {Event} from "@/app/entity/entities";
import {filterOnlyTakenTeams, sortByIndex, sortByTeamName} from "@/app/common/event_filter";
import './swapComponent.css'

export default function SwapComponent({params}: {params: {
    swapTeams: (a: Event[], b: Event[]) => void,
    events: Event[],
    onClose: () => void,
}}) {
    const [sourceTeams, setSourceTeams] = useState<Event[]>([])
    const [targetTeams, setTargetTeams] = useState<Event[]>([])

    let sortedTeams = sortByTeamName(params.events)
    let onlyTakenTeams = filterOnlyTakenTeams(sortedTeams)
    let sourceTeamsAll = sourceTeams.length > 0 ? onlyTakenTeams.filter((e) => e.customer == sourceTeams[0].customer) : onlyTakenTeams
    let targetTeamsAll = targetTeams.length > 0 ? sortedTeams.filter((e) => e.customer == targetTeams[0].customer) : (sourceTeams.length > 0 ? sortedTeams.filter((e) => e.customer != sourceTeams[0].customer) : sortedTeams)

    function isSourceTeam(event: Event) {
        return sourceTeams.find((e) => e.id === event.id) != undefined
    }

    function isTargetTeam(event: Event) {
        return targetTeams.find((e) => e.id === event.id) != undefined
    }

    function switchSourceTeam(event: Event) {
        let index = sourceTeams.findIndex((e) => e.id == event.id)
        let isExist = index != -1
        if (isExist) {
            setSourceTeams((old) => {
                let newTeams = [...old]
                newTeams.splice(index, 1)
                if (newTeams.length == 0) {
                    setTargetTeams([])
                }
                return newTeams
            })
        } else {
            setSourceTeams((old) => {
                let newTeams = [...old]
                newTeams.push(event)
                return newTeams
            })
        }
    }

    function switchTargetTeam(event: Event) {
        let index = targetTeams.findIndex((e) => e.id == event.id)
        let isExist = index != -1
        if (isExist) {
            setTargetTeams((old) => {
                let newTeams = [...old]
                newTeams.splice(index, 1)
                return newTeams
            })
        } else {
            setTargetTeams((old) => {
                let newTeams = [...old]
                newTeams.push(event)
                return newTeams
            })
        }
    }

    function swapTeams() {
        if (sourceTeams.length > 0 && targetTeams.length > 0) {
            params.swapTeams(sourceTeams, targetTeams)
            params.onClose()
        }
    }

    return <div className="swap-popup-overlay">
        <div className='d-flex align-items-start w-75p'>
            <div className="swap-popup d-flex w-100p">
                <div className='d-flex justify-content-between w-90p'>
                    <div className="h-75v w-50p">
                        {
                            sourceTeamsAll.map((event: Event, j, arr) => {
                                let itemStyle = isSourceTeam(event) ? 'swap-item-taken' : 'swap-item-available'
                                return (
                                    <div key={event.id} className='swap-popup-item d-flex justify-content-center gap-1' onClick={
                                        e => switchSourceTeam(event)
                                    }>
                                        <div className={'border-dashed w-75p ' + itemStyle}>{`${event.team}`}</div>
                                        <div className='w-25'>{`by "${event.customer}"`}</div>
                                    </div>
                                )
                            })
                        }
                    </div>
                    <div className="h-75v w-50p">
                        {
                            sourceTeams.length > 0 && targetTeamsAll.map((event: Event, j, arr) => {
                                let itemStyle = isTargetTeam(event) ? 'swap-item-taken' : 'swap-item-available'
                                return (
                                    <div key={event.id} className='swap-popup-item d-flex justify-content-center gap-1' onClick={
                                        e => switchTargetTeam(event)
                                    }>
                                        <div className={'border-dashed w-75p ' + itemStyle}>{`${event.team}`}</div>
                                        <div className='w-25'>{`by "${event.customer}"`}</div>
                                    </div>
                                )
                            })
                        }
                    </div>
                </div>
                {
                    sourceTeams.length> 0 && targetTeams.length > 0 && <div>
                        <button className='btn btn-primary' onClick={swapTeams}>Swap</button>
                    </div>
                }
            </div>
            <button className="swap-close-button" onClick={params.onClose}>Close</button>
        </div>
    </div>
}