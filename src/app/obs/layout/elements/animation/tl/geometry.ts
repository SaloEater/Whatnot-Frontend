// Band/copy geometry for the timeline build of stash-or-pass. Ported unchanged in behaviour from
// StashOrPassWrap.tsx — the original element got this part right and the rebuild is about time,
// not space. Kept out of choreography.ts so the choreography reads as pure timing.

import type { Box } from '../../../schema'

export type BandSide = 'top' | 'right' | 'bottom' | 'left'

/** Orbit order = reading order of spec §5's table = the direction the circuit travels. */
export const BAND_ORDER: BandSide[] = ['top', 'right', 'bottom', 'left']

export const BAND_ROTATION: Record<BandSide, number> = { top: 0, right: 90, bottom: 0, left: -90 }

/**
 * Whether the shared scroll keyframe plays in reverse. top/right/left all scroll "locally
 * rightward" (rotation turns that into rightward / downward / upward on screen); `bottom` is the
 * one spec §5 calls out as NOT rotated 180° — it stays upright and scrolls the other way.
 */
export const BAND_REVERSE: Record<BandSide, boolean> = { top: true, right: true, bottom: false, left: true }

/** spec §6 Register: ivory/gold/bronze/mid-gold stand in for an RGB chromatic split. */
export const COPY_COLORS: Record<BandSide, string> = {
    top: 'var(--soptl-ivory)',
    right: 'var(--soptl-gold-bright)',
    bottom: 'var(--soptl-bronze)',
    left: 'var(--soptl-gold-mid)',
}

export function bandRect(box: Box, pad: number, t: number, side: BandSide): Box {
    switch (side) {
        case 'top':
            return { x: box.x - pad - t, y: box.y - pad - t, w: box.w + 2 * pad + 2 * t, h: t }
        case 'bottom':
            return { x: box.x - pad - t, y: box.y + box.h + pad, w: box.w + 2 * pad + 2 * t, h: t }
        case 'left':
            return { x: box.x - pad - t, y: box.y - pad, w: t, h: box.h + 2 * pad }
        case 'right':
            return { x: box.x + box.w + pad, y: box.y - pad, w: t, h: box.h + 2 * pad }
    }
}

/** Mid-lane — where a copy lands, because the copy BECOMES that lane's stream. */
export function bandCenter(box: Box, pad: number, t: number, side: BandSide): { x: number; y: number } {
    const r = bandRect(box, pad, t, side)
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

export function boxCenter(box: Box): { x: number; y: number } {
    return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

/**
 * How far into its corner a copy drifts during the fan, as a fraction of the box's half-size.
 * (Spec §2's literal "12px apart" stack reads as one blurry clump at board scale — the original
 * element replaced it with this on the user's direction and the rebuild keeps that.)
 */
export const CORNER_FRACTION = 0.25

/** The four diagonals, in BAND_ORDER (top/right/bottom/left -> UL/UR/DR/DL). */
export const DIAGONALS: Array<[number, number]> = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
]

/** Where copy `index` sits during the fan, relative to the centre of the wrapped box. */
export function fanOffset(index: number, box: Box): { x: number; y: number } {
    const dir = DIAGONALS[index % DIAGONALS.length]
    return { x: dir[0] * (box.w / 2) * CORNER_FRACTION, y: dir[1] * (box.h / 2) * CORNER_FRACTION }
}

/**
 * Headline size for the impact word and the copies split from it. PHRASE is 13 characters —
 * ~0.085 of the box width keeps it clear of the edges, capped by height so a short wide box
 * cannot overflow.
 */
export function headlineSize(box: Box): number {
    return Math.round(Math.min(box.w * 0.085, box.h * 0.22))
}
