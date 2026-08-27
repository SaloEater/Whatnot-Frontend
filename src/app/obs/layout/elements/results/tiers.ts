// Price-rank tier ramp for the results grid (overlay-1f-spec.md §4: "the tier frame now says what
// the star said" — a slot's border colour IS its ranking, which is why the design dropped the
// separate gold "★ HIT" badge).
//
// The cuts are copied from the deleted obs/composite/board.ts (`TIER_CUTS` / `tierForRank`,
// recoverable at `git show 9055fc4^:src/app/obs/composite/board.ts`) rather than re-derived, so
// this screen ranks identically to the board that spec was written against.
//
// ⚠️ Ranking is by PRICE, not by outcome — overlay-1f-spec.md §4 flags this explicitly: a
// grey-framed slot that produced a huge card looks the same as one that produced nothing. If an
// outcome signal is ever wanted it needs its own treatment, and must not be gold.

import type { Event } from '@/app/entity/entities'

export type Tier = 'gold' | 'silver' | 'bronze' | 'grey'

/** Zero-based rank boundaries: top 3 gold, next 7 silver, next 10 bronze, the rest grey. */
export const TIER_CUTS = { gold: 3, silver: 10, bronze: 20 } as const

export function tierForRank(rank: number): Tier {
    if (rank < TIER_CUTS.gold) return 'gold'
    if (rank < TIER_CUTS.silver) return 'silver'
    if (rank < TIER_CUTS.bronze) return 'bronze'
    return 'grey'
}

/**
 * The tier every slot gets when the break cannot be ranked: the whole board sits flat on the third
 * tier rather than inventing a hierarchy.
 */
export const NO_SERIES_TIER: Tier = 'bronze'

/**
 * Is there anything real to rank by? Two ways there is not:
 *   - the break has no series, so there is no pricing behind it at all; or
 *   - every slot's price is 0 — which is the common case for a series whose team prices have not
 *     been entered yet. Ranking 34 identical zeroes is not a ranking: `sort` is stable, so the
 *     medal colours would just fall on whichever slots happened to sit first in the array, and the
 *     board would show a confident gold/silver/bronze hierarchy that means nothing.
 */
function isRankable(events: Event[], hasSeries: boolean): boolean {
    return hasSeries && events.some((e) => (e.price ?? 0) > 0)
}

/**
 * Tier per event id, ranked by price descending across the whole break. Computed over the full
 * event list rather than per rendered cell, so a slot's colour does not change when the grid is
 * re-sorted or re-columned — rank is a property of the break, not of the layout.
 *
 * Unsold slots (no customer) are ranked with everything else: they still have an asking price, and
 * suppressing them would silently promote every slot below them.
 *
 * When there is nothing to rank by (see isRankable) no distinction is drawn at all — every slot
 * returns NO_SERIES_TIER.
 */
export function tiersByEventId(events: Event[], hasSeries: boolean): Map<number, Tier> {
    if (!isRankable(events, hasSeries)) {
        return new Map(events.map((e) => [e.id, NO_SERIES_TIER]))
    }
    const ranked = [...events].sort((a, b) => (b.price ?? 0) - (a.price ?? 0))
    return new Map(ranked.map((e, rank) => [e.id, tierForRank(rank)]))
}
