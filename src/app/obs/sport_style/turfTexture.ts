// football-field-board-plan.md §6 phase 2 sketch — procedurally generated green turf, tuned on
// /obs/setup/sport_style/board. Pure module: no React, no dependencies, touches nothing but the
// `CanvasRenderingContext2D` it is handed. Shared module (sport-style-board-plan.md §1): moved out
// of the board playground's own directory into src/app/obs/sport_style/ so the board:sport_style
// layout element renders from the SAME code the playground shows — that page still imports this
// unchanged.
//
// Physical model reproduced per pixel (see the task spec, not restated in full here):
//   lum = baseLum * (1 + stripe*stripeStrength) * (1 - patch*patchContrast) * (1 + spot)
//         + grain*grainStrength
// then `lum` (clamped to 0..1) is mapped onto a linear RGB ramp from `dark` to `light`. `baseLum`
// is a `TurfParams` knob (default 0.55, "Base brightness" on the playground) rather than a fixed
// constant.
//
// - `stripe` is +1/-1, alternating every `stripePeriod` column(s) of width `cellPx`, anchored so a
//   band boundary always lands on `gridLeft + i*cellPx` and continues with the same period outside
//   the grid (columnIndex is a plain floor-division of `x - gridLeft`, which is well-defined for
//   negative offsets too).
// - `patch` is 2-D value noise (seeded hash lattice, smoothstep interpolation) run through fBm
//   (lacunarity 2, gain 0.5, `octaves` bands), normalised back to ~0..1 by dividing by the
//   amplitude sum, sampled at `(x/(patchScale*cellPx), y/(patchScale*cellPx*anisotropy))` so
//   `anisotropy` > 1 stretches patches along the vertical (mowing) axis.
// - `spot` (task spec part 2) is a layer of random lighter/darker patches, independent of the fBm
//   patch above: `spotCount` ellipses seeded from the same `seed`, each contributing
//   `sign * strength * falloff(d/r)` with `falloff(t) = 1 - smoothstep(0, 1, t)` (1 at the centre,
//   0 at the rim, no visible edge) and zero outside its own radius. See `buildSpots`/`buildSpotMap`
//   below for the precomputation that keeps this cheap even at the max `spotCount`.
// - `grain` is one octave of cheap, uninterpolated per-pixel hashed noise centred on 0 (a second,
//   independent permutation table so it doesn't correlate with the patch fBm).

import type {Rect} from './fieldGeometry'

export interface TurfParams {
    dark: string
    light: string
    baseLum: number
    stripeStrength: number
    stripePeriod: 1 | 2
    patchScale: number
    patchContrast: number
    octaves: number
    anisotropy: number
    grainStrength: number
    /** Number of light/dark spots, 0–60. Default 18. */
    spotCount: number
    /** Spot radius lower bound, in cells (0.2–4). Default 0.6. */
    spotRadiusMin: number
    /** Spot radius upper bound, in cells (0.2–4). Default 2.0. */
    spotRadiusMax: number
    /** Peak luminance multiplier a spot can contribute, 0–0.6. Default 0.18. Each spot jitters
     *  this by 0.6–1.0× (see `buildSpots`). */
    spotStrength: number
    /** Share of spots that are lighter (`sign = +1`) rather than darker (`sign = -1`), 0–1.
     *  Default 0.6. */
    spotLightRatio: number
}

export interface TurfInput {
    width: number
    height: number
    cellPx: number
    gridLeft: number
    cols: number
    seed: number
    params: TurfParams
    /** The region to paint (fieldGeometry.ts's `field`) — pixels outside it are left fully
     *  transparent (alpha 0) so the box shows through around a field narrower than it. */
    field: Rect
}

// ---- seeded PRNG (mulberry32) — used only to build the hash-lattice permutation table below. ----
function mulberry32(seed: number): () => number {
    let a = seed >>> 0
    return function next() {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Seeded permutation table for a hashed lattice (Perlin/value-noise style): a shuffled 0..255
// table, indexed twice (`perm[(perm[x&255] + y) & 255]`) to decorrelate the two axes.
function buildPermutation(seed: number): Uint8Array {
    const rnd = mulberry32(seed)
    const perm = new Uint8Array(256)
    for (let i = 0; i < 256; i++) perm[i] = i
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1))
        const tmp = perm[i]
        perm[i] = perm[j]
        perm[j] = tmp
    }
    return perm
}

