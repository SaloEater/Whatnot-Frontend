// Asset manifest types + resolvers (design doc §8.2). The manifest itself lives
// at /public/images/flat-board-tiles/manifest.json and is loaded at runtime via
// useManifest(); these resolvers are pure functions of that loaded object, so it
// can be swapped without a code deploy.

import {Piece} from "./types"
import {pick} from "./hash"

export interface StyleManifest {
    id: string
    /** Folder under /public, e.g. "/images/flat-board-tiles/skins/style-1". */
    path: string
    weight: number
    /** Number of alt variants available, per tier (1|2|3) and piece. */
    variants: Record<number, Record<Piece, number>>
}

export interface AccentManifest {
    /** Absolute path under /public. */
    file: string
    /** Footprint in tiles [w, h]. */
    footprint: [number, number]
    /** Cell-count tiers this accent may appear in. */
    tiers: number[]
    /** Style ids this accent is compatible with. */
    styles: string[]
    weight: number
}

export interface Manifest {
    /** Authoring canvas size of one tile, px (informational for the engine). */
    tilePx: number
    styles: StyleManifest[]
    accents: AccentManifest[]
}

export function getStyle(m: Manifest, styleId: string): StyleManifest {
    return m.styles.find(s => s.id === styleId) ?? m.styles[0]
}

/** Deterministically choose a style for a group from its stable key. */
export function styleForGroup(m: Manifest, key: string): string {
    return m.styles[pick(m.styles.length, key, 'style')].id
}

/** Resolve the SVG path for a piece given style, tier and 0-based variant index. */
export function piecePath(m: Manifest, styleId: string, tier: number, piece: Piece, variant: number): string {
    return `${getStyle(m, styleId).path}/tier-${tier}/${piece}-${variant + 1}.svg`
}

/** How many variants exist for a piece in a style/tier (min 1). */
export function variantCount(m: Manifest, styleId: string, tier: number, piece: Piece): number {
    return Math.max(1, getStyle(m, styleId).variants[tier]?.[piece] ?? 1)
}

/** Accents eligible for a group of the given tier and style. */
export function eligibleAccents(m: Manifest, tier: number, styleId: string): AccentManifest[] {
    return m.accents.filter(a => a.tiers.includes(tier) && a.styles.includes(styleId))
}
