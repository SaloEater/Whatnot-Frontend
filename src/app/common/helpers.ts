import {Day} from "@/app/entity/entities";

export function daysAreEqual(a: Day | null, b: Day | null) {
    if (!a && !b) {
        return true
    }

    if (!a || !b) {
        return false
    }

    return a.date.year === b.date.year && a.date.month === b.date.month && a.date.day === b.date.day;
}

export function sortStringsAlphabetically(arr: string[]) {
    return arr.sort((a, b) => {
        if (a > b) return 1
        if (a < b) return -1
        return 0
    })
}

export function arrayUnique(arr: any[]) {
    return arr.filter((i, j, arr) => i != '' && arr.indexOf(i) === j);
}