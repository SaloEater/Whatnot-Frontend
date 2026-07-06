import {FC} from "react"
import {Group} from "./tiles/types"
import {Manifest, styleForGroup} from "./tiles/manifest"
import {placeAccents} from "./tiles/accents"
import './AccentOverlay.css'

const TILES_PER_CELL = 3

interface Props {
    manifest: Manifest | null
    groups: Group[]
    /** Column/row counts, so the overlay grid lines align with .flat-grid. */
    cols: number
    rows: number
}

/**
 * Overlay layer mirroring .flat-grid. Each group is a grid item spanning its
 * rectangle; accents are absolutely positioned inside it in tile-space %.
 */
export const AccentOverlay: FC<Props> = ({manifest, groups, cols, rows}) => {
    if (!manifest) return null
    return (
        <div className="flat-accent-layer" style={{'--cols': cols, '--rows': rows} as React.CSSProperties}>
            {groups.map(group => {
                const styleId = styleForGroup(manifest, group.key)
                const placed = placeAccents(manifest, group, styleId)
                if (placed.length === 0) return null

                const wTiles = (group.c1 - group.c0 + 1) * TILES_PER_CELL
                const hTiles = (group.r1 - group.r0 + 1) * TILES_PER_CELL

                return (
                    <div
                        key={group.key}
                        className="flat-accent-group"
                        style={{
                            gridColumn: `${group.c0 + 1} / ${group.c1 + 2}`,
                            gridRow: `${group.r0 + 1} / ${group.r1 + 2}`,
                        }}
                    >
                        {placed.map((a, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                key={i}
                                className="flat-accent-motif"
                                src={a.file}
                                alt=""
                                style={{
                                    left: `${(a.tileX / wTiles) * 100}%`,
                                    top: `${(a.tileY / hTiles) * 100}%`,
                                    width: `${(a.tilesW / wTiles) * 100}%`,
                                    height: `${(a.tilesH / hTiles) * 100}%`,
                                }}
                            />
                        ))}
                    </div>
                )
            })}
        </div>
    )
}
