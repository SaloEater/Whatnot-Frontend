'use client'

// The `priceSign` registry component (obs-price-sign-plan.md) — a second readout of a
// `price_ranges` series, same data as `priceRanges` (../price-ranges/PriceRangesElement.tsx,
// series-price-ranges-plan.md §4.5), styled as a wooden shop sign hanging by two chains from a
// wall bracket, swaying gently in a fake wind. `formatRange`/the row markup are COPIED from
// PriceRangesElement.tsx (never imported/refactored out — see ADDING_AN_ELEMENT.md's copy rule).
//
// Renders nothing when the break's current series isn't a `price_ranges` series, or has no
// ranges yet — same guard as PriceRangesElement/TextElement, so an unconfigured/mismatched
// element leaves no stray box on the canvas.
//
// Geometry (obs-price-sign-plan.md §4.1): everything below is absolutely positioned px, derived
// from `box` — never vw/vh/rem. THREE independent scale factors: `sB` scales the bracket art alone
// (drawn at the box's full width); `sS` scales the BOARD assets only (sign_top/sign_middle/
// sign_bottom/row_divider) off the board's own width; `sH` scales the HARDWARE (chain_hook_bottom,
// chain_link) off `HARDWARE_W_PCT` of the board's width instead — those raw deliveries are tall,
// narrow canvases (~800-1800px) meant to depict small wall-mount hardware, not board-width-scaled
// panels, so sharing `sS` with the board would render them far too large.
//
// **Chain stack (revised 2026-09-21, third revision — dropped the eyelet/chain_hook_top "S-hook"
// entirely):** each chain is just TWO `chainHookBottom` shackles — one flipped (`.psn-flip`,
// `transform: scaleY(-1)`), pin-up, touching the bracket bar; one upright, pin-down, touching the
// board — with the tiled `chain_link` strip between them. Both shackles render BEHIND the chain
// strip (DOM order: both shackles first, then the strip, so the strip visibly threads through each
// shackle's U). `.psn-bracket` gets `z-index: 2` and `.psn-swing-a` gets `z-index: 1`
// (PriceSignElement.css) so the bracket paints over the top shackle's pin regardless of the two
// being siblings rather than nested. The swing wrappers pivot on the bracket's own `pivotY`
// (`BRACKET_BAR_UNDER_Y * sB`) again — there's no separate static "ring" asset to pivot on any
// more, the whole chain (both shackles + strip) swings together.
//
// Per-chain joints, all fractions of the shackle's OWN height (`shackleH`), derived from the raw
// `chain_hook_bottom` art's own landmarks (U opening centre ~45% down, pin centre ~72% down, pin
// lower edge ~80% down — see obs-price-sign-plan.md §4.1 for the reasoning kept there):
//   topShackleTop    = pivotY - 0.28 * shackleH        (pin centre sits on the bar underside)
//   chainTop         = topShackleTop + 0.45 * shackleH (first link enters the flipped U)
//   chainBottom      = chainTop + chainLength
//   bottomShackleTop = chainBottom - 0.55 * shackleH   (last link sits in the upright U)
//   boardTop         = bottomShackleTop + 0.78 * shackleH (pin's lower edge just touches the top
//                                                          trim; `.psn-swing-board` renders last,
//                                                          so it paints over any overlap)
//
// At the registry default box (780x1000, boardWidthPct 72) with chainLength 120 and 4 rows at the
// default 44px label font, the assembled sign (bracket top, y=0, to the board's bottom edge) is
// ~907px tall (re-measured 2026-09-21 after dropping the eyelet/S-hook, which shortened the chain
// stack by ~63px versus the prior eyelet-based build) — fits the 1000px default box with ~93px to
// spare.
//
// The rows region's height counts `(rows - 1)` divider images (`dividerH` below) in addition to
// the rows themselves and their vertical padding, so a break with enough rows never pushes the
// last row (or a divider) past `.psn-board-rows`' bottom edge. Row labels/badges also get
// `white-space: nowrap` (PriceSignElement.css) so a wide price range never wraps to two lines and
// blows out `rowH`; font size stays entirely operator-controlled, no auto-shrink.
//
// Wind (§4.2): CSS-only, transform-only (obs-scene-element-plan.md §1.4's compositor rule) — see
// PriceSignElement.css. `windStrength` is passed down as the `--psn-wind` custom property that
// every swing keyframe's amplitude is `calc()`-multiplied by.

