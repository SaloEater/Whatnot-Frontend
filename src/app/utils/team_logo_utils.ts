import {EmptyObsItem, ObsItem, TeamLogo, TeamLogos} from "@/app/entity/entities";

export function getLogo(logos: TeamLogos, team: string) {
    return logos.logos.find(i => i.team == team)
}

export function isTeamLogoSet(logo: TeamLogo) {
    return isObsItemSet(logo.obsItem)
}

export function isObsItemSet(item: ObsItem) {
    return item.name != EmptyObsItem.name || item.uuid != EmptyObsItem.uuid
}