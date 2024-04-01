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