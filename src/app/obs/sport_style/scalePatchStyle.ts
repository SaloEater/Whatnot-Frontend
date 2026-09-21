// Scales a `PatchStyle`'s px-valued fields by one factor, so a patch tuned at
// `PATCH_REFERENCE_SIZE` (fieldConstants.ts) can be drawn at any other cell size while keeping the
// same proportions (sport-style-board-plan.md §4.2). Used by both the board:sport_style layout
// element (`patchSize / PATCH_REFERENCE_SIZE`) and the team playground's small/large/grid previews
// (§6) — the playground previously scaled a handful of these fields itself, each at its own
// hand-picked factor (e.g. rhombus at 0.7 while radius/stitchInset used 0.55); replacing that with
// one shared factor per preview is an accepted simplification (sport-style-board-plan.md §4.2's
// "the team page's inline small/large scaling is replaced by this helper so the two can't drift"),
// not a behaviour-preserving refactor — the previews' proportions shift slightly.
//
// R1 fix 3: `PatchStyle.size` is gone — the rendered size is now a `size` PROP on PatchCell,
// derived by the caller via `patchSizeFor` below. `scalePatchStyle` no longer sets any `size`
// field on its own; it only scales the listed px fields and returns the rest of the style as-is.

import type { PatchStyle } from './PatchCell'
import { PATCH_REFERENCE_SIZE } from './fieldConstants'

// Every field whose value is a px measurement tuned at PATCH_REFERENCE_SIZE. Opacities, colours,
// booleans, mode enums, and frequency/gain/bias knobs (which are not px measurements) are left
// untouched.
const SCALED_FIELDS = [
    'radius',
    'stitchInset',
    'stitchWidth',
    'rhombusSize',
    'rhombusSpacing',
    'stitchDash',
    'stitchGap',
    'innerShadowGap',
    'innerShadowWidth',
    'innerShadowBlur',
    'logoShadowX',
    'logoShadowY',
    'logoShadowBlur',
    'logoLift',
    'edgeFadeFeather',
    'edgeGrainScale',
] as const satisfies readonly (keyof PatchStyle)[]

export function scalePatchStyle(style: PatchStyle, factor: number): PatchStyle {
    const scaled: PatchStyle = { ...style }
    const scaledAsRecord = scaled as unknown as Record<string, number>
    for (const field of SCALED_FIELDS) {
        scaledAsRecord[field] = style[field] * factor
    }
    return scaled
}

/**
 * The rendered patch size for a `footprint` × `footprint` cell given a `padding` tuned at
 * `PATCH_REFERENCE_SIZE` (sport-style-board-plan.md R1 fix 3). `padding` scales proportionally
 * with the footprint — the same convention every field in `SCALED_FIELDS` follows — then is
 * subtracted from both sides. Shared by the board:sport_style element (§4.2, `cellPx` as the
 * footprint) and the team playground's previews/show-all grid (§6) so the two can't drift.
 */
export function patchSizeFor(footprint: number, padding: number): number {
    return footprint - 2 * Math.round((padding * footprint) / PATCH_REFERENCE_SIZE)
}
