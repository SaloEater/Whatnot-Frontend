// Static asset manifest for the `ticker` element (obs-ticker-plan.md §2), mirroring
// `../price-sign/assets.ts`'s convention: the art reads its own `{src, w, h}` from here rather than
// hard-coding a path or waiting on an image-load round trip to learn its aspect ratio.

export type TickerAsset = { src: string; w: number; h: number }

export const TICKER_ASSET: TickerAsset = { src: '/images/ticker/curve.png', w: 2170, h: 725 }

// Centreline of the band in TEXTURE px (obs-ticker-plan.md §1: measured geometry, band symmetric,
// ~220px thick, sagging 100px at the centre). Used verbatim as the SVG `<path d>` inside a viewBox
// of TICKER_ASSET.w x TICKER_ASSET.h (TickerElement.tsx), so it never needs rescaling — the path,
// the image and the text all scale together for any box.
//
// Tuned by eye after the first live look (2026-09-21): the measured fit sagged 100px at the centre
// and the text read slightly too flat, so the sag was deepened 5% to 105px. A quadratic Bézier's
// midpoint sits halfway between the end y and the control y, so the control y is
// 286 + 2 * 105 = 496. Ends are unchanged. Adjust the control y only (sag = (cy - 286) / 2).
export const TICKER_PATH_D = 'M 0 296 Q 1085 496 2170 296'

export const TICKER_PRELOAD: string[] = [TICKER_ASSET.src]
