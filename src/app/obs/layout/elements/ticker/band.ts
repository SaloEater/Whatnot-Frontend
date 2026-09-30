// The ticker's "stadium screen" band (`band: 'stadium'`), drawn in code — a curved LED ribbon
// display hung from the roof: rigging cables, a steel beam, a metal housing lit along its top edge,
// black glass with royal-blue broadcast bars (the board frame's blue), and a LIVE panel on the left
// end that the scrolling text disappears into.
//
// Two static layers, each painted ONCE per box size and never while the text moves:
//   - back  (under the text): rigging, beam, housing, glass, broadcast bars
//   - front (over the text):  the LIVE end panel + its fade, and the glass reflection
//
// Stream-safe by measurement (a two-pass compression sim, OBS -> Whatnot -> phone): no detail under
// ~2 canvas px, no dense repeats — the truss is a solid beam with a few thick struts, the housing
// has 12 bolts not 40, and the screen has no panel seams (a zig-zag truss, tiny bolt rows and seams
// were what turned to mush and pulsed at keyframes).
//
// Geometry lives in the texture's own 2170x725 space (the space TICKER_PATH_D uses) and is fitted
// with the same "meet" letterbox as the SVG, so band and text line up at any box size. Pixel sizes
// are tuned for the default 1080-wide box and scale with it.

import { TICKER_ASSET } from './assets'

// Band centreline — the same ends/sag as TICKER_PATH_D, 6 texture px higher so the text
// (dominant-baseline middle) sits optically centred on the glass.
const P0: [number, number] = [0, 290]
const C: [number, number] = [1085, 490]
const P1: [number, number] = [2170, 290]

// Canvas px at the reference 1080-wide box.
const REF_SCALE = 1080 / TICKER_ASSET.w
const SCREEN = 50 // half the glass height
const BEZEL = 16
const BEAM = 20 // steel beam above the housing
const BEAM_GAP = 6

/** Curve parameter where the LIVE panel ends (x is linear in t on this curve). */
export const LIVE_PANEL_END_T = 0.155

const BLUE = '#1f4fd8'

function point(t: number): [number, number] {
    const u = 1 - t
    return [
        u * u * P0[0] + 2 * u * t * C[0] + t * t * P1[0],
        u * u * P0[1] + 2 * u * t * C[1] + t * t * P1[1],
    ]
}

function tangent(t: number): [number, number] {
    const u = 1 - t
    const dx = 2 * u * (C[0] - P0[0]) + 2 * t * (P1[0] - C[0])
    const dy = 2 * u * (C[1] - P0[1]) + 2 * t * (P1[1] - C[1])
    const len = Math.hypot(dx, dy)
    return [dx / len, dy / len]
}

type Geo = {
    k: number
    /** Canvas point at curve parameter t, offset d canvas px along the normal (d > 0 = down), plus
     *  the tangent angle. */
    at: (t: number, d: number) => [number, number, number]
    /** Closed strip between offsets d0 and d1 over [t0, t1]. */
    strip: (t0: number, t1: number, d0: number, d1: number) => void
    /** Open path along offset d over [t0, t1]. */
    path: (t0: number, t1: number, d: number) => void
}

const STEPS = 300
const T0 = -0.03
const T1 = 1.03

