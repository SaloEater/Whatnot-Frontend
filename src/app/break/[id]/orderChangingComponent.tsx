// @ts-ignore
import {useState} from "react";
import {Event} from "@/app/entity/entities";
import {filterOnlyTakenTeams, sortByIndex} from "@/app/common/event_filter";
import './orderChangingComponent.css'

export default function OrderChangingComponent({params}: {params: {
    onClose: () => void,
    moveTeamAfter: (event: Event|null) => void,
    events: Event[],
    callingEvent: Event,
}}) {
    const handleItemClick = (item: Event|null) => {
        params.moveTeamAfter(item); // Callback function to handle item click
        params.onClose(); // Close the popup after selecting an item
    };

    return <div className="popup-overlay">
        <div className="popup">
            <button className="close-button" onClick={params.onClose}>Close</button>
            <ul className="item-list">
                {
                    params.callingEvent.index != 1 && <li key='first'>
                        <button onClick={() => handleItemClick(null)} className="btn btn-primary">Move here</button>
                    </li>
                }
                {sortByIndex(filterOnlyTakenTeams(params.events)).map((event: Event, j, arr) => (
                   <li key={event.id} className={(event.id == params.callingEvent.id ? 'bg-info' : '')} >
                       <div>{`${event.index}) "${event.team}" by "${event.customer}"`}</div>
                       {
                           !((j + 1 < arr.length && arr[j+1].id == params.callingEvent.id) || event.id == params.callingEvent.id) && <button onClick={() => handleItemClick(event)} className="btn btn-primary">Move here</button>
                       }
                   </li>
                 ))}
            </ul>
        </div>
    </div>
}