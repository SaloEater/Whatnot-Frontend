'use client'

// Tier frame drawn over a card (card-frames-plan.md §4): 24 absolutely positioned pieces of the
// frame PNG, each a `div` whose background-size/position selects its slice. `border-image` can't do
// this (3x3 split only). Geometry lives in frameSlices.ts; this only paints it.

import React, { useMemo } from 'react'
import { FRAME_ASSETS, FrameTier } from './frameAssets'
import { frameSlices } from './frameSlices'

export function CardFrame({ tier, width, height, scale }: { tier: FrameTier; width: number; height: number; scale?: number }) {
    const asset = FRAME_ASSETS[tier]
    const pieces = useMemo(
        () => frameSlices(asset, width, height, scale),
        [asset, width, height, scale]
    )
    return (
        <div className="crd-frame">
            {pieces.map((p, k) => {
                const kx = p.width / p.sw
                const ky = p.height / p.sh
                return (
                    <div
                        key={k}
                        className="crd-frame-piece"
                        style={{
                            left: `${p.left}px`, top: `${p.top}px`, width: `${p.width}px`, height: `${p.height}px`,
                            backgroundImage: `url(${asset.src})`,
                            backgroundSize: `${asset.w * kx}px ${asset.h * ky}px`,
                            backgroundPosition: `${-p.sx * kx}px ${-p.sy * ky}px`,
                        }}
                    />
                )
            })}
        </div>
    )
}
