import {GiveawayTypePack, GiveawayTypeSlab} from "@/app/entity/entities";

export function isGiveaway(name: string, pattern: string = 'giveaway') {
return name.toLowerCase().indexOf(pattern.toLowerCase()) !== -1;
}

export function getGiveawayType(name: string) {
    return (name.toLowerCase().indexOf('slb') !== -1 || name.toLowerCase().indexOf('mag') !== -1) ? GiveawayTypeSlab : GiveawayTypePack ;
}
