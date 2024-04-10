import {Event} from "@/app/entity/entities";

export function filterOnlyTeams(events: Event[]) {
    return events.filter(e => !e.is_giveaway && !e.note)
}

export function filterOnlyGiveaways(events: Event[]) {
    return events.filter(e => e.is_giveaway)
}

export function getEventWithHighestPrice(events: Event[]) {
    return events.reduce((acc: Event|null, event) => acc != null ? (event.price > acc.price ? event : acc) : event, null)
}