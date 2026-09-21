// Static asset manifest for the `scene` element (obs-scene-element-plan.md §3). Every art layer
// reads its own `{src, w, h}` from here rather than hard-coding a path or waiting on an image-load
// round trip to learn its aspect ratio — see artLayer.ts's `artLayerStyle`. `SCENE_PRELOAD`
// (registry.ts's `preload` list) is derived from this table so a new asset is only ever added here
// once.
//
// Dimensions below are the ACTUAL delivered art, not the plan's nominal brief sizes
// (obs-scene-assets-brief.md) — when art is replaced, `w`/`h` here MUST be updated to match, or an
// art layer's anchor (artLayer.ts) is off by the height difference.

// `frames` is optional and only meaningful for a sprite sheet (`birds`, obs-scene-element-plan.md
// §6) — every other asset is a single static image and leaves it `undefined`. BirdsEffect.tsx reads
// it rather than hard-coding a frame count, so a re-delivered sheet with a different grid is a
// one-line change here.
export type SceneAsset = { src: string; w: number; h: number; frames?: number }

export const SCENE_ASSETS = {
    mountain: { src: '/images/scene/mountain.png', w: 1616, h: 973 },
    // Iteration 2's lit variant (obs-scene-element-plan.md §5) — stacked over `mountain` at the
    // same anchor by MountainEffect.tsx and cross-faded in on a `flash` SceneCue.
    mountainLit: { src: '/images/scene/mountain_lit.png', w: 1615, h: 974 },
    cloudsFar: { src: '/images/scene/clouds_far.png', w: 1821, h: 864 },
    // Re-exported 2026-09-20 with real alpha (the first delivery had a baked-in checkerboard).
    cloudsNear: { src: '/images/scene/clouds_near.png', w: 2172, h: 724 },
    // Iteration 3's bird sprite sheet (obs-scene-element-plan.md §6/§3). REBUILT 2026-09-20 from a
    // third raw AI delivery (kept at repo root as `birds_original_v3.png`, 2100 x 793) that, unlike
    // the earlier deliveries, is ALREADY a hand-aligned uniform grid: 10 cells exactly 210 px wide,
    // beak tip on the last pixel column of every cell, no bounding-box drift to detect or centre.
    // Built with `python3 scripts/build_bird_sheet.py --in ../../birds_original_v3.png --grid 210
    // --solidify 200` — `--grid` bypasses bird detection, bbox measurement, centring and beak
    // alignment entirely and just crops the shared vertical opaque band, so each frame keeps its
    // exact original vertical position (frame 5, the front-view pose, is still the lowest). Bodies
    // are solidified to full alpha (`--solidify 200`) — the raw delivery sits at ~93 % alpha, which
    // showed the sky through the birds. The old detection/`--insert`/`--drop` path in
    // `scripts/README.md` remains for a future delivery that ISN'T pre-aligned to a grid.
    // BirdsEffect.tsx reads `frames` (never a hard-coded count) and steps cells with PERCENTAGE
    // `background-position-x` (see that file's header comment for the math).
    // Rebuild with the exact command in `scripts/README.md` ("Current sheet").
    birds: { src: '/images/scene/birds.png', w: 2100, h: 301, frames: 10 },
} satisfies Record<string, SceneAsset>

// Which strip each `clouds` layer instance renders (CloudsEffect.tsx keys into this by `layer`).
export const CLOUD_LAYER_ASSETS = {
    far: SCENE_ASSETS.cloudsFar,
    near: SCENE_ASSETS.cloudsNear,
} satisfies Record<'far' | 'near', SceneAsset>

// Preloads everything iterations 1-3 actually render. `mountainLit` is added here in iteration 2 (obs-scene-element-plan.md §5) since
// MountainEffect.tsx now always renders it (opacity 0 at rest) rather than only iteration 1's base
// `mountain` — without preloading it, the first `thunder`/`storm` of a session would show a blank
// flash while the browser fetches it. `birds` is added in iteration 3 (§6) — enabled by default, so
// the first flock (2s after mount) must not wait on a cold fetch.
export const SCENE_PRELOAD: string[] = [
    SCENE_ASSETS.mountain.src,
    SCENE_ASSETS.cloudsFar.src,
    SCENE_ASSETS.cloudsNear.src,
    SCENE_ASSETS.mountainLit.src,
    SCENE_ASSETS.birds.src,
]