import type { CSSProperties, ReactNode } from 'react'
import { Fragment } from 'react'
import type { ElementProps } from '../../registry'
import { useLayoutData } from '../../useLayoutData'
import { SIGN_ASSETS, BRACKET_BAR_UNDER_Y } from './assets'
import './PriceSignElement.css'

// Registry defaults (registry.ts `makeElement()` leaves every priceSign field unset on a
// freshly-placed element so these apply) — also imported by PriceSignSettings.tsx so the controls
// UI shows the same numbers a brand-new element actually renders at.
export const DEFAULT_LABEL_FONT_SIZE = 44
export const DEFAULT_BADGE_FONT_SIZE = 40
export const DEFAULT_BOARD_WIDTH_PCT = 72
export const DEFAULT_CHAIN_LENGTH = 120
export const DEFAULT_WIND_STRENGTH = 1

// The shackle (`chainHookBottom`) renders at ~7% of the board's own width (at the registry default
// box, ~40px wide, ~44px tall). Redefined 2026-09-21 off `chainHookBottom.w` instead of the now
// -removed `eyelet.w` — chosen (0.055 * 794 / 618) so `sH`'s actual numeric value is unchanged from
// before this revision (chain_link/chain_hook_bottom render at the exact same size as previously).
export const HARDWARE_W_PCT = 0.0707

type Style = CSSProperties & Record<string, string | number>

function formatRange(priceFrom: number, priceTo: number | null): string {
    return priceTo === null ? `$${priceFrom}+` : `$${priceFrom}–$${priceTo}`
}

