import {Event} from "@/app/entity/entities";
import {sortByIndex} from "@/app/common/event_filter";
import './teamsListComponent.css'
import {useState} from "react";

export default function TeamsListComponent({params}: {params: {
    events: Event[]
}}) {
    const [sortAsc, setSortAsc] = useState(false)

    function changeSortDir() {
        setSortAsc((old) => !old)
    }

    const eventsSorted = sortByIndex(params.events)
    if (sortAsc) {
        eventsSorted.reverse()
    }

    return <div className='rounded rounded-3 border-primary border p-2'>
        <div className='d-flex flex-column align-items-center'>Teams order:</div>
        <span className='text-primary cursor-pointer' onClick={changeSortDir}>{sortAsc ? 'asc' : 'desc'}</span>
            <ul className='list-group gap-2'>
                {
                    eventsSorted.map(e => <div className='d-flex gap-1'>
                        {`${e.index})`}
                        <div className='item-teams-order'>{`${e.team}`}</div>
                    </div>)
                }
            </ul>
        <span className='text-primary cursor-pointer' onClick={changeSortDir}>{sortAsc ? 'asc' : 'desc'}</span>
    </div>
}