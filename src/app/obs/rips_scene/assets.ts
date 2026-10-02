// Static asset manifest for the `ripsScene` element (rips-scene-plan.md §2). Same `{src, w, h}`
// shape as layout/elements/scene/assets.ts: the renderer reads each layer's aspect ratio from here
// rather than waiting on an image-load round trip. When art is replaced, `w`/`h` MUST be updated to
// match the delivered file or the front-cloud strip height and the sky-cloud pivots are off.

export type RipsAsset = { src: string; w: number; h: number }

export const RIPS_ASSETS = {
    background: { src: '/images/rips_scene/Back.png', w: 1930, h: 815 },
    mountain: { src: '/images/rips_scene/Mountain.png', w: 1926, h: 675 },
    cloudsFront: { src: '/images/rips_scene/CloudsFront.png', w: 1988, h: 327 },
    middleCloud: { src: '/images/rips_scene/MiddleCloud.png', w: 4123, h: 1211 },
    skyCloudLayer1: { src: '/images/rips_scene/TopCloudLayer1.png', w: 1931, h: 2017 },
    skyCloudLayer2: { src: '/images/rips_scene/TopCloudLayer2.png', w: 2149, h: 2105 },
    skyCloudLayer3: { src: '/images/rips_scene/TopCloudLayer3.png', w: 1677, h: 1745 },
    skyCloudLayer4: { src: '/images/rips_scene/TopCloudLayer4.png', w: 1672, h: 2121 },
} satisfies Record<string, RipsAsset>

// Centre of the circle the cloud band in MiddleCloud.png is drawn on, in the image's own px —
// measured by fitting a circle to the band's bottom edge (mean deviation ~9 px; radius ~5268 px,
// the band spans ~45 degrees of it). With the pivot here, sections circle without bobbing. MUST be
// re-measured if the art is replaced.
export const MIDDLE_CLOUD_ARC_CENTRE = { x: 1240, y: -4097 }

// One entry per sky cloud (index = paint order). All four point at the sample until the other three
// images are delivered — then only this array and the table above change (plan §2).
export const SKY_CLOUD_ASSETS: RipsAsset[] = [
    RIPS_ASSETS.skyCloudLayer4,
    RIPS_ASSETS.skyCloudLayer3,
    RIPS_ASSETS.skyCloudLayer2,
    RIPS_ASSETS.skyCloudLayer1,
]

// registry.ts's `preload` list for the `ripsScene` entry.
export const RIPS_SCENE_PRELOAD: string[] = Object.values(RIPS_ASSETS).map((a) => a.src)
