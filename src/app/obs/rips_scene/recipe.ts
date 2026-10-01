// The `ripsScene` recipe (rips-scene-plan.md §3): every tunable number of the scene in one nested
// object. Produced by /obs/setup/rips_scene, carried in the layout config as an opaque blob
// (schema.ts's `recipe?: unknown`) and read ONLY through `mergeRecipe` below.
//
// Units (plan §1): every length is stage px (a 1080-wide canvas; the renderer scales by w / 1080),
// except sky-cloud pivots, which are the image's own native px. Angles are degrees, clockwise
// positive; rotation speeds are deg/s, scroll speeds are stage px/s.

export type SkyCloud = {
    enabled: boolean
    width: number // rendered width, stage px (height follows the image aspect)
    x: number // offset of the PIVOT from the box's horizontal centre (0 = pivot on the centre line)
    y: number // top edge of the image at rotation 0
    pivotX: number
    pivotY: number // image px
    rotation: number // degrees the cloud is turned around its pivot before it starts moving
    copies: number // how many identical images of the art chase each other around the pivot (1..12)
    gap: number // degrees between one copy and the next; ignored when copies is 1 (a full turn)
    speed: number // deg/s, 0 = static
}

export type MiddleCloud = {
    enabled: boolean
    width: number
    x: number
    y: number // top-left of a copy at angle 0
    // Degrees the WHOLE cloud (both copies, their pivot and their sweep) is turned as one piece,
    // about the centre of where a section's image sits at angle 0. Joins between sections are
    // unaffected, so the section offsets never need retuning after a tilt.
    tilt: number
    // true: the pivot is the centre of the art's own arc (assets.ts's MIDDLE_CLOUD_ARC_CENTRE),
    // recomputed from x/y/width — the cloud simply circles. false: pivotX/pivotY below are used.
    autoPivot: boolean
    pivotX: number
    pivotY: number // STAGE px (not image px); pivotY is expected to be negative
    speed: number // deg/s, 0 = static
    gap: number // degrees between consecutive sections
    // The join rule, applied to EVERY newly joined section relative to the one before it (the
    // "second" in the names is historical — it began as a rule for the second copy only):
    secondOffsetX: number // stage px shift, in the previous section's own frame
    secondOffsetY: number
}

export type FrontCloud = {
    enabled: boolean
    width: number // width of one tile, stage px
    y: number // top edge of the strip
    speed: number // px/s, scrolls left; 0 = static
    overlap: number // px each tile overlaps the previous one
    offset: number // px the strip starts already scrolled by
}

// The layer a glow is painted directly IN FRONT of. Everything further forward covers it.
export const GLOW_DEPTHS = ['background', 'skyClouds', 'middleCloud', 'mountain', 'frontBack', 'frontFront'] as const
export type GlowDepth = (typeof GLOW_DEPTHS)[number] // 'frontFront' = in front of everything

// How a glow mixes with what is painted beneath it:
//   add      — adds its colour as light (the original behaviour); black does nothing
//   screen   — a softer add that cannot blow out to pure white; black does nothing
//   normal   — plain cover: the colour is laid over the scene at `strength`; BLACK DIMS what is behind
//   multiply — darkens and tints: white does nothing, black dims, a colour dims everything but itself
export const GLOW_MODES = ['add', 'screen', 'normal', 'multiply'] as const
export type GlowMode = (typeof GLOW_MODES)[number]

// x/y = centre; strength 0..1; color "#rrggbb"
export type Glow = { x: number; y: number; radius: number; strength: number; color: string; depth: GlowDepth; mode: GlowMode }

export type RipsSceneRecipe = {
    background: { enabled: boolean }
    skyClouds: SkyCloud[] // always exactly 4, index = paint order (0 is furthest back)
    middleCloud: MiddleCloud
    mountain: { enabled: boolean; width: number; x: number; bottom: number }
    frontBack: FrontCloud // painted behind frontFront
    frontFront: FrontCloud
    glows: Glow[] // any length, including 0
}