function hashLattice(perm: Uint8Array, ix: number, iy: number): number {
    const xi = ix & 255
    const yi = iy & 255
    return perm[(perm[xi] + yi) & 255] / 255
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t)
}

// 2-D value noise on the integer lattice, bilinearly (smoothstep-eased) interpolated. Output in
// [0, 1] since every lattice value is in [0, 1] and interpolation cannot leave that range.
function valueNoise2D(perm: Uint8Array, x: number, y: number): number {
    const ix0 = Math.floor(x)
    const iy0 = Math.floor(y)
    const fx = x - ix0
    const fy = y - iy0
    const ix1 = ix0 + 1
    const iy1 = iy0 + 1

    const h00 = hashLattice(perm, ix0, iy0)
    const h10 = hashLattice(perm, ix1, iy0)
    const h01 = hashLattice(perm, ix0, iy1)
    const h11 = hashLattice(perm, ix1, iy1)

    const sx = smoothstep(fx)
    const sy = smoothstep(fy)

    const nx0 = h00 + (h10 - h00) * sx
    const nx1 = h01 + (h11 - h01) * sx
    return nx0 + (nx1 - nx0) * sy
}

// fBm: lacunarity 2, gain 0.5, normalised back to ~0..1 by dividing the weighted sum by the
// amplitude sum (each octave's noise is itself in [0, 1], so this keeps the result in [0, 1]).
function fbm2D(perm: Uint8Array, x: number, y: number, octaves: number): number {
    let sum = 0
    let ampSum = 0
    let amp = 1
    let freq = 1
    const n = Math.max(1, Math.floor(octaves))
    for (let o = 0; o < n; o++) {
        sum += amp * valueNoise2D(perm, x * freq, y * freq)
        ampSum += amp
        amp *= 0.5
        freq *= 2
    }
    return ampSum > 0 ? sum / ampSum : 0
}

// ---- spot layer (task spec part 2) ----

interface Spot {
    cx: number
    cy: number
    /** Horizontal radius, px. */
    rx: number
    /** Vertical radius, px — `rx * aspect` with `aspect` in [1, 2), so spots read as stretched
     *  mown-grass patches rather than perfect circles. */
    ry: number
    /** +1 (lighter) or -1 (darker). */
    sign: number
    /** Peak strength for this spot, already jittered (0.6–1.0 × `params.spotStrength`). */
    strength: number
}

// Draws `spotCount` spots with centres anywhere inside `field`, allowed up to one radius outside
// it so a spot can be clipped by the field's edge (task spec: "allow centres up to one radius
// outside so spots can be clipped by the edge"). Radii are uniform in `[spotRadiusMin,
// spotRadiusMax] * cellPx`; each spot independently rolls its sign (`spotLightRatio` share are
// light) and a 0.6–1.0x strength jitter.
function buildSpots(rnd: () => number, field: Rect, cellPx: number, params: TurfParams): Spot[] {
    const {spotCount, spotRadiusMin, spotRadiusMax, spotStrength, spotLightRatio} = params
    const n = Math.max(0, Math.min(60, Math.floor(spotCount)))
    const safeCellPx = cellPx > 0 ? cellPx : 1
    const spots: Spot[] = []
    for (let i = 0; i < n; i++) {
        const r = (spotRadiusMin + rnd() * (spotRadiusMax - spotRadiusMin)) * safeCellPx
        const aspect = 1 + rnd() // stretch 1–2x along the vertical/mowing axis
        const rx = Math.max(0.5, r)
        const ry = Math.max(0.5, r * aspect)
        const cx = field.x - rx + rnd() * (field.w + 2 * rx)
        const cy = field.y - ry + rnd() * (field.h + 2 * ry)
        const sign = rnd() < spotLightRatio ? 1 : -1
        const strength = (0.6 + rnd() * 0.4) * spotStrength
        spots.push({cx, cy, rx, ry, sign, strength})
    }
    return spots
}

