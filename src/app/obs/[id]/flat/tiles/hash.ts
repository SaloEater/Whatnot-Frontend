// Deterministic seeding so style / variant / accent choices are stable across
// re-renders (no flicker as the board polls). No Math.random anywhere.

/** xmur3 string hash → 32-bit seed. */
export function seedFrom(str: string): number {
    let h = 1779033703 ^ str.length
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
        h = (h << 13) | (h >>> 19)
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
}

/** mulberry32 PRNG → function returning floats in [0,1). */
export function rng(seed: number): () => number {
    let a = seed >>> 0
    return function () {
        a |= 0
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Deterministic index in [0, count) from string parts. */
export function pick(count: number, ...parts: (string | number)[]): number {
    if (count <= 1) return 0
    return seedFrom(parts.join(':')) % count
}
