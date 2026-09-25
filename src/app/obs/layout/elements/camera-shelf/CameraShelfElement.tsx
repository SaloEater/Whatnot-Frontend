'use client'

// The `cameraShelf` registry component (obs-camera-shelf-plan.md) — a FIXED-SIZE cabinet drawing
// (header band, side posts, lit ledge) scaled uniformly off the box width, whose middle is a
// transparent window; the OBS camera source sits UNDER the layout browser source and shows through
// that window, so real boxes standing on the shelf read as inside the cabinet. This component
// paints ONLY the frame + a fake-glare overlay + the live label text + optional gap fills around
// the camera picture — the camera picture itself is never drawn here, it is whatever OBS composites
// underneath the page. Enabling/disabling that camera source used to be this element's own stage
// hook (elements/camera-shelf/mount.ts, since deleted); that moved to the `obsToggle` element
// (obs-visibility-toggle-plan.md §11) — see elements/obs-toggle/mount.ts, still driven by the
// controls page's stage hooks.
//
// The art is NOT stretched: one PNG, scaled uniformly from the box width (`s = box.w /
// SHELF_ASSETS.shelf.w`); the camera window is a fixed rectangle inside it, measured once
// (SHELF_RECTS.window). Reflections/glare over the boxes are faked by a second semi-transparent PNG
// layer drawn inside the window (the browser source is above the camera, so anything painted there
// lands on top of the camera picture). If the camera source's own aspect ratio (`cameraAspect`)
// differs from the window's fixed aspect, `cameraGaps` fills the leftover strips with `fillColor`
// instead of stretching anything — this component never touches the camera pixels.
//
// Reads nothing from `useLayoutData()` (NEEDS_BY_ID.cameraShelf is `[]`) — everything here is
// either static art or element config. Renders nothing for a non-`cameraShelf` element, like every
// other registry component.
//
// Font: the header plate is a physical placard on a metal cabinet, not an LED readout, so this
// copies the plain system-bold-sans stack `priceSign` spells out (PriceSignElement.css's
// `.psn-root`) rather than TickerElement.css's Handjet dot-matrix face — Handjet is specifically
// the ticker's LED-band look and would read as an odd choice on a metal plate. `text` itself sets
// no font-family (it inherits the page's Inter body font), so copying priceSign's explicit stack
// is the closer match for an element that (like priceSign) never sits inside the app's own layout.
import { useEffect, useState } from 'react'
import type { ElementProps } from '../../registry'
import { SHELF_ASSETS, SHELF_RECTS } from './assets'
import './CameraShelfElement.css'

// Registry defaults (registry.ts `makeElement()` leaves every cameraShelf field unset on a
// freshly-placed element so these apply) — also read by CameraShelfSettings.tsx so the controls UI
// shows the same numbers a brand-new element actually renders at.
export const DEFAULT_SHELF_LABEL = 'CURRENT BREAK'
export const DEFAULT_LABEL_FONT_SIZE = 40
// shelf.png px from the art's top edge to the label's top edge — the hand-measured plate position
// (assets.ts) is only a starting point, so this is operator-tunable (schema `labelOffsetY`).
export const DEFAULT_LABEL_OFFSET_Y = SHELF_RECTS.label.y
// Sampled off shelf.png's inner faces (the opaque dark strip between each neon line and the
// opening: ~rgb(17,38,52) on the posts, darker under the header). A pure-black fill next to that
// face looked like a separate square with a "gap" around it — the gap was the face itself.
export const DEFAULT_FILL_COLOR = '#112634'
// `fillBlur` tuning (see the component body): the backdrop blur radius at 100%, in shelf.png px,
// scaled by `s` at render.
const FILL_MAX_BLUR_PX = 48
export const DEFAULT_GLARE = true
export const DEFAULT_GLARE_OPACITY = 0.6

// Copied from ImageBoxElement.tsx (ADDING_AN_ELEMENT.md's copy rule — never imported/refactored
// out). Read after mount: `window` does not exist during SSR, and the first client render must
// match the server's (empty) markup byte for byte.
function readDevMode(): boolean {
    try {
        return new URLSearchParams(window.location.search).get('dev') === '1'
    } catch {
        return false
    }
}

type Rect = { x: number; y: number; w: number; h: number }

/** The strips of `win` left uncovered when the camera's own aspect ratio (`cameraAspect`) differs
 *  from the window's fixed aspect — left/right strips when the camera is narrower than the window,
 *  top/bottom strips when it is wider. Undefined/non-positive `cameraAspect` means "unknown",
 *  which draws no gaps (the raw window just shows whatever OBS composites there). Never stretches
 *  anything: this only tells the component where to paint `fillColor`. */
export function cameraGaps(win: Rect, cameraAspect: number | undefined): Rect[] {
    if (!cameraAspect || cameraAspect <= 0 || win.w <= 0 || win.h <= 0) return []
    const winAspect = win.w / win.h
    if (cameraAspect < winAspect) {
        // Camera is narrower (taller) than the window — pillarbox left/right.
        const camW = win.h * cameraAspect
        const pad = (win.w - camW) / 2
        if (pad <= 0) return []
        return [
            { x: win.x, y: win.y, w: pad, h: win.h },
            { x: win.x + win.w - pad, y: win.y, w: pad, h: win.h },
        ]
    }
    if (cameraAspect > winAspect) {
        // Camera is wider (shorter) than the window — letterbox top/bottom.
        const camH = win.w / cameraAspect
        const pad = (win.h - camH) / 2
        if (pad <= 0) return []
        return [
            { x: win.x, y: win.y, w: win.w, h: pad },
            { x: win.x, y: win.y + win.h - pad, w: win.w, h: pad },
        ]
    }
    return []
}

