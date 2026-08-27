// Per-cell 9-slice composition (design doc §3). Given a cell's exposure, decide
// each of its 9 sub-tiles: a piece (fill/edge/corner) and a rotation.
// Base orientations: edge = top side, corner = top-left. Sub-tiles are returned
// in row-major order: [TL, T, TR, L, C, R, BL, B, BR].

import {Exposure, SubTile} from "./types"

const FILL: SubTile = {piece: 'fill', rotation: 0}
const edge = (rotation: SubTile['rotation']): SubTile => ({piece: 'edge', rotation})
const corner = (rotation: SubTile['rotation']): SubTile => ({piece: 'corner', rotation})

// Rotation to point the base (top) edge at each side.
const EDGE_ROT = {top: 0, right: 90, bottom: 180, left: 270} as const

function edgeArea(exposed: boolean, rot: SubTile['rotation']): SubTile {
    return exposed ? edge(rot) : FILL
}

// A corner sub-tile is adjacent to two sides. Both exposed → outer corner; one
// exposed → that side's edge; neither → fill.
function cornerArea(
    aExposed: boolean, aRot: SubTile['rotation'],
    bExposed: boolean, bRot: SubTile['rotation'],
    cornerRot: SubTile['rotation'],
): SubTile {
    if (aExposed && bExposed) return corner(cornerRot)
    if (aExposed) return edge(aRot)
    if (bExposed) return edge(bRot)
    return FILL
}

export function cellSubTiles(x: Exposure): SubTile[] {
    return [
        cornerArea(x.top, EDGE_ROT.top, x.left, EDGE_ROT.left, 0),        // TL
        edgeArea(x.top, EDGE_ROT.top),                                    // T
        cornerArea(x.top, EDGE_ROT.top, x.right, EDGE_ROT.right, 90),     // TR
        edgeArea(x.left, EDGE_ROT.left),                                  // L
        FILL,                                                             // C
        edgeArea(x.right, EDGE_ROT.right),                               // R
        cornerArea(x.bottom, EDGE_ROT.bottom, x.left, EDGE_ROT.left, 270), // BL
        edgeArea(x.bottom, EDGE_ROT.bottom),                             // B
        cornerArea(x.bottom, EDGE_ROT.bottom, x.right, EDGE_ROT.right, 180), // BR
    ]
}
