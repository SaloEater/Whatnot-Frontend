// Frozen defaults for the board:sport_style layout element (sport-style-board-plan.md §3). The
// line knobs (`FIELD`) are NOT operator-editable — they are the playground's (/obs/setup/sport_
// style/board) current default values, copied here as constants rather than read live from that
// page. `DEFAULT_TURF`/`DEFAULT_PATCH` are the element's fallback when an operator hasn't pasted a
// recipe of their own (SportStyleBoard.tsx merges a pasted `turf`/`patch` blob over these).

import type { TurfParams } from './turfTexture'
import type { GeneralSettings } from './PatchCell'

/** Geometry/line knobs, frozen from /obs/setup/sport_style/board's DEFAULTS (page.tsx). */
export const FIELD = {
    edgeGap: 60,
    lineWFactor: 0.035,
    tickHFactor: 0.14,
    seamTickHFactor: 0.14,
    ticksPerColumn: 4,
    ticksAreaHeight: 36,
    turfMargin: 0,
    // Whether the interior-row-seam hash ticks (fieldGeometry.ts's `seamTicks`) render at all — the
    // playground's "Seam ticks" checkbox default; unlike the geometry knobs above this is not a
    // `FieldInput` field (see fieldGeometry.ts's header for why).
    seamTicks: true,
    tickWSameAsLine: true,
    lineOpacity: 0.85,
}

/** Cells per row, absent an operator-set `element.cols`. */
export const DEFAULT_COLS = 10

/** Turf recipe, absent an operator-pasted `element.turf` — the board playground's own DEFAULTS.turf*
 *  values (page.tsx), plus `enabled` (the playground's separate `turfEnabled` knob, folded into the
 *  same object here since the element has no other place to carry it). `seed` is deliberately
 *  absent: the element never reads a pasted `seed` (sport-style-board-plan.md §4.4) — it always
 *  rolls its own per-page-load `seeds.turf` (SportStyleBoard.tsx, R1 fix 6). */
export const DEFAULT_TURF: TurfParams & {
    enabled: boolean
    edgeGap: number
    ticksAreaHeight: number
    turfMargin: number
    tickHFactor: number
    seamTickHFactor: number
    // Whether the interior-row-seam hash ticks render (the playground's "Seam ticks" checkbox,
    // exported with the recipe) — see fieldGeometry.ts's header for why this rides in the turf
    // blob rather than being a `FieldInput` field.
    seamTicks: boolean
    // Oval-field knobs (sport-style-board-plan.md R2.1) — ride in the same turf recipe JSON as
    // `edgeGap` above; no dedicated element config field, no dedicated settings input.
    cornerWidth: number
    cornerRoundness: number
    borderWidth: number
} = {
    enabled: true,
    // Field edge → outer strips, px (the playground's "Edge gap" knob, exported with the recipe).
    edgeGap: FIELD.edgeGap,
    // How far the column strips extend beyond the outer row strips, above/below the grid, px (the
    // playground's "Ticks area height" knob, exported with the recipe).
    ticksAreaHeight: FIELD.ticksAreaHeight,
    // Extra turf beyond the ticks-area band, on every side, px (the playground's "Turf extra
    // margin" knob, exported with the recipe).
    turfMargin: FIELD.turfMargin,
    // Hash-tick height as a fraction of cellPx (the playground's "Tick height factor" knob).
    tickHFactor: FIELD.tickHFactor,
    // Seam-tick height as a fraction of cellPx (the playground's "Seam tick height factor" knob) —
    // independent of `tickHFactor` above; see fieldGeometry.ts's `seamTickHFactor` doc.
    seamTickHFactor: FIELD.seamTickHFactor,
    // Interior-row-seam hash ticks on/off (the playground's "Seam ticks" checkbox).
    seamTicks: FIELD.seamTicks,
    // Horizontal corner radius, px (R2.1 `rx`, before clamping to half the field width).
    cornerWidth: 120,
    // Vertical corner radius, as a fraction of half the field height (R2.1 `ry`); 0 = square
    // corner, 1 = a full quarter-ellipse.
    cornerRoundness: 1,
    // White border drawn just inside the field's edge, px; 0 renders no border.
    borderWidth: 6,
    dark: '#1e3a08',
    light: '#8fb457',
    baseLum: 0.55,
    stripeStrength: 0.08,
    stripePeriod: 1,
    patchScale: 1,
    patchContrast: 0.25,
    octaves: 3,
    anisotropy: 1.5,
    grainStrength: 0.03,
    spotCount: 18,
    spotRadiusMin: 0.6,
    spotRadiusMax: 2.0,
    spotStrength: 0.18,
    spotLightRatio: 0.6,
}

/** Patch style, absent an operator-pasted `element.patch` — the team playground's own
 *  `defaultPatchStyle` (PatchCell.tsx) wrapped in the same `GeneralSettings` shape the team page
 *  exports/imports, minus `grainSeed` (per-render, not a style knob). */
export const DEFAULT_PATCH: GeneralSettings = {
    style: {
        padding: 8,
        radius: 22,
        rhombusSize: 3.5,
        rhombusSpacing: 2,
        rhombusOpacity: 0.28,
        rhombusColor: 'dark',
        stitchInset: 9,
        stitchWidth: 2.2,
        stitchStyle: 'dashed',
        stitchDash: 7,
        stitchGap: 4,
        stitchOpacity: 0.95,
        stitchShadow: true,
        edgeWear: 'fade',
        edgeFadeLighten: 0.35,
        edgeFadeDesaturate: 0.5,
        edgeFadeOpacity: 0.55,
        edgeFadeFeather: 3,
        edgeGrainFrequency: 0.9,
        edgeGrainOctaves: 2,
        edgeGrainOpacity: 0.45,
        edgeGrainScale: 1,
        edgeGrainGain: 3,
        edgeGrainBias: 1.8,
        innerShadow: true,
        innerShadowGap: 1,
        innerShadowWidth: 2,
        innerShadowOpacity: 0.45,
        innerShadowBlur: 0.6,
        logoScale: 0.72,
        logoShadowX: 0,
        logoShadowY: 3,
        logoShadowBlur: 3,
        logoShadowOpacity: 0.6,
        logoContactShadow: 0.5,
        logoLift: 1,
        vignette: 0.35,
        edgeShadow: true,
        soldRingShade: 0.30,
        soldSilhouetteShade: 0.40,
        soldKeepWeave: true,
        soldGreyMin: 0,
        soldGreyMax: 0.5,
        soldKeepColor: false,
    },
    mixEnabled: true,
    mixRatio: 0.3,
    stitchMode: 'logo',
    stitchMinContrast: 4.5,
    stitchMinLuminance: 0.35,
}

/** The cell size `PatchStyle`'s px-valued fields (including `padding`) are authored/tuned at —
 *  `scalePatchStyle.ts` scales every such field by `patchSize / PATCH_REFERENCE_SIZE` so a patch
 *  drawn at any other cell size keeps the same proportions, and `patchSizeFor` (same file) derives
 *  `patchSize` itself from a footprint and `padding` at this same reference. */
export const PATCH_REFERENCE_SIZE = 160