// Precomputes the per-pixel spot contribution into a `width*height` map, once, so the main pixel
// pass below is a single array read per pixel instead of a loop over up to 60 spots. Each spot
// only touches the pixels inside its own (field-clipped) elliptical bounding box, so the total
// work stays proportional to the spots' on-screen area rather than `spotCount * width * height`.
function buildSpotMap(width: number, height: number, field: Rect, spots: Spot[]): Float32Array {
    const map = new Float32Array(width * height)
    const clipX0 = Math.max(0, field.x)
    const clipX1 = Math.min(width, field.x + field.w)
    const clipY0 = Math.max(0, field.y)
    const clipY1 = Math.min(height, field.y + field.h)

    for (const s of spots) {
        const x0 = Math.max(clipX0, Math.floor(s.cx - s.rx))
        const x1 = Math.min(clipX1, Math.ceil(s.cx + s.rx))
        const y0 = Math.max(clipY0, Math.floor(s.cy - s.ry))
        const y1 = Math.min(clipY1, Math.ceil(s.cy + s.ry))
        for (let y = y0; y < y1; y++) {
            const dy = (y + 0.5 - s.cy) / s.ry
            const rowBase = y * width
            for (let x = x0; x < x1; x++) {
                const dx = (x + 0.5 - s.cx) / s.rx
                const t = Math.sqrt(dx * dx + dy * dy)
                if (t >= 1) continue
                const falloff = 1 - smoothstep(t)
                map[rowBase + x] += s.sign * s.strength * falloff
            }
        }
    }
    return map
}

function parseHexColor(hex: string): [number, number, number] {
    const h = hex.replace('#', '')
    const r = parseInt(h.substring(0, 2), 16)
    const g = parseInt(h.substring(2, 4), 16)
    const b = parseInt(h.substring(4, 6), 16)
    return [r, g, b]
}

export function renderTurf(ctx: CanvasRenderingContext2D, input: TurfInput): void {
    const {width, height, cellPx, gridLeft, seed, params, field} = input
    const {
        dark, light, baseLum, stripeStrength, stripePeriod, patchScale, patchContrast,
        octaves, anisotropy, grainStrength,
    } = params

    if (width <= 0 || height <= 0) return

    const [dr, dg, db] = parseHexColor(dark)
    const [lr, lg, lb] = parseHexColor(light)

    const perm = buildPermutation(seed)
    // A second, independent permutation for the grain hash so it never correlates with the patch
    // fBm (same seed, different constant XORed in — still fully determined by `seed`).
    const grainPerm = buildPermutation((seed ^ 0x9e3779b9) >>> 0)
    // A third, independent PRNG stream for the spot layer — same seed (so Regenerate re-rolls
    // spots along with everything else), different constant XORed in so it doesn't consume/collide
    // with the permutation-table shuffles above.
    const spotRnd = mulberry32((seed ^ 0x2545f491) >>> 0)

    const safeCellPx = cellPx > 0 ? cellPx : 1
    const patchDenomX = Math.max(1e-6, patchScale * safeCellPx)
    const patchDenomY = Math.max(1e-6, patchScale * safeCellPx * anisotropy)

    const spots = buildSpots(spotRnd, field, safeCellPx, params)
    const spotMap = buildSpotMap(width, height, field, spots)

    // `createImageData` zero-fills the buffer, i.e. alpha 0 everywhere — pixels outside `field`
    // below are simply never written, so they stay transparent and the box shows through.
    const imageData = ctx.createImageData(width, height)
    const data = imageData.data

    const fx0 = Math.max(0, Math.floor(field.x))
    const fx1 = Math.min(width, Math.ceil(field.x + field.w))
    const fy0 = Math.max(0, Math.floor(field.y))
    const fy1 = Math.min(height, Math.ceil(field.y + field.h))

    for (let y = fy0; y < fy1; y++) {
        const ny = y / patchDenomY
        const rowBase = y * width
        for (let x = fx0; x < fx1; x++) {
            const columnIndex = Math.floor((x - gridLeft) / safeCellPx)
            const bandIndex = Math.floor(columnIndex / stripePeriod)
            const parity = ((bandIndex % 2) + 2) % 2
            const stripe = parity === 0 ? 1 : -1

            const patch = fbm2D(perm, x / patchDenomX, ny, octaves)
            const grain = hashLattice(grainPerm, x, y) * 2 - 1
            const spot = spotMap[rowBase + x]

            let lum = baseLum * (1 + stripe * stripeStrength) * (1 - patch * patchContrast) * (1 + spot)
                + grain * grainStrength
            if (lum < 0) lum = 0
            else if (lum > 1) lum = 1

            const p = (rowBase + x) * 4
            data[p] = Math.round(dr + (lr - dr) * lum)
            data[p + 1] = Math.round(dg + (lg - dg) * lum)
            data[p + 2] = Math.round(db + (lb - db) * lum)
            data[p + 3] = 255
        }
    }

    ctx.putImageData(imageData, 0, 0)
}
