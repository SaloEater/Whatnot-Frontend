// Static asset manifest for the card tier frames (card-frames-plan.md §3/§4), same convention as
// `../price-sign/assets.ts`. `x`/`y` are the 8 cut positions per axis in SOURCE px (7 bands, odd
// bands stretch — see frameSlices.ts). The numbers are the same as `scripts/frame_cuts.json`, which
// is the source of truth (edited by a Python tool): when the cuts or the art change, update them
// there first and copy them here.

export type FrameTier = 'bronze' | 'silver' | 'gold'

export type FrameAsset = { src: string; w: number; h: number; x: number[]; y: number[] }

export const FRAME_ASSETS: Record<FrameTier, FrameAsset> = {
    bronze: {
        src: '/images/frames/frame_bronze.png', w: 917, h: 1611,
        x: [0, 198, 263, 298, 618, 653, 718, 917],
        y: [0, 388, 571, 630, 952, 1009, 1208, 1611],
    },
    silver: {
        src: '/images/frames/frame_silver.png', w: 916, h: 1608,
        x: [0, 222, 265, 302, 613, 651, 693, 916],
        y: [0, 389, 578, 641, 947, 1012, 1207, 1608],
    },
    gold: {
        src: '/images/frames/frame_gold.png', w: 917, h: 1598,
        x: [0, 218, 264, 300, 613, 652, 698, 917],
        y: [0, 390, 575, 645, 946, 1010, 1212, 1598],
    },
}

export const FRAME_PRELOAD: string[] = [
    FRAME_ASSETS.bronze.src,
    FRAME_ASSETS.silver.src,
    FRAME_ASSETS.gold.src,
]
