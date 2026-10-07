// Static asset manifest for the `priceSign` element (obs-price-sign-plan.md §2), mirroring
// `../scene/assets.ts`'s convention: every art layer reads its own `{src, w, h}` from here.
// All numbers below were measured on the images after `scripts/trim_canvas.py --solidify 200`
// and MUST be re-measured (sizes and the badge square) if the art is replaced.

export type SignAsset = { src: string; w: number; h: number }

export const SIGN_ASSETS = {
    pedestal: { src: '/images/sign/MiddlePedestal.png', w: 480, h: 145 },
    tablo: { src: '/images/sign/MiddleStoneTablo.png', w: 401, h: 103 },
} satisfies Record<string, SignAsset>

// The tablo's native width relative to the pedestal's.
export const TABLO_WIDTH_RATIO = SIGN_ASSETS.tablo.w / SIGN_ASSETS.pedestal.w

// The carved badge square (outline included) as 0..1 fractions of the tablo's own size
// (measured: x 315..380, y 24..86 of 401x103).
export const TABLO_BADGE = { x0: 315 / 401, x1: 380 / 401, y0: 24 / 103, y1: 86 / 103 }

// Text column for the range label, as fractions of the tablo width.
export const TABLO_LABEL = { x0: 0.05, x1: TABLO_BADGE.x0 - 0.03 }

export const SIGN_PRELOAD: string[] = [SIGN_ASSETS.pedestal.src, SIGN_ASSETS.tablo.src]
