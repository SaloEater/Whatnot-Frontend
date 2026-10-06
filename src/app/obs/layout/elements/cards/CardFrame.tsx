'use client'

// Tier frame drawn over a card (card-frames-plan.md §4): 24 absolutely positioned pieces of the
// frame PNG, each a `div` whose background-size/position selects its slice. `border-image` can't do
// this (3x3 split only). Geometry lives in frameSlices.ts; this only paints it.

import React, { useMemo } from 'react'
import { FRAME_ASSETS, FrameTier } from './frameAssets'
import { frameHole, frameSlices } from './frameSlices'

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

/**
 * Plain fill under the card, covering the frame's hole (card-frames-plan.md, 2026-10-06): a card whose
 * shape doesn't fill the hole — letterboxed `object-fit: contain`, or a v1 stack shorter than the
 * hole's minimum height — otherwise shows the stage through the gap. Rendered BEFORE the card image
 * (plain DOM order, no z-index games) and sized with the same scale the frame itself uses, so the
 * fill never pokes out past the rails; the rails' chamfered corners cover its corners.
 */
// Centre-glow strength and how far (as % of the hole's half-diagonal) it reaches before fading out.
const GLOW_ALPHA = 0.35
const GLOW_REACH = 150

export function FrameBackground({ tier, width, height, scale }: { tier: FrameTier; width: number; height: number; scale?: number }) {
    const asset = FRAME_ASSETS[tier]
    const hole = useMemo(() => frameHole(asset, width, height, scale), [asset, width, height, scale])
    return (
        <div
            className="crd-frame-bg"
            style={{
                left: `${hole.left}px`, top: `${hole.top}px`, width: `${hole.width}px`, height: `${hole.height}px`,
                // Soft white glow from the centre out, fading to nothing before the rails, over the tier's panel tone.
                background: `radial-gradient(ellipse at center, rgba(255,255,255,${GLOW_ALPHA}) 0%, rgba(255,255,255,0) ${GLOW_REACH}%), ${asset.bg}`,
            }}
        />
    )
}