function geometry(ctx: CanvasRenderingContext2D, w: number, h: number): Geo | null {
    const s = Math.min(w / TICKER_ASSET.w, h / TICKER_ASSET.h)
    if (!(s > 0)) return null
    const ox = (w - TICKER_ASSET.w * s) / 2
    const oy = (h - TICKER_ASSET.h * s) / 2
    const at = (t: number, d: number): [number, number, number] => {
        const [px, py] = point(t)
        const [gx, gy] = tangent(t)
        return [ox + px * s - gy * d, oy + py * s + gx * d, Math.atan2(gy, gx)]
    }
    const path = (t0: number, t1: number, d: number) => {
        ctx.beginPath()
        for (let i = 0; i <= STEPS; i++) {
            const [x, y] = at(t0 + ((t1 - t0) * i) / STEPS, d)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
    }
    const strip = (t0: number, t1: number, d0: number, d1: number) => {
        path(t0, t1, d0)
        for (let i = STEPS; i >= 0; i--) {
            const [x, y] = at(t0 + ((t1 - t0) * i) / STEPS, d1)
            ctx.lineTo(x, y)
        }
        ctx.closePath()
    }
    return { k: s / REF_SCALE, at, strip, path }
}

function vGradient(ctx: CanvasRenderingContext2D, y0: number, y1: number, stops: Array<[number, string]>) {
    const g = ctx.createLinearGradient(0, y0, 0, y1)
    for (const [o, c] of stops) g.addColorStop(o, c)
    return g
}

/** Back layer — everything under the scrolling text. */
export function drawStadiumBack(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h)
    const g = geometry(ctx, w, h)
    if (!g) return
    const { k, at, strip, path } = g
    const scr = SCREEN * k
    const top = -scr - BEZEL * k
    const bot = scr + BEZEL * k
    const beam0 = top - (BEAM + BEAM_GAP) * k
    const beam1 = top - BEAM_GAP * k
    const [, yMid] = at(0.5, 0)

    const fill = (t0: number, t1: number, d0: number, d1: number, style: string | CanvasGradient) => {
        strip(t0, t1, d0, d1)
        ctx.fillStyle = style
        ctx.fill()
    }
    const line = (d: number, width: number, color: string, alpha = 1) => {
        path(T0, T1, d)
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
        ctx.globalAlpha = 1
    }

    ctx.save()
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'

    // Rigging: steel cables from the roof down to the beam, each with a shackle plate.
    for (const t of [0.14, 0.38, 0.62, 0.86]) {
        const [x, y] = at(t, beam0)
        const cx = Math.round(x)
        const cable = ctx.createLinearGradient(cx - 3, 0, cx + 3, 0)
        cable.addColorStop(0, '#2a3342')
        cable.addColorStop(0.5, '#8d9bb0')
        cable.addColorStop(1, '#2a3342')
        ctx.fillStyle = cable
        ctx.fillRect(cx - 2, 0, 4, y)
        const pw = Math.round(14 * k)
        ctx.fillStyle = '#1b222e'
        ctx.fillRect(cx - pw / 2, y - 6 * k, pw, 8 * k)
        ctx.fillStyle = '#6b7a91'
        ctx.fillRect(cx - pw / 2, y - 6 * k, pw, 2)
    }

    // Steel beam: a solid section with a lit top edge and a few thick struts.
    fill(T0, T1, beam0, beam1, '#1a212c')
    line(beam0 + 1.5, 3, '#6f7e95')
    ctx.strokeStyle = '#3a4659'
    ctx.lineWidth = Math.max(3, 5 * k)
    for (let i = 0; i <= 12; i++) {
        const t = i / 12
        const [xa, ya] = at(t, beam0)
        const [xb, yb] = at(t, beam1)
        ctx.beginPath()
        ctx.moveTo(xa, ya)
        ctx.lineTo(xb, yb)
        ctx.stroke()
    }

    // Housing: drop shadow, lit top face, dark metal bezel with a lit lip, 12 bolts per row.
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.75)'
    ctx.shadowBlur = 18 * k
    ctx.shadowOffsetY = 8 * k
    fill(T0, T1, top - 6 * k, bot, '#0d121a')
    ctx.restore()
    fill(T0, T1, top - 6 * k, top, vGradient(ctx, yMid + top - 6 * k, yMid + top, [[0, '#4a5669'], [1, '#262f3d']]))
    fill(T0, T1, top, bot, vGradient(ctx, yMid + top, yMid + bot, [[0, '#2c3646'], [0.12, '#1a212d'], [0.88, '#121822'], [1, '#0b0f16']]))
    // Lit lip: 3px at moderate contrast — a thin bright line on a curve staircases after the
    // phone downscale, a wider softer one stays smooth.
    line(top + 1.5, 3, '#9fb0c8', 0.75)
    line(bot - 1.5, 3, '#05080d')
    const boltR = 3.2 * k
    for (let i = 0; i <= 12; i++) {
        for (const d of [top + (BEZEL * k) / 2, bot - (BEZEL * k) / 2]) {
            const [x, y] = at(i / 12, d)
            ctx.fillStyle = '#05080d'
            ctx.beginPath()
            ctx.arc(x, y + 0.5, boltR * 1.3, 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#6e7d93'
            ctx.beginPath()
            ctx.arc(x, y, boltR, 0, Math.PI * 2)
            ctx.fill()
        }
    }

    // Glass: near-black, a recess shadow under the lip, no panel seams.
    fill(T0, T1, -scr, scr, vGradient(ctx, yMid - scr, yMid + scr, [[0, '#060a14'], [0.5, '#03060d'], [1, '#050912']]))
    line(-scr + 1.5, 3, '#000000', 0.8)

    // On-screen broadcast bars: royal blue with a white inner line, top and bottom. The white line
    // is 3px (never a hairline) for the same staircase reason as the lip above.
    const white = Math.max(3, Math.round(3 * k))
    fill(T0, T1, -scr + 4 * k, -scr + 12 * k, BLUE)
    line(-scr + 12 * k + white / 2, white, '#e8f0ff', 0.9)
    fill(T0, T1, scr - 12 * k, scr - 4 * k, BLUE)
    line(scr - 12 * k - white / 2, white, '#e8f0ff', 0.9)

    // Screen light spilling onto the bezel's inner edge.
    line(-scr - 1, 3, 'rgba(90,150,255,0.35)')
    line(scr + 1, 3, 'rgba(90,150,255,0.35)')
    ctx.restore()
}

