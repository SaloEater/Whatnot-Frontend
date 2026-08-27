'use client'

// The `frame:static` registry component (obs-layout-plan.md §1.7). Renders a single image
// stretched to fill its box — used for a static overlay frame/border around the whole canvas
// (or any other box), sitting above or below the rest of the layout via its `z`.

import type { ElementProps } from '../../registry'

export function FrameElement({ element }: ElementProps) {
    if (element.kind !== 'frame' || !element.image) return null

    return (
        <img
            src={element.image}
            alt=""
            className="frame-static-img"
            style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                pointerEvents: 'none',
                display: 'block',
            }}
        />
    )
}

export default FrameElement
