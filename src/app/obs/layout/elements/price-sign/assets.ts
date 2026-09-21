// Static asset manifest for the `priceSign` element (obs-price-sign-plan.md §2), mirroring
// `../scene/assets.ts`'s convention: every art layer reads its own `{src, w, h}` from here rather
// than hard-coding a path or waiting on an image-load round trip to learn its aspect ratio.
// `SIGN_PRELOAD` (registry.ts's `preload` list) is derived from this table so a new asset is only
// ever added here once.
//
// Dimensions below are the REAL post-crop dimensions printed by `scripts/build_sign_assets.py`
// (see `scripts/README.md`), not the plan's nominal raw-art sizes (obs-sign-assets-brief.md) —
// when the art is rebuilt, every `w`/`h` here (and `BRACKET_BAR_UNDER_Y`) MUST be re-measured and
// updated to match, or PriceSignElement.tsx's geometry (scale factors, pivot point) is off.

export type SignAsset = { src: string; w: number; h: number }

// `eyelet`/`chainHookTop` removed 2026-09-21 (chain hardware rework, obs-price-sign-plan.md §4.1
// revision 3): the chain stack no longer uses an eyelet or the chain_hook_top "S-hook" asset at
// all — each chain is now just two `chainHookBottom` shackles (one flipped, one upright) either
// side of the tiled chain strip. Both PNGs stay on disk (`public/images/sign/`), just unreferenced
// here.
export const SIGN_ASSETS = {
    bracket: { src: '/images/sign/bracket.png', w: 2030, h: 574 },
    chainLink: { src: '/images/sign/chain_link.png', w: 464, h: 1774 },
    chainHookBottom: { src: '/images/sign/chain_hook_bottom.png', w: 794, h: 872 },
    // sign_top/sign_bottom are HAND-TRIMMED to the bronze trim band only (rows 0..54 of
    // sign_top_full.png, rows 372..425 of sign_bottom_full.png) so the board is almost all tiled
    // middle strip. scripts/build_sign_assets.py regenerates the FULL caps under these names —
    // after any re-run, re-trim from the *_full.png copies and keep h at 54/53 here.
    signTop: { src: '/images/sign/sign_top.png', w: 1982, h: 54 },
    signMiddle: { src: '/images/sign/sign_middle.png', w: 1982, h: 612 },
    signBottom: { src: '/images/sign/sign_bottom.png', w: 1982, h: 53 },
    rowDivider: { src: '/images/sign/row_divider.png', w: 1968, h: 106 },
} satisfies Record<string, SignAsset>

// `bracket.png`'s own OUTPUT-coordinate y of the underside of the bar's free span (away from the
// wall plate and the corner brace) — printed by `scripts/build_sign_assets.py` as
// "bracket barUnderY <y>". PriceSignElement.tsx multiplies this by the bracket's render scale
// (`sB = box.w / SIGN_ASSETS.bracket.w`) to find the pivot line the chains hang from.
export const BRACKET_BAR_UNDER_Y = 208

// Preloads all seven sign assets actually rendered — every one of them (including the divider,
// used between rows) is on screen the moment a `priceSign` element with any ranges mounts, so
// nothing here is optional the way `scene`'s combinatorial per-skin art is.
export const SIGN_PRELOAD: string[] = [
    SIGN_ASSETS.bracket.src,
    SIGN_ASSETS.chainLink.src,
    SIGN_ASSETS.chainHookBottom.src,
    SIGN_ASSETS.signTop.src,
    SIGN_ASSETS.signMiddle.src,
    SIGN_ASSETS.signBottom.src,
    SIGN_ASSETS.rowDivider.src,
]
