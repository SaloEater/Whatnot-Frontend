// Shared deterministic PRNG helpers: FNV-1a string hashing plus a mulberry32 generator seeded
// from a 32-bit integer. wearRandom.ts (edge-wear randomisation) builds on these so every seeded
// feature here is stable-but-distinct in the same way. Moved alongside wearRandom.ts into
// src/app/obs/sport_style/ (sport-style-board-plan.md §1) — not itself named in the plan's move
// list, but wearRandom.ts imports it, so it has to move too for that import to keep resolving.

export function fnv1a(str: string): number {
    let hash = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return hash >>> 0
}

export function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