// The rotating layers' numbers are rough estimates from the art, tuned by eye on the setup page
// (plan §3). pivot 280 / -1700 and gap 41 come from fitting a circle to the arc in MiddleCloud.png;
// `overlap: 36` is the art's two transparent side margins (36 + 30 native px) at width 1080, rounded up so
// the hard-cut edges overlap by a hair rather than leave a 1 px gap.
export const DEFAULT_RIPS_RECIPE: RipsSceneRecipe = {
    background: { enabled: true },
    skyClouds: [
        { enabled: true, width: 1300, x: 0, y: -200, pivotX: 1780, pivotY: 292, rotation: 0, copies: 1, gap: 90, speed: 1.2 },
        { enabled: true, width: 1150, x: 0, y: -150, pivotX: 1780, pivotY: 292, rotation: 0, copies: 1, gap: 90, speed: 1.6 },
        { enabled: true, width: 1000, x: 0, y: -100, pivotX: 1780, pivotY: 292, rotation: 0, copies: 1, gap: 90, speed: 2.0 },
        { enabled: true, width: 850, x: 0, y: -50, pivotX: 1780, pivotY: 292, rotation: 0, copies: 1, gap: 90, speed: 2.4 },
    ],
    middleCloud: {
        enabled: true, width: 1600, x: -260, y: 150, tilt: 0,
        autoPivot: true, pivotX: 280, pivotY: -1700, speed: 1, gap: 45,
        secondOffsetX: 0, secondOffsetY: 0,
    },
    mountain: { enabled: true, width: 1080, x: 0, bottom: 0 },
    frontBack: { enabled: true, width: 1080, y: 430, speed: 20, overlap: 36, offset: 540 },
    frontFront: { enabled: true, width: 1080, y: 470, speed: 28, overlap: 36, offset: 0 },
    glows: [],
}

export const DEFAULT_GLOW: Glow = { x: 540, y: 0, radius: 300, strength: 0.6, color: '#ff5a2a', depth: 'frontFront', mode: 'add' }

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Shallow-merge `raw` over `base`, but per field: a value whose type does not match the default's
 *  (number must be finite, boolean must be boolean, string must be a string) keeps the default. */
function mergeFields<T extends object>(base: T, raw: unknown): T {
    if (!isPlainObject(raw)) return base
    const out = {...base} as Record<string, unknown>
    for (const key of Object.keys(base)) {
        const def = (base as Record<string, unknown>)[key]
        const v = raw[key]
        if (typeof def === 'number') {
            if (typeof v === 'number' && Number.isFinite(v)) out[key] = v
        } else if (typeof def === 'boolean') {
            if (typeof v === 'boolean') out[key] = v
        }
    }
    return out as T
}

function mergeGlow(raw: unknown): Glow {
    const glow = mergeFields(DEFAULT_GLOW, raw)
    const r = raw as Record<string, unknown>
    const color = typeof r.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.color) ? r.color : DEFAULT_GLOW.color
    const depth = (GLOW_DEPTHS as readonly unknown[]).includes(r.depth) ? (r.depth as GlowDepth) : DEFAULT_GLOW.depth
    const mode = (GLOW_MODES as readonly unknown[]).includes(r.mode) ? (r.mode as GlowMode) : DEFAULT_GLOW.mode
    return {...glow, color, depth, mode}
}

/** The middle cloud's pivot in stage px, before `tilt`: the art's own arc centre when `autoPivot`
 *  is on, the stored pivotX/pivotY otherwise. Takes the arc centre and image width as arguments so
 *  this file stays free of asset imports. */
export function middlePivot(mc: MiddleCloud, arcCentre: { x: number; y: number }, assetW: number): { x: number; y: number } {
    if (!mc.autoPivot) return { x: mc.pivotX, y: mc.pivotY }
    const k = mc.width / assetW
    return { x: mc.x + arcCentre.x * k, y: mc.y + arcCentre.y * k }
}

/** The only way anything reads a recipe (plan §3). Same "no content validation, never throw" rule
 *  as `mergeTurf`/`mergePatch` in SportStyleBoard.tsx: anything unusable falls back to the default
 *  for that field, so a hand-pasted blob can never break the running scene. */
export function mergeRecipe(raw: unknown): RipsSceneRecipe {
    if (!isPlainObject(raw)) return DEFAULT_RIPS_RECIPE
    const d = DEFAULT_RIPS_RECIPE
    const storedSky = Array.isArray(raw.skyClouds) ? raw.skyClouds : []
    return {
        background: mergeFields(d.background, raw.background),
        skyClouds: d.skyClouds.map((def, i) => mergeFields(def, storedSky[i])),
        middleCloud: mergeFields(d.middleCloud, raw.middleCloud),
        mountain: mergeFields(d.mountain, raw.mountain),
        frontBack: mergeFields(d.frontBack, raw.frontBack),
        frontFront: mergeFields(d.frontFront, raw.frontFront),
        glows: Array.isArray(raw.glows) ? raw.glows.filter(isPlainObject).map(mergeGlow) : [],
    }
}
