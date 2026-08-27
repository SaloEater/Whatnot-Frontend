'use client'

// Scales the fixed 1080x1920 layout canvas to whatever the OBS browser source (or Chrome window,
// under ?dev=1) actually measures. CSS `calc`/`vmin` scaling is not reliable in OBS's CEF, so the
// scale factor is computed in JS on mount + resize — same approach as
// obs/animation/stashorpass_simple/useBannerScale.ts, generalized to 1080x1920 and to center the
// canvas (a banner is full-bleed on one axis; this canvas can letterbox on either axis).

import {ReactNode, useEffect, useLayoutEffect, useState} from 'react'
import {CANVAS} from '../schema'

// useLayoutEffect during SSR only logs a warning and never runs — fall back to useEffect there
// so the first client render still starts from the same scale:1/no-offset markup the server sent.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

type Transform = {scale: number; cx: number; cy: number}

function computeTransform(): Transform {
    const scale = Math.min(window.innerWidth / CANVAS.w, window.innerHeight / CANVAS.h)
    const cx = (window.innerWidth - CANVAS.w * scale) / 2
    const cy = (window.innerHeight - CANVAS.h * scale) / 2
    return {scale, cx, cy}
}

export function Stage({children}: {children: ReactNode}) {
    // Starts at scale 1 / no offset on both server and client so hydration matches byte for
    // byte; the layout effect below replaces it synchronously before paint.
    const [transform, setTransform] = useState<Transform>({scale: 1, cx: 0, cy: 0})

    useIsomorphicLayoutEffect(() => {
        const update = () => setTransform(computeTransform())
        update()
        window.addEventListener('resize', update)
        return () => window.removeEventListener('resize', update)
    }, [])

    return (
        <div className="lay-stage">
            <div
                className="lay-canvas"
                style={{
                    width: CANVAS.w,
                    height: CANVAS.h,
                    transform: `translate(${transform.cx}px, ${transform.cy}px) scale(${transform.scale})`,
                }}
            >
                {children}
            </div>
        </div>
    )
}
