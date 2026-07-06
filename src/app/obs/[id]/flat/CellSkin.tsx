import {FC} from "react"
import {Exposure} from "./tiles/types"
import {cellSubTiles} from "./tiles/skin"
import {Manifest, piecePath, variantCount} from "./tiles/manifest"
import {pick} from "./tiles/hash"
import './CellSkin.css'

interface Props {
    manifest: Manifest
    exposure: Exposure
    styleId: string
    tier: number
    /** Stable per-cell key for deterministic variant selection. */
    cellKey: string
}

/**
 * Renders a flipped cell's skin as ONE inline SVG composing the 3×3 sub-tiles
 * in a single vector coordinate space. Unlike a grid of divs with background
 * images, adjacent <image> elements share exact coordinates and rasterize in
 * one pass — so sub-pixel rounding can't open hairline seams between tiles.
 */
export const CellSkin: FC<Props> = ({manifest, exposure, styleId, tier, cellKey}) => {
    const subs = cellSubTiles(exposure)
    return (
        <svg className="cell-skin" viewBox="0 0 3 3" preserveAspectRatio="none">
            {subs.map((st, i) => {
                const count = variantCount(manifest, styleId, tier, st.piece)
                const variant = pick(count, cellKey, st.piece, i)
                const url = piecePath(manifest, styleId, tier, st.piece, variant)
                const x = i % 3
                const y = Math.floor(i / 3)
                return (
                    <image
                        key={i}
                        href={url}
                        x={x}
                        y={y}
                        width={1}
                        height={1}
                        preserveAspectRatio="none"
                        transform={st.rotation ? `rotate(${st.rotation} ${x + 0.5} ${y + 0.5})` : undefined}
                    />
                )
            })}
        </svg>
    )
}
