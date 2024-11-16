import {Event, NoCustomer} from "@/app/entity/entities";
import {IsTeam} from "@/app/common/teams";

export function filterOnlyTeams(events: Event[]) {
    return events.filter(e => !e.is_giveaway && !e.note)
}

export function filterOnlyGiveaways(events: Event[]) {
    return events.filter(e => e.is_giveaway)
}

export function getEventWithHighestPrice(events: Event[]) {
    let event = events.reduce((acc: Event|null, event) => acc != null ? (event.price > acc.price ? event : acc) : event, null)
    return (event?.price ?? 0) > 0 ? event : null
}

export function filterOnlyTakenTeams(events: Event[]) {
    return events.filter(e => e.customer != '')
}

export function sortByIndex(events: Event[]) {
    return events.sort((a, b) => {
        if (!IsTeam(a.team)) return 1;
        if (!IsTeam(b.team)) return -1;
        if (a.index > b.index) return 1
        if (a.index < b.index) return -1
        return 0
    })
}

export function sortByIndexAscTeamAsc(events: Event[]) {
    let customerSorted = sortByIndex(events.filter(i => i.customer != ''))
    let teamSorted = sortByTeamName(events.filter(i => i.customer == ''))

    return [...customerSorted, ...teamSorted]
}

export function sortByIndexDescTeamAsc(events: Event[]) {
    let customerSorted = sortByIndex(events.filter(i => i.customer != '')).reverse()
    let teamSorted = sortByTeamName(events.filter(i => i.customer == ''))

    return [...customerSorted, ...teamSorted]
}

export function sortByTeamAscIndexDesc(events: Event[]) {
    let teamSorted = sortByTeamName(events.filter(i => i.customer == ''))
    let customerSorted = sortByIndex(events.filter(i => i.customer != '')).reverse()

    return [...teamSorted, ...customerSorted]
}

export function sortByTeamName(events: Event[]) {
    return events.sort((a, b) => {
        if (!IsTeam(a.team)) return 1;
        if (!IsTeam(b.team)) return -1;
        if (a.team > b.team) return 1
        if (a.team < b.team) return -1
        return 0
    })
}

export function filterOnlyEmptyTeams(events: Event[]) {
    return events.filter(e => e.customer == '')
}

export function onlyWithUsernames(arr: Event[]) {
    return arr.filter(i => i.customer != '' && i.customer != NoCustomer);
}