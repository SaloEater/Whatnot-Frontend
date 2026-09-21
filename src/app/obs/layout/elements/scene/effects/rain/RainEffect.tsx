'use client'

// `rain` effect (obs-scene-element-plan.md §1.2/§5) — the scene's one `requestAnimationFrame` loop
// (§1.4: every other layer animates only `transform`/`opacity` and stays on the compositor; rain
// alone needs per-particle drawing, so it gets the one canvas and the one rAF loop, throttled to
// 30 fps). A fill layer (§1.1): the canvas's DRAWING BUFFER (`width`/`height` attributes) is set to
// `box.w`/`box.h` in px and re-set whenever the box changes — never a CSS width/height stretch,
// which would scale already-rasterised pixels instead of redrawing at the new pixel grid.
//
// Two independent things change over time here, deliberately kept separate:
//   - particle COUNT (density) = `round(intensity * 400)`, halved under `quality: 'reduced'` — a
//     plain function of the current props, reseeded whenever it (or the box size) changes.
//   - the layer's global ALPHA — animated smoothly over 1 s toward `intensity` on every intensity
//     change (obs-scene-element-plan.md §5: "rather than snapping"), independent of the 30 fps
//     draw throttle so the fade itself stays smooth even while draws are skipped.
// The loop is started once on mount (if there's anything to show) and by every intensity change;
// it stops itself, from inside the frame callback, once a fade toward zero has actually finished —
// so it costs nothing while fully faded out, and never needs tearing down/rebuilding just because a
// prop changed (only unmount does that, via the cleanup below).

import { useEffect, useRef } from 'react'
import type { EffectProps } from '../../effectRegistry'
import type { SceneEffect } from '../../../../schema'
import './RainEffect.css'

type RainEffectProps = EffectProps<Extract<SceneEffect, { id: 'rain' }>>

type Drop = { x: number; y: number; length: number; speed: number }

const BASE_PARTICLE_COUNT = 400
const TARGET_FPS = 30
const FRAME_MS = 1000 / TARGET_FPS
const FADE_MS = 1000
// Sideways drift per px of fall, giving the streaks their slant (§5: "drawn as a 1-px
// semi-transparent streak with slight slant").
const SLANT = 0.18

function seedDrops(box: { w: number; h: number }, count: number): Drop[] {
    return Array.from({ length: count }, () => ({
        x: Math.random() * box.w,
        y: Math.random() * box.h,
        length: 14 + Math.random() * 18,
        speed: 500 + Math.random() * 400, // box-px / second
    }))
}

export function RainEffect({ box, effect, quality }: RainEffectProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null)
    const dropsRef = useRef<Drop[]>([])
    const rafRef = useRef<number | null>(null)
    const lastFrameRef = useRef(0)

    // The layer's currently-DISPLAYED alpha and the in-flight fade toward the latest intensity —
    // read/written only inside the frame callback and the fade-trigger effect below, never through
    // React state (nothing here needs a re-render).
    const alphaRef = useRef(0)
    const fadeFromRef = useRef(0)
    const fadeToRef = useRef(0)
    const fadeStartRef = useRef(0)
    const intensityRef = useRef(effect.intensity)
    intensityRef.current = effect.intensity

    const particleCount = Math.round(BASE_PARTICLE_COUNT * effect.intensity * (quality === 'reduced' ? 0.5 : 1))

    // Reseed the particle pool whenever its size or the box's own size changes — a resize must
    // redraw at the new pixel grid, and a count change must not carry over stale/mismatched drops.
    // Exception: a count of ZERO keeps the previous pool — the alpha fade toward 0 below still has
    // up to 1 s to run, and it needs drops to draw while it does; `frame` clears the canvas itself
    // once that fade completes, so nothing stale survives past it.
    useEffect(() => {
        if (particleCount === 0) return
        dropsRef.current = seedDrops({ w: box.w, h: box.h }, particleCount)
    }, [particleCount, box.w, box.h])

    // Canvas BACKING STORE size only (§1.1/§5: never CSS-stretched).
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = box.w
        canvas.height = box.h
    }, [box.w, box.h])

    function frame(now: number) {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) {
            rafRef.current = null
            return
        }

        const fadeT = Math.min(1, (now - fadeStartRef.current) / FADE_MS)
        alphaRef.current = fadeFromRef.current + (fadeToRef.current - fadeFromRef.current) * fadeT

        // Fully stop once the current target is zero AND the fade has actually reached zero — a
        // fade still in flight (even toward zero) needs more frames to draw.
        if (intensityRef.current === 0 && fadeT >= 1) {
            alphaRef.current = 0
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            rafRef.current = null
            return
        }

        if (now - lastFrameRef.current >= FRAME_MS) {
            const dt = (now - lastFrameRef.current) / 1000
            lastFrameRef.current = now
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.globalAlpha = alphaRef.current
            ctx.strokeStyle = 'rgba(214, 228, 255, 0.65)'
            ctx.lineWidth = 1
            for (const drop of dropsRef.current) {
                drop.y += drop.speed * dt
                drop.x += drop.speed * dt * SLANT
                if (drop.y - drop.length > canvas.height) {
                    drop.y = -drop.length
                    drop.x = Math.random() * canvas.width
                }
                ctx.beginPath()
                ctx.moveTo(drop.x, drop.y)
                ctx.lineTo(drop.x - drop.length * SLANT, drop.y - drop.length)
                ctx.stroke()
            }
        }

        rafRef.current = requestAnimationFrame(frame)
    }

    function ensureRunning() {
        if (rafRef.current !== null) return
        lastFrameRef.current = performance.now()
        rafRef.current = requestAnimationFrame(frame)
    }

    // Kick off a fresh 1 s fade toward the new intensity every time it changes (including the
    // initial mount, fading in from 0), and make sure the loop is running to animate it.
    useEffect(() => {
        fadeFromRef.current = alphaRef.current
        fadeToRef.current = effect.intensity
        fadeStartRef.current = performance.now()
        ensureRunning()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effect.intensity])

    // The ONE place that cancels the rAF — on unmount only. The effect above only ever (re)starts
    // the loop, never stops it early (that is `frame`'s own job, once a fade-to-zero completes).
    useEffect(() => {
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current)
                rafRef.current = null
            }
        }
    }, [])

    return <canvas ref={canvasRef} className="scene-rain" />
}

export default RainEffect
