import {FC} from "react";
import {Event} from "@/app/entity/entities";
import {filterOnlyTakenTeams} from "@/app/common/event_filter";

interface DataProps {
    events: Event[]
}

export const DataComponent: FC<DataProps> = (props) => {
    let takenTeams = filterOnlyTakenTeams(props.events)

    function getHighestBid() {
        return takenTeams.reduce((acc, i) => i.price > acc ? i.price : acc, 0)
    }

    function getAverageBid() {
        return Math.round(takenTeams.reduce((acc, i) => acc + i.price, 0) / takenTeams.length)
    }

    function getTotal() {
        return takenTeams.reduce((acc, i) => acc + i.price, 0)
    }

    return <div className='border border-primary rounded rounded-3 border-1'>
        {takenTeams.length > 0 && <div className='border border-1 p-1'>Highest bid: <b className='fs-2'>{getHighestBid()}</b></div>}
        {takenTeams.length > 0 && <div className='border border-1 p-1'>Average bid for <b className='fs-5'>{takenTeams.length}</b> teams: <b className='fs-2'>{getAverageBid()}</b></div>}
        {takenTeams.length > 0 && <div className='border border-1 p-1'>Total: <b className='fs-2'>{getTotal()}</b></div>}
    </div>
}