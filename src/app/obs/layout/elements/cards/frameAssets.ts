// Static asset manifest for the card tier frames (card-frames-plan.md §3/§4), same convention as
// `../price-sign/assets.ts`. `x`/`y` are the 8 cut positions per axis in SOURCE px (7 bands, odd
// bands stretch — see frameSlices.ts). The numbers are the same as `scripts/frame_cuts.json`, which
// is the source of truth (edited by a Python tool): when the cuts or the art change, update them
// there first and copy them here.

export type FrameTier = 'bronze' | 'silver' | 'gold'

// Bounding box of the transparent hole, source px (used by composed.ts for v1 photos).
export type FrameHole = { x1: number; y1: number; x2: number; y2: number }

// `bg`: plain fill drawn under the card inside the hole, so a card whose shape doesn't fill the hole
// shows this instead of whatever is behind the element. Sampled from each frame's dark side panel;
// CardFrame.tsx's FrameBackground lays a soft white centre glow over it.
export type FrameAsset = { src: string; w: number; h: number; x: number[]; y: number[]; hole: FrameHole; bg: string }

export const FRAME_ASSETS: Record<FrameTier, FrameAsset> = {
    bronze: {
        src: '/images/frames/frame_bronze.png', "w": 917, "h": 1611, "x": [0, 200, 263, 300, 617, 654, 717, 917], "y": [0, 390, 572, 633, 951, 1011, 1207, 1611],
        hole: { x1: 76, y1: 93, x2: 841, y2: 1513 },
        bg: '#513c2d',
    },
    silver: {
        src: '/images/frames/frame_silver.png', "w": 916, "h": 1608, "x": [0, 222, 265, 304, 614, 652, 695, 916], "y": [0, 390, 580, 644, 945, 1013, 1207, 1608],
        hole: { x1: 86, y1: 100, x2: 830, y2: 1502 },
        bg: '#4c4c4b',
    },
    gold: {
        src: '/images/frames/frame_gold.png', "w": 917, "h": 1598, "x": [0, 220, 262, 302, 614, 655, 696, 917], "y": [0, 388, 577, 644, 947, 1013, 1209, 1598],
        hole: { x1: 79, y1: 92, x2: 838, y2: 1503 },
        bg: '#ac732b',
    },
}

export const FRAME_PRELOAD: string[] = [
    FRAME_ASSETS.bronze.src,
    FRAME_ASSETS.silver.src,
    FRAME_ASSETS.gold.src,
]