/** Front layer — over the scrolling text: the LIVE panel (text dissolves into it) and the glass
 *  reflection. `fontFamily` is a CSS font-family list (the page's Orbitron). */
export function drawStadiumFront(ctx: CanvasRenderingContext2D, w: number, h: number, fontFamily: string): void {
    ctx.clearRect(0, 0, w, h)
    const g = geometry(ctx, w, h)
    if (!g) return
    const { k, at, strip } = g
    const scr = SCREEN * k
    const inset = 15 * k // inside the broadcast bars and their white lines
    const end = LIVE_PANEL_END_T

    ctx.save()
    // Fade: the text dissolves into screen-black over ~9% of the width before the panel.
    const FADE_STEPS = 24
    const FADE_T = 0.09
    for (let i = 0; i < FADE_STEPS; i++) {
        const u0 = end + (i / FADE_STEPS) * FADE_T
        const u1 = end + ((i + 1) / FADE_STEPS) * FADE_T
        strip(u0, u1, -scr + inset, scr - inset)
        // Fully opaque for the first stretch, then ramps out — the text is gone before it touches the divider.
        ctx.fillStyle = `rgba(3,6,13,${Math.min(1, 1.35 * (1 - i / FADE_STEPS)).toFixed(3)})`
        ctx.fill()
    }

    // The panel itself, with a white divider facing the ticker.
    strip(T0, end, -scr + inset, scr - inset)
    ctx.fillStyle = '#0a1a44'
    ctx.fill()
    const [xa, ya] = at(end, -scr + inset)
    const [xb, yb] = at(end, scr - inset)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = Math.max(2, 3 * k)
    ctx.beginPath()
    ctx.moveTo(xa, ya)
    ctx.lineTo(xb, yb)
    ctx.stroke()

    // LIVE badge.
    const [x, y, angle] = at(end / 2 - 0.003, 0)
    ctx.translate(x, y)
    ctx.rotate(angle)
    ctx.fillStyle = '#e8262d'
    ctx.beginPath()
    ctx.roundRect(-58 * k, -17 * k, 116 * k, 34 * k, 5 * k)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(-36 * k, 0, 6 * k, 0, Math.PI * 2)
    ctx.fill()
    ctx.font = `800 ${Math.round(24 * k)}px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('LIVE', 12 * k, k)
    ctx.setTransform(1, 0, 0, 1, 0, 0)

    // Glass reflection: a faint band across the upper glass plus a soft diagonal sheen.
    strip(T0, T1, -scr + inset, -scr * 0.55)
    ctx.fillStyle = 'rgba(170,200,255,0.06)'
    ctx.fill()
    const sheen = ctx.createLinearGradient(0, 0, w, h * 0.6)
    sheen.addColorStop(0, 'rgba(160,200,255,0)')
    sheen.addColorStop(0.42, 'rgba(160,200,255,0)')
    sheen.addColorStop(0.5, 'rgba(160,200,255,0.10)')
    sheen.addColorStop(0.58, 'rgba(160,200,255,0)')
    strip(T0, T1, -scr + inset, -scr * 0.15)
    ctx.fillStyle = sheen
    ctx.fill()
    ctx.restore()
}
