'use client'

// The `imageBox` registry component (obs-image-box-plan.md §3.5). Renders the operator's
// uploaded image (element.url — a public DigitalOcean Spaces URL, set via ImageBoxSettings)
// directly inside the layout at the element's box/layer, like any other element. Returns null
// when no image has been uploaded yet, unless `?dev=1` (a plain Chrome tab, no OBS), where a
// dashed outline stands in so a placed-but-empty box is still visible while building a layout.

import { useEffect, useState } from 'react'
import type { ElementProps } from '../../registry'
import type { ImageFit } from '../../schema'
import { DEFAULT_IMAGE_POSITION } from '../../schema'
import './ImageBoxElement.css'

export const DEFAULT_IMAGE_FIT: ImageFit = 'contain'

// Exported so ImageBoxSettings' interactive preview can render the pan control with the exact
// same `object-fit` mapping the layout uses.
export const OBJECT_FIT: Record<ImageFit, 'contain' | 'cover' | 'fill'> = {
    contain: 'contain',
    cover: 'cover',
    stretch: 'fill',
}

function readDevMode(): boolean {
    try {
        return new URLSearchParams(window.location.search).get('dev') === '1'
    } catch {
        return false
    }
}

export function ImageBoxElement({ element }: ElementProps) {
    // Read after mount: `window` does not exist during SSR, and the first client render must
    // match the server's (empty) markup byte for byte.
    const [devMode, setDevMode] = useState(false)
    useEffect(() => {
        setDevMode(readDevMode())
    }, [])

    if (element.kind !== 'imageBox') return null

    const url = element.url
    if (!url) {
        if (!devMode) return null
        return (
            <div className="imgbox-root imgbox-root--empty">
                <div className="imgbox-label">Image (no file)</div>
            </div>
        )
    }

    const objectFit = OBJECT_FIT[element.fit ?? DEFAULT_IMAGE_FIT]
    const p = element.position ?? DEFAULT_IMAGE_POSITION
    const objectPosition = `${p.x}% ${p.y}%`

    return (
        <div className="imgbox-root">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                className="imgbox-img"
                src={url}
                alt=""
                style={{ objectFit, objectPosition }}
                draggable={false}
            />
        </div>
    )
}

export default ImageBoxElement
