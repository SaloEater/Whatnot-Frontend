import {WNBreak} from "@/app/entity/entities";

export function sortBreaksById(breaks: WNBreak[]) {
    return breaks.sort((i, j) => {
        if (i.id > j.id) return 1
        if (i.id < j.id) return -1
        return 0
    })
}