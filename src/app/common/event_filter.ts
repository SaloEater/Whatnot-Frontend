import {Event, NoCustomer} from "@/app/entity/entities";
import {IsTeam} from "@/app/common/teams";
import {TYPE_NAMES} from "@/app/break/[id]/addNewCardComponent";

export function filterOnlyTeams(events: Event[]) {
    return events.filter(e => !e.is_giveaway && !e.note && !isMiscellaneous(e))
}

export function filterOnlyOther(events: Event[]) {
    return events.filter(e => isMiscellaneous(e))
}

function isMiscellaneous(e: Event) {
    return e.team != '' && !IsTeam(e.team)
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
        // Teams before non-teams; each group alphabetical among itself. The
        // previous comparator returned 1/-1 unconditionally when either side
        // was a non-team, so comparing two non-teams was inconsistent
        // (cmp(a,b) and cmp(b,a) both positive) and their order unspecified.
        if (IsTeam(a.team) !== IsTeam(b.team)) return IsTeam(a.team) ? -1 : 1
        return a.team.localeCompare(b.team)
    })
}

export function filterOnlyEmptyTeams(events: Event[]) {
    return events.filter(e => e.customer == '')
}

export function onlyWithUsernames(arr: Event[]) {
    return arr.filter(i => i.customer != '' && i.customer != NoCustomer);
}