export function CameraShelfElement({ box, element }: ElementProps) {
    const [devMode, setDevMode] = useState(false)
    useEffect(() => {
        setDevMode(readDevMode())
    }, [])

    if (element.kind !== 'cameraShelf') return null

    const label = element.label ?? DEFAULT_SHELF_LABEL
    const labelFontSize = element.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
    const labelOffsetY = element.labelOffsetY ?? DEFAULT_LABEL_OFFSET_Y
    const glare = element.glare ?? DEFAULT_GLARE
    const glareOpacity = element.glareOpacity ?? DEFAULT_GLARE_OPACITY
    const fillColor = element.fillColor ?? DEFAULT_FILL_COLOR
    const fillBlur = Math.min(100, Math.max(0, element.fillBlur ?? 0))
    // Blur-only fill (schema.ts `fillBlur`, revised 2026-09-25): above 0 the strips paint NO colour
    // at all — just a `backdrop-filter` blur over whatever layout element sits behind them, its
    // radius growing to FILL_MAX_BLUR_PX at 100% (in shelf.png px, scaled by `s` like every other
    // size). At exactly 0 the strips are the solid `fillColor` slab, as before. `WebkitBackdropFilter`
    // too: OBS's CEF is Chromium, but older builds still only honour the prefixed name.
    const fillBackground = fillBlur === 0 ? fillColor : 'transparent'
    const flip = element.flip ?? false

    const s = box.w / SHELF_ASSETS.shelf.w
    const artW = SHELF_ASSETS.shelf.w * s
    const artH = SHELF_ASSETS.shelf.h * s
    const fillFilter = fillBlur === 0 ? undefined : `blur(${(FILL_MAX_BLUR_PX * fillBlur) / 100 * s}px)`

    // Flip (schema.ts `flip`): the two art layers get `scaleY(-1)` about the art's own centre,
    // so every rect measured off the art (window, label) is mirrored the same way: y -> artH - y - h.
    const winY = SHELF_RECTS.window.y * s
    const winH = SHELF_RECTS.window.h * s
    const win: Rect = {
        x: SHELF_RECTS.window.x * s,
        y: flip ? artH - winY - winH : winY,
        w: SHELF_RECTS.window.w * s,
        h: winH,
    }
    const labelH = SHELF_RECTS.label.h * s
    // Upright text either way; when flipped the offset counts up from the art's bottom edge, since
    // that is where the plate now is.
    const labelTop = flip ? artH - labelOffsetY * s - labelH : labelOffsetY * s
    const flipStyle = flip ? { transform: 'scaleY(-1)' } : undefined
    const gaps = cameraGaps(win, element.cameraAspect)

    return (
        <div className="csh-root">
            {/* Layer 1: dev placeholder, ?dev=1 only — in OBS this renders NOTHING here, the real
                camera picture is a separate OBS source sitting behind the whole page. */}
            {devMode && (
                <div className="csh-dev-window" style={{ left: win.x, top: win.y, width: win.w, height: win.h }}>
                    <span className="csh-dev-caption">camera</span>
                </div>
            )}
            {/* Layer 2: gap fills (schema.ts `cameraAspect`) — the parts of the window the camera's
                own aspect ratio leaves uncovered. Safe to paint because the camera never shows
                through these strips. */}
            {gaps.map((g, i) => (
                <div
                    key={i}
                    className="csh-gap"
                    style={{
                        left: g.x,
                        top: g.y,
                        width: g.w,
                        height: g.h,
                        background: fillBackground,
                        backdropFilter: fillFilter,
                        WebkitBackdropFilter: fillFilter,
                    }}
                />
            ))}
            {/* Layer 3: glare — painted over the window, above the (invisible-here) camera plate,
                below the frame, so it reads as a reflection ON the boxes once OBS composites the
                real camera picture underneath the whole browser source. Stretched over the WINDOW
                rect, not the art: the glare file is cropped to its own bbox (a different canvas
                than shelf.png), so it never has to share a canvas with the frame art. */}
            {glare && (
                <img
                    src={SHELF_ASSETS.glare.src}
                    alt=""
                    className="csh-glare"
                    style={{ left: win.x, top: win.y, width: win.w, height: win.h, opacity: glareOpacity, ...flipStyle }}
                />
            )}
            {/* Layer 4: the cabinet frame — opaque art hides the camera, transparent art (the
                window) reveals it. */}
            <img src={SHELF_ASSETS.shelf.src} alt="" className="csh-frame" style={{ left: 0, top: 0, width: artW, height: artH, ...flipStyle }} />
            {/* Layer 5: the live header label, over the plate's blank area. */}
            <div
                className="csh-label"
                style={{
                    left: SHELF_RECTS.label.x * s,
                    top: labelTop,
                    width: SHELF_RECTS.label.w * s,
                    height: labelH,
                    fontSize: labelFontSize * s,
                }}
            >
                {label}
            </div>
        </div>
    )
}

export default CameraShelfElement
