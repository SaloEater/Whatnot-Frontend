// Per-tier neon edge skins for the `board:sport_style` tiered edge (sport-style-board-plan.md
// R3.2, reworked to match `board:cobra_flat`'s neon language instead of a brushed-metal medal).
// A tiered edge replaces PatchCell's auto-palette edge wear ring with a flat neon fill plus a
// matching glow and stitch colour, so a team that lands on `best`/`good`/`mid`/`regular` on the
// cobra boards (board-cobra/pricing.ts's `Tier`) reads with the SAME neon identity there and here —
// colours are copied verbatim from CobraFlatBoard.css's `--neon`/`--neon-soft`/`--neon-vivid` tier
// variables so the two boards stay visually in sync. Shared by PatchCell.tsx (the `edgeTier` prop)
// and the team playground's Edge select + Tiered demo checkbox; nothing here is
// board:sport_style-element-specific.

import type { RGB } from './patchColors'
import type { Tier } from '@/app/obs/layout/elements/board-cobra/pricing'

export type EdgeTier = 'best' | 'good' | 'mid' | 'regular'

export interface TierSkin {
    // Flat ring fill colour — CobraFlatBoard.css's `--neon` for this tier.
    neon: string
    // Glow colour (outer bloom + inner halo's soft term) — `--neon-soft` for this tier.
    neonSoft: string
    // Stitch thread colour — `--neon-vivid` for this tier, as RGB.
    stitch: RGB
    // `full` = outer bloom + inner halo (best/good, CobraFlatBoard.css's `.cbf-cell` box-shadow);
    // `inner` = inner halo only (mid, `.cbf-cell--mid`'s override); `none` = no glow at all
    // (regular, `.cbf-cell--regular`'s `box-shadow: none` override).
    glow: 'full' | 'inner' | 'none'
}

// Colours copied verbatim from CobraFlatBoard.css's `.cbf-cell--{best,good,mid,regular}` variable
// blocks — tune there first if the cobra boards' own neon ever changes, then mirror it here.
export const TIER_SKINS: Record<EdgeTier, TierSkin> = {
    best: {
        neon: '#9eedf6',
        neonSoft: 'rgba(158,237,246,0.45)',
        stitch: [25, 95, 194],
        glow: 'full',
    },
    good: {
        neon: '#2ef079',
        neonSoft: 'rgba(46,240,121,0.45)',
        stitch: [26, 217, 100],
        glow: 'full',
    },
    mid: {
        neon: '#f25d26',
        neonSoft: 'rgba(242,93,38,0.45)',
        stitch: [240, 44, 2],
        glow: 'inner',
    },
    regular: {
        neon: '#ebdb61',
        neonSoft: 'rgba(235,219,97,0.45)',
        stitch: [212, 196, 71],
        glow: 'none',
    },
}

// `best` -> best, `good` -> good, `mid` -> mid, `regular` -> regular — every cobra tier now maps
// onto its own neon skin, so a tiered edge never falls back to the plain auto-palette look.
export const EDGE_TIER_BY_TIER: Record<Tier, EdgeTier> = {
    best: 'best',
    good: 'good',
    mid: 'mid',
    regular: 'regular',
}
