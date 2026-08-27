'use client'

// Absolute wrapper every registry component renders inside — the component itself never needs to
// know its own screen position, only its box's w/h (obs-layout-plan.md §1.4). Clipped
// (`overflow:hidden`) by default; boxless elements (`hasBox: false`, §1.9) are rendered with
// `clip={false}` since they cover the full canvas and position their own content, sometimes
// outside their nominal box (e.g. a ring drawn around another element's box).

import {ReactNode} from 'react'
import type {Box} from '../schema'

export function ElementFrame({box, z, clip = true, children}: {box: Box; z?: number; clip?: boolean; children: ReactNode}) {
    return (
        <div
            className="lay-element-frame"
            style={{left: box.x, top: box.y, width: box.w, height: box.h, zIndex: z ?? 0, overflow: clip ? 'hidden' : 'visible'}}
        >
            {children}
        </div>
    )
}
