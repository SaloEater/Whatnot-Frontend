// @ts-ignore
import {useState} from "react";
import {Event} from "@/app/entity/entities";
import {filterOnlyTakenTeams, sortByIndex, sortByTeamName} from "@/app/common/event_filter";
import './orderChangingComponent.css'

export default function SwapComponent({params}: {params: {
    onClose: () => void,
    swapWithTeam: (event: Event) => void,
    events: Event[],
    callingEvent: Event,
}}) {
    const handleItemClick = (item: Event) => {
        params.swapWithTeam(item); // Callback function to handle item click
        params.onClose(); // Close the popup after selecting an item
    };

    return <div className="popup-overlay">
        <div className="popup">
            <button className="close-button" onClick={params.onClose}>Close</button>
            <ul className="item-list d-flex flex-wrap gap-3">
                {sortByTeamName(filterOnlyTakenTeams(params.events)).map((event: Event, j, arr) => (
                   <li key={event.id} className={'popup-item ' + (event.id == params.callingEvent.id ? 'item-taken' : 'item-available')} >
                       {`"${event.team}" by "${event.customer}"`}
                       {
                           event.id != params.callingEvent.id && <button onClick={() => handleItemClick(event)} className="btn btn-primary">Swap</button>
                       }
                   </li>
                 ))}
            </ul>
        </div>
    </div>
}