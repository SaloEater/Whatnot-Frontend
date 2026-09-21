// Extracts a background (textile) colour and a contrasting stitch colour from a logo image.
// Shared module (sport-style-board-plan.md §1): moved out of setup/sport_style/team/ so the team
// playground and the board:sport_style layout element render from the SAME code.

export type RGB = [number, number, number]

export interface PatchPalette {
    background: RGB
    secondary: RGB   // second saturated colour of the logo; mix partner for the background
    stitch: RGB
    candidates: { rgb: RGB; count: number }[]
}

export function rgbToCss([r, g, b]: RGB, alpha = 1): string {
    return alpha === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`
}

export function luminance([r, g, b]: RGB): number {
    const lin = (c: number) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrast(a: RGB, b: RGB): number {
    const la = luminance(a), lb = luminance(b)
    const [hi, lo] = la > lb ? [la, lb] : [lb, la]
    return (hi + 0.05) / (lo + 0.05)
}

export function saturation([r, g, b]: RGB): number {
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    return max === 0 ? 0 : (max - min) / max
}

export function colorDistance(a: RGB, b: RGB): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function hexToRgb(hex: string): RGB {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function darken([r, g, b]: RGB, f: number): RGB {
    return [Math.round(r * (1 - f)), Math.round(g * (1 - f)), Math.round(b * (1 - f))]
}

export function lighten([r, g, b]: RGB, f: number): RGB {
    return [Math.round(r + (255 - r) * f), Math.round(g + (255 - g) * f), Math.round(b + (255 - b) * f)]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ]
}

export function toGrey([r, g, b]: RGB): RGB {
    const level = Math.round(0.299 * r + 0.587 * g + 0.114 * b)
    return [level, level, level]
}

export function shade(grey: RGB, t: number): RGB {
    if (t < 0) return darken(grey, -t)
    if (t > 0) return lighten(grey, t)
    return grey
}

/**
 * Quantise pixels into buckets, drop transparent / near-white pixels (logo backgrounds),
 * and rank buckets by count.
 */
export function extractPalette(img: HTMLImageElement, sample = 96): PatchPalette {
    const canvas = document.createElement('canvas')
    canvas.width = sample
    canvas.height = sample
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(img, 0, 0, sample, sample)
    const { data } = ctx.getImageData(0, 0, sample, sample)

    const step = 24 // bucket size per channel
    const buckets = new Map<string, { sum: [number, number, number]; count: number }>()
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3]
        if (a < 200) continue
        const r = data[i], g = data[i + 1], b = data[i + 2]
        if (r > 235 && g > 235 && b > 235) continue // white background
        const key = `${Math.floor(r / step)}:${Math.floor(g / step)}:${Math.floor(b / step)}`
        const e = buckets.get(key)
        if (e) {
            e.sum[0] += r; e.sum[1] += g; e.sum[2] += b; e.count++
        } else {
            buckets.set(key, { sum: [r, g, b], count: 1 })
        }
    }

    const candidates = Array.from(buckets.values())
        .map(e => ({ rgb: [Math.round(e.sum[0] / e.count), Math.round(e.sum[1] / e.count), Math.round(e.sum[2] / e.count)] as RGB, count: e.count }))
        .sort((a, b) => b.count - a.count)

    if (candidates.length === 0) {
        return { background: [40, 40, 40], secondary: [40, 40, 40], stitch: [230, 230, 230], candidates }
    }

    // Background: most frequent colour that is reasonably saturated and not near-black.
    // Pure black outlines are common in logos and dominate counts, so they are penalised.
    const total = candidates.reduce((s, c) => s + c.count, 0)
    const scored = candidates.map(c => {
        const lum = luminance(c.rgb)
        const sat = saturation(c.rgb)
        let score = c.count / total
        if (lum < 0.02) score *= 0.15           // near-black
        else if (sat < 0.15) score *= 0.4        // grey-ish
        else score *= 1 + sat
        return { ...c, score }
    }).sort((a, b) => b.score - a.score)

    // If the winner is near-black (e.g. Raiders), prefer the next candidate that is not near-black
    // so the textile and inner shadow stay visible. Falls back to black if nothing else exists.
    const NEAR_BLACK = 0.03
    const backgroundIndex = luminance(scored[0].rgb) < NEAR_BLACK
        ? Math.max(0, scored.findIndex(c => luminance(c.rgb) >= NEAR_BLACK && c.count / total > 0.02))
        : 0
    const background = scored[backgroundIndex].rgb

    // Secondary: next saturated colour that is visibly different in hue/lightness from the background.
    // Black outlines and whites are excluded so the mix partner is a real team colour.
    const secondaryCandidate = scored
        .filter((_, i) => i !== backgroundIndex)
        .filter(c => c.count / total > 0.015 && saturation(c.rgb) >= 0.25 && luminance(c.rgb) > 0.02 && colorDistance(c.rgb, background) > 60)[0]
    const secondary: RGB = secondaryCandidate ? secondaryCandidate.rgb : background

    // Stitch: the most saturated logo colour that still contrasts with the background,
    // otherwise fall back to a lightened tint of the background / off-white.
    const stitchCandidate = candidates
        .filter(c => c.count / total > 0.02 && contrast(c.rgb, background) >= 3)
        .sort((a, b) => saturation(b.rgb) - saturation(a.rgb))[0]

    const stitch: RGB = stitchCandidate
        ? stitchCandidate.rgb
        : luminance(background) > 0.4 ? darken(background, 0.6) : [240, 236, 226]

    return { background, secondary, stitch, candidates }
}

export type StitchMode = 'logo' | 'contrast' | 'complement'

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
    const l = (max + min) / 2
    if (max === min) return [0, 0, l]
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h: number
    switch (max) {
        case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break
        case gn: h = (bn - rn) / d + 2; break
        default: h = (rn - gn) / d + 4
    }
    h *= 60
    return [h, s, l]
}

function hslToRgb(h: number, s: number, l: number): RGB {
    if (s === 0) {
        const v = Math.round(l * 255)
        return [v, v, v]
    }
    const hue2rgb = (p: number, q: number, t: number) => {
        let tt = t
        if (tt < 0) tt += 1
        if (tt > 1) tt -= 1
        if (tt < 1 / 6) return p + (q - p) * 6 * tt
        if (tt < 1 / 2) return q
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
        return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    const hn = h / 360
    const r = hue2rgb(p, q, hn + 1 / 3)
    const g = hue2rgb(p, q, hn)
    const b = hue2rgb(p, q, hn - 1 / 3)
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

/** Off-white on dark backgrounds, near-black on light backgrounds. */
export function contrastStitch(background: RGB): RGB {
    return luminance(background) < 0.4 ? [244, 240, 232] : [22, 22, 22]
}

/** Complementary hue of the background, lightened/darkened to clear WCAG AA contrast. */
export function complementStitch(background: RGB): RGB {
    const [h, s, l] = rgbToHsl(background)
    if (s < 0.1) return contrastStitch(background)
    const complementHue = (h + 180) % 360
    const targetLightness = luminance(background) < 0.4 ? 0.85 : 0.15
    return hslToRgb(complementHue, s, targetLightness)
}

export interface StitchOptions {
    minContrast: number
    minLuminance: number
}

/**
 * Picks a stitch colour that stays bright and legible against a given background,
 * since an inner shadow line always sits right next to the stitch.
 */
export function pickStitch(candidates: { rgb: RGB; count: number }[], background: RGB, opts: StitchOptions): RGB {
    const total = candidates.reduce((s, c) => s + c.count, 0)
    if (total === 0) return [244, 240, 232]

    const qualifying = candidates
        .filter(c => c.count / total > 0.015 && luminance(c.rgb) >= opts.minLuminance && contrast(c.rgb, background) >= opts.minContrast)
        .sort((a, b) => saturation(b.rgb) - saturation(a.rgb) || b.count - a.count)

    if (qualifying.length > 0) return qualifying[0].rgb

    const topBySaturation = candidates
        .filter(c => luminance(c.rgb) >= 0.02 && c.count / total > 0.015)
        .sort((a, b) => saturation(b.rgb) - saturation(a.rgb))
        .slice(0, 3)

    for (let step = 1; step <= 9; step++) {
        const f = step * 0.1
        for (const c of topBySaturation) {
            const lightened = lighten(c.rgb, f)
            if (luminance(lightened) >= opts.minLuminance && contrast(lightened, background) >= opts.minContrast) {
                return lightened
            }
        }
    }

    return [244, 240, 232]
}

/** Dispatches to the stitch colour strategy selected by `mode`. */
export function resolveStitch(mode: StitchMode, candidates: { rgb: RGB; count: number }[], background: RGB, opts: StitchOptions): RGB {
    switch (mode) {
        case 'contrast': return contrastStitch(background)
        case 'complement': return complementStitch(background)
        default: return pickStitch(candidates, background, opts)
    }
}
