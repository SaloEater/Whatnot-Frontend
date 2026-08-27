// Accent placement: fill a group with ONE accent repeated in a regular,
// mirror-symmetric spread. Per axis:
//   • If a perfectly centered position exists ((available - footprint) even),
//     the layout is CENTER-ANCHORED: one accent sits exactly in the middle and
//     the others are placed around it at ±k·(footprint+gap). Count is odd.
//   • Otherwise the layout is margin-anchored and palindromic: the right half
//     mirrors the left (x' = available - footprint - x); an odd leftover tile
//     lands in the center, never at an edge.
//
// Thin groups (1 cell thick) draw from the tier-1 accent pool (small "line"
// accents that fit the 3-tile thickness); 2D groups use their size tier's pool.
//
// All placements are snapped to INTEGER tile coordinates: an accent always
// starts exactly at a tile boundary and (since footprints are whole tiles)
// ends exactly at one, so accent art aligns with the skin tiles beneath it.

import {Group, PlacedAccent} from "./types"
import {AccentManifest, eligibleAccents, Manifest} from "./manifest"
import {rng, seedFrom} from "./hash"

const TILES_PER_CELL = 3
// Minimum gap between accents, in tiles (tunable).
const MIN_GAP = 1

// Max copies along an axis with `gap` before, between and after them:
// (n+1)*gap + n*footprint <= available  →  n <= (available - gap)/(footprint + gap)
function maxCount(available: number, footprint: number, gap: number): number {
    return Math.floor((available - gap) / (footprint + gap))
}

// Positions of items of size `footprint` along `available` tiles, spaced by
// `gap`, symmetric about the axis center. Empty array = nothing fits.
function axisPositions(available: number, footprint: number, gap: number): number[] {
    if (footprint + 2 * gap > available) return []

    if ((available - footprint) % 2 === 0) {
        // Center-anchored: one item exactly in the middle, pairs around it.
        const c = (available - footprint) / 2
        const step = footprint + gap
        const k = Math.floor((c - gap) / step) // pairs that keep ≥ gap margins
        const xs: number[] = []
        for (let i = k; i >= 1; i--) xs.push(c - i * step)
        xs.push(c)
        for (let i = 1; i <= k; i++) xs.push(c + i * step)
        return xs
    }

    // No integer center exists → an item can never sit ON the center, so the
    // count must be EVEN: mirrored pairs straddling the center (an odd count
    // would force one item off-center with lopsided gaps around it). The odd
    // leftover tile widens the center gap, between the two innermost items.
    const n = maxCount(available, footprint, gap) & ~1
    if (n < 2) return []
    const content = n * footprint + (n - 1) * gap
    const margin = Math.floor((available - content) / 2)
    const xs = new Array<number>(n)
    for (let i = 0; i < n / 2; i++) {
        xs[i] = margin + i * (footprint + gap)
        xs[n - 1 - i] = available - footprint - xs[i]
    }
    return xs
}

function weightedPick(items: AccentManifest[], rand: () => number): AccentManifest {
    const total = items.reduce((s, a) => s + a.weight, 0)
    let t = rand() * total
    for (const a of items) {
        t -= a.weight
        if (t <= 0) return a
    }
    return items[items.length - 1]
}

// Groups smaller than this get no accents at all (1-3 cell groups stay clean).
const MIN_CELLS_FOR_ACCENTS = 4

export function placeAccents(m: Manifest, group: Group, styleId: string): PlacedAccent[] {
    if (group.cells < MIN_CELLS_FOR_ACCENTS) return []

    const rowsCells = group.r1 - group.r0 + 1
    const colsCells = group.c1 - group.c0 + 1
    const W = colsCells * TILES_PER_CELL
    const H = rowsCells * TILES_PER_CELL

    // Thin groups use the tier-1 ("line") accent pool; 2D groups their own tier.
    const thin = rowsCells === 1 || colsCells === 1
    const poolTier = thin ? 1 : group.tier

    // Pool: eligible accents that fit at least once on both axes.
    const eligible = eligibleAccents(m, poolTier, styleId)
    const pool = eligible
        .map(a => ({
            accent: a,
            xs: axisPositions(W, a.footprint[0], MIN_GAP),
            ys: axisPositions(H, a.footprint[1], MIN_GAP),
        }))
        .filter(f => f.xs.length >= 1 && f.ys.length >= 1)
    if (pool.length === 0) return []

    // Choose exactly one accent for the whole group (deterministic per group).
    const rand = rng(seedFrom(group.key + ':accents'))
    const chosen = weightedPick(pool.map(f => f.accent), rand)
    const {xs, ys} = pool.find(f => f.accent === chosen)!
    const [fw, fh] = chosen.footprint

    const placed: PlacedAccent[] = []
    for (const y of ys) {
        for (const x of xs) {
            placed.push({file: chosen.file, tileX: x, tileY: y, tilesW: fw, tilesH: fh})
        }
    }
    return placed
}
