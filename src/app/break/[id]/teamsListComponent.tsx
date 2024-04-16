import {Event} from "@/app/entity/entities";
import {filterOnlyEmptyTeams, filterOnlyTakenTeams, sortByIndex} from "@/app/common/event_filter";
import './teamsListComponent.css'
import {useState} from "react";

export default function TeamsListComponent({params}: {params: {
    events: Event[],
    changeIndex: (event: Event, newIndex: number) => void,
}}) {
    const [sortAsc, setSortAsc] = useState(false)

    function changeSortDir() {
        setSortAsc((old) => !old)
    }

    const eventsSorted = sortByIndex(params.events)
    if (sortAsc) {
        eventsSorted.reverse()
    }
    let emptyTeams = filterOnlyEmptyTeams(eventsSorted)

    function _moveItemUp(event: Event) {
        params.changeIndex(event, event.index + 1)
    }

    function _moveItemDown(event: Event) {
        params.changeIndex(event, event.index - 1)
    }

    function moveItemUp(event: Event) {
        if (sortAsc) {
            _moveItemUp(event)
        } else {
            _moveItemDown(event)
        }
    }

    function moveItemDown(event: Event) {
        if (sortAsc) {
            _moveItemDown(event)
        } else {
            _moveItemUp(event)
        }
    }

    return <div className='rounded rounded-3 border-primary border p-2'>
        <div className='d-flex flex-column align-items-center'>Teams order:</div>
            <div className='text-primary cursor-pointer' onClick={changeSortDir}>{sortAsc ? 'Sort Asc' : 'Sort Desc'}</div>
            Taken <strong>{32 - emptyTeams.length}</strong>
            <ul className='list-group gap-2 pb-5'>
                {
                    filterOnlyTakenTeams(eventsSorted).map((e, j, arr) => <div key={e.id} className='d-flex gap-1'>
                        <div className='d-flex gap-1'>
                            {`${e.index})`}
                            <div className='border-dashed'>{`${e.team}`}</div>
                        </div>
                        <div className='d-flex gap-1'>
                            {j > 0 && <div className='text-primary cursor-pointer' onClick={_ => moveItemUp(e)}>↑</div>}
                            {j < arr.length - 1 && <div className='text-primary cursor-pointer' onClick={_ => moveItemDown(e)}>↓</div>}
                        </div>
                    </div>)
                }
            </ul>
            Left <strong>{emptyTeams.length}</strong>
            <ul className='list-group gap-2'>
                {
                    emptyTeams.map(e => <div key={e.id} className='d-flex gap-1'>
                        -
                        <div className='border-dashed'>{`${e.team}`}</div>
                    </div>)
                }
            </ul>
        <span className='text-primary cursor-pointer' onClick={changeSortDir}>{sortAsc ? 'Sort Asc' : 'Sort Desc'}</span>
    </div>
}