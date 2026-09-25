// Static asset manifest for the `cameraShelf` element (obs-camera-shelf-plan.md §2), mirroring
// `../price-sign/assets.ts`'s convention: every art layer reads its own `{src, w, h}` from here
// rather than hard-coding a path or waiting on an image-load round trip to learn its aspect ratio.
// `SHELF_PRELOAD` (registry.ts's `preload` list) is derived from this table so a new asset is only
// ever added here once.
//
// One fixed-aspect PNG (`shelf.png`), scaled uniformly off the box width — see
// CameraShelfElement.tsx's `s = box.w / SHELF_ASSETS.shelf.w`. Numbers below are hand-pasted from
// the `name w h` / `window x y w h` lines `scripts/build_shelf_assets.py` prints, run against the
// raw delivery kept in `public/images/shelf/raw/`.

export type ShelfAsset = { src: string; w: number; h: number }

export const SHELF_ASSETS = {
    shelf: { src: '/images/shelf/shelf.png', w: 2028, h: 648 },
    // The glare file is NOT the same canvas as shelf.png: it is cropped to its OWN bbox (the
    // delivery came back on two different canvases) and is stretched over the WINDOW rect by the
    // component (obs-camera-shelf-plan.md Revisions), so its own w/h only records the delivery's
    // aspect ratio.
    glare: { src: '/images/shelf/shelf_glare.png', w: 1874, h: 446 },
} satisfies Record<string, ShelfAsset>

// All rects in shelf.png output pixel coordinates (same scale as SHELF_ASSETS.shelf).
export const SHELF_RECTS = {
    // Full transparent opening — the region the camera is visible through. The header band
    // overlaps the top of the boxes by design, so this is what the operator sizes the camera
    // source to in OBS (its top edge is under the header, not at the visible slot's top).
    window: { x: 193, y: 145, w: 1644, h: 353 },
    // Where the header text goes (centred in this rect), blank in the art.
    label: { x: 664, y: 10, w: 700, h: 98 },
}

// Preloads both PNGs — the frame is never partial, so nothing here is optional.
export const SHELF_PRELOAD: string[] = [SHELF_ASSETS.shelf.src, SHELF_ASSETS.glare.src]
