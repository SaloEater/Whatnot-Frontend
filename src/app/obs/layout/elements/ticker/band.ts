// The ticker's curved LED band, drawn in code (`band: 'drawn'`) as a replacement for curve.png.
//
// Why: curve.png is 2170px wide but shown ~1080 wide, so its thin rail highlights land at ~1px and
// staircase ("ladder") along the curve, and the browser re-scales the whole texture every frame the
// text moves. This draws the same design — dark band, steel rails lit from above, LEDs set into the
// rails — ONCE, at the exact canvas size, with every line at least 2 canvas px. Nothing here moves,
// so the canvas is never redrawn while the ticker runs.
//
// Geometry lives in the texture's own 2170x725 space (the space TICKER_PATH_D uses) and is fitted
// with the same "meet" letterbox as the SVG on top, so band and text line up at any box size. Sizes
// are tuned for the default 1080-wide box and scale with it.

import { TICKER_ASSET } from './assets'

// Band centreline — a quadratic through the same ends as TICKER_PATH_D, 6px higher so the text
// (dominant-baseline middle) sits optically centred between the rails.
const P0: [number, number] = [0, 290]
const C: [number, number] = [1085, 490]
const P1: [number, number] = [2170, 290]

// LED positions along the band (curve parameter t), both rails — read off curve.png.
const LEDS_T = [0.07, 0.1875, 0.3225, 0.5, 0.675, 0.8125, 0.93]

// Sizes in canvas px at the reference scale (1080 wide).
const REF_SCALE = 1080 / TICKER_ASSET.w
const HALF = 44 // band centre -> rail centre
const RAIL = 16 // rail thickness
const LED_W = 46

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

export function drawTickerBand(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.clearRect(0, 0, w, h)
    const s = Math.min(w / TICKER_ASSET.w, h / TICKER_ASSET.h)
    if (!(s > 0)) return
    const ox = (w - TICKER_ASSET.w * s) / 2
    const oy = (h - TICKER_ASSET.h * s) / 2
    const k = s / REF_SCALE
    const half = HALF * k
    const rail = Math.max(6, Math.round(RAIL * k))

    // Canvas point at curve parameter t, offset `d` canvas px along the normal (d > 0 = down).
    const at = (t: number, d: number): [number, number, number] => {
        const [px, py] = point(t)
        const [gx, gy] = tangent(t)
        return [ox + px * s - gy * d, oy + py * s + gx * d, Math.atan2(gy, gx)]
    }

    const STEPS = 240
    const T0 = -0.03
    const T1 = 1.03
    const stroke = (d: number, width: number, color: string, alpha = 1) => {
        ctx.beginPath()
        for (let i = 0; i <= STEPS; i++) {
            const [x, y] = at(T0 + ((T1 - T0) * i) / STEPS, d)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
        }
        ctx.globalAlpha = alpha
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
        ctx.globalAlpha = 1
    }

    ctx.save()
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'

    // Band body, with a slightly lighter upper half.
    stroke(0, 2 * half, '#0a1d36')
    stroke(-half * 0.45, half * 0.5, '#0d2340', 0.8)

    // Rails: a steel channel lit from above, same stack top and bottom. Every line >= 2px.
    for (const c of [-half, half]) {
        ctx.save()
        ctx.shadowColor = 'rgba(50,130,255,0.6)'
        ctx.shadowBlur = 8 * k
        stroke(c, rail + 2, '#0a1a30')
        ctx.restore()
        stroke(c, rail, '#2e5178') // channel
        stroke(c - rail * 0.22, rail * 0.45, '#4c7aad') // lit upper half
        stroke(c - rail / 2 + 1, 2, '#6fb0ff') // top edge
        stroke(c - rail * 0.12, 2, '#d6ebff', 0.9) // specular line
        stroke(c + rail / 2 - 1, 2, '#7fa8d8', 0.9) // bottom edge
    }

    // LEDs set into the rails, each with a small static glow.
    const pw = Math.round(LED_W * k)
    const ph = rail - 4
    const pill = (pwid: number, phgt: number, color: string) => {
        ctx.beginPath()
        ctx.roundRect(-pwid / 2, -phgt / 2, pwid, phgt, phgt / 2.5)
        ctx.fillStyle = color
        ctx.fill()
    }
    for (const c of [-half, half]) {
        for (const t of LEDS_T) {
            const [x, y, angle] = at(t, c)
            const r = pw * 0.9
            const glow = ctx.createRadialGradient(x, y, 0, x, y, r)
            glow.addColorStop(0, 'rgba(90,170,255,0.85)')
            glow.addColorStop(0.45, 'rgba(50,130,255,0.3)')
            glow.addColorStop(1, 'rgba(40,120,255,0)')
            ctx.fillStyle = glow
            ctx.beginPath()
            ctx.ellipse(x, y, r, r * 0.6, angle, 0, Math.PI * 2)
            ctx.fill()

            ctx.save()
            ctx.translate(x, y)
            ctx.rotate(angle)
            pill(pw + 2, ph + 2, '#081628') // socket
            ctx.shadowColor = 'rgba(40,140,255,0.95)'
            ctx.shadowBlur = 10 * k
            pill(pw, ph, '#3d9bff')
            ctx.shadowBlur = 0
            pill(pw - 4, ph - 3, '#f2f9ff')
            ctx.restore()
        }
    }
    ctx.restore()
}