export function PriceSignElement({ box, element }: ElementProps) {
    const { series, seriesPriceRanges } = useLayoutData()

    if (element.kind !== 'priceSign') return null
    if (series?.kind !== 'price_ranges' || seriesPriceRanges.length === 0) return null

    const labelFontSize = element.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
    const badgeFontSize = element.badgeFontSize ?? DEFAULT_BADGE_FONT_SIZE
    const boardWidthPct = element.boardWidthPct ?? DEFAULT_BOARD_WIDTH_PCT
    const chainLength = element.chainLength ?? DEFAULT_CHAIN_LENGTH
    const windStrength = element.windStrength ?? DEFAULT_WIND_STRENGTH
    const badgeSize = Math.round(badgeFontSize * 1.8)

    // ── Bracket ──────────────────────────────────────────────────────────────────────────────
    const sB = box.w / SIGN_ASSETS.bracket.w
    const bracketH = SIGN_ASSETS.bracket.h * sB
    const pivotY = BRACKET_BAR_UNDER_Y * sB

    // ── Board scale + chain x-positions ─────────────────────────────────────────────────────
    const boardW = box.w * (boardWidthPct / 100)
    const sS = boardW / SIGN_ASSETS.signTop.w
    const boardCx = box.w * 0.42
    const chainXs = [boardCx - 0.3 * boardW, boardCx + 0.3 * boardW]

    // ── Hardware asset sizes at sH (shackle + chain strip) ──────────────────────────────────
    const sH = (HARDWARE_W_PCT * boardW) / SIGN_ASSETS.chainHookBottom.w
    const shackleW = SIGN_ASSETS.chainHookBottom.w * sH
    const shackleH = SIGN_ASSETS.chainHookBottom.h * sH
    const chainW = SIGN_ASSETS.chainLink.w * sH

    // ── Board asset sizes at sS (caps + middle strip + divider) ────────────────────────────
    const signTopH = SIGN_ASSETS.signTop.h * sS
    const signBottomH = SIGN_ASSETS.signBottom.h * sS

    // ── Chain stack, top-down from the bracket's pivot line (see header for the derivation) ─
    const topShackleTop = pivotY - 0.28 * shackleH
    const chainTop = topShackleTop + 0.45 * shackleH
    const chainBottom = chainTop + chainLength
    const bottomShackleTop = chainBottom - 0.55 * shackleH
    const boardTop = bottomShackleTop + 0.78 * shackleH

    // ── Rows region + board total height ────────────────────────────────────────────────────
    const rows = seriesPriceRanges.length
    const rowH = labelFontSize * 1.7
    const padY = labelFontSize * 0.4
    // `row_divider.png` is a flex child of `.psn-board-rows` too (between rows) and adds real
    // height there, so it's counted here rather than left out of `rowsRegionH` (a break with
    // enough rows would otherwise push the last row past the rows region's bottom edge).
    // `rowDivider` renders at `0.86 * boardW` wide (render below) at its own aspect ratio, so its
    // height scales off that width, not off `sS`/`sH`.
    const dividerH = 0.86 * boardW * (SIGN_ASSETS.rowDivider.h / SIGN_ASSETS.rowDivider.w)
    const rowsRegionH = rows * rowH + 2 * padY + Math.max(rows - 1, 0) * dividerH
    const boardTotalH = signTopH + rowsRegionH + signBottomH

    const windPaused = windStrength === 0

    const swingAStyle: Style = {
        '--psn-wind': windStrength,
        transformOrigin: `${boardCx}px ${pivotY}px`,
        animationPlayState: windPaused ? 'paused' : 'running',
    }
    const swingBStyle: Style = {
        transformOrigin: `${boardCx}px ${pivotY}px`,
        animationPlayState: windPaused ? 'paused' : 'running',
    }
    const swingBoardStyle: Style = {
        left: boardCx - boardW / 2,
        top: boardTop,
        width: boardW,
        height: boardTotalH,
        transformOrigin: '50% 0%',
        animationPlayState: windPaused ? 'paused' : 'running',
    }

    // Both shackles (same `chainHookBottom` asset — top one flipped via `.psn-flip`) then the
    // chain strip, in that DOM order, so the strip paints IN FRONT of both shackles and visibly
    // threads through their U openings.
    function renderChain(cx: number, key: number): ReactNode {
        return (
            <Fragment key={key}>
                <img
                    src={SIGN_ASSETS.chainHookBottom.src}
                    alt=""
                    className="psn-fit psn-flip"
                    style={{ left: cx - shackleW / 2, top: topShackleTop, width: shackleW, height: shackleH }}
                />
                <img
                    src={SIGN_ASSETS.chainHookBottom.src}
                    alt=""
                    className="psn-fit"
                    style={{ left: cx - shackleW / 2, top: bottomShackleTop, width: shackleW, height: shackleH }}
                />
                <div
                    className="psn-fit psn-chain-strip"
                    style={{
                        left: cx - chainW / 2,
                        top: chainTop,
                        width: chainW,
                        height: Math.max(chainLength, 0),
                        backgroundImage: `url(${SIGN_ASSETS.chainLink.src})`,
                        backgroundSize: `${chainW}px auto`,
                    }}
                />
            </Fragment>
        )
    }

    return (
        <div className="psn-root">
            <img
                src={SIGN_ASSETS.bracket.src}
                alt=""
                className="psn-bracket"
                style={{ left: 0, top: 0, width: box.w, height: bracketH }}
            />
            <div className="psn-swing-a" style={swingAStyle}>
                <div className="psn-swing-b" style={swingBStyle}>
                    {chainXs.map((cx, i) => renderChain(cx, i))}
                    <div className="psn-swing-board" style={swingBoardStyle}>
                        <img
                            src={SIGN_ASSETS.signTop.src}
                            alt=""
                            className="psn-board-cap"
                            style={{ width: boardW, height: signTopH }}
                        />
                        <div
                            className="psn-board-rows"
                            style={{
                                width: boardW,
                                height: rowsRegionH,
                                backgroundImage: `url(${SIGN_ASSETS.signMiddle.src})`,
                                backgroundSize: `${boardW}px auto`,
                                paddingTop: padY,
                                paddingBottom: padY,
                                paddingLeft: 0.06 * boardW,
                                paddingRight: 0.06 * boardW,
                            }}
                        >
                            {seriesPriceRanges.map((r, i) => (
                                <Fragment key={r.id}>
                                    {i > 0 && (
                                        <img
                                            src={SIGN_ASSETS.rowDivider.src}
                                            alt=""
                                            className="psn-divider"
                                            style={{ width: 0.86 * boardW }}
                                        />
                                    )}
                                    <div className="psn-row" style={{ height: rowH }}>
                                        <span className="psn-label" style={{ fontSize: labelFontSize }}>
                                            {formatRange(r.price_from, r.price_to)}
                                        </span>
                                        <span
                                            className="psn-badge"
                                            style={{
                                                fontSize: badgeFontSize,
                                                width: badgeSize,
                                                height: badgeSize,
                                                flexBasis: badgeSize,
                                            }}
                                        >
                                            {r.count}
                                        </span>
                                    </div>
                                </Fragment>
                            ))}
                        </div>
                        <img
                            src={SIGN_ASSETS.signBottom.src}
                            alt=""
                            className="psn-board-cap"
                            style={{ width: boardW, height: signBottomH }}
                        />
                    </div>
                </div>
            </div>
        </div>
    )
}

export default PriceSignElement
