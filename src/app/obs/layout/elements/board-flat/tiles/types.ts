// Core types for the flat-board tiled texture system.
// See MOB-Composite/flat board design.md for the model this implements.

/** A cell position on the board grid. */
export interface Pos {
    row: number
    col: number
}

/** Which of a cell's four sides sit on the group's outer boundary. */
export interface Exposure {
    top: boolean
    right: boolean
    bottom: boolean
    left: boolean
}

/** A skin piece kind. */
export type Piece = 'fill' | 'edge' | 'corner'

/** One of the 9 sub-tiles composing a cell: a piece plus a rotation (degrees). */
export interface SubTile {
    piece: Piece
    rotation: 0 | 90 | 180 | 270
}

/** A rectangular group of adjacent flipped cells (inclusive bounds). */
export interface Group {
    r0: number
    c0: number
    r1: number
    c1: number
    /** Total cell count = (r1-r0+1) * (c1-c0+1). */
    cells: number
    /** Size tier, keyed by cell count: 1 (1-3), 2 (4-8), 3 (9+). */
    tier: 1 | 2 | 3
    /** Stable identity used to seed style/variant/accent choices. */
    key: string
}

/** A flipped cell position with its sale order (Event.index from the BE). */
export interface OrderedPos extends Pos {
    order: number
}

/**
 * A grouping strategy turns the flipped cells (with their sale order) into
 * rectangular groups. Grouping replays the sale sequence, so the partition is
 * a pure function of the sold data — identical after a page reload.
 * `strictRectangleMerge` is the default; swap for a different rule without
 * touching the renderer.
 */
export type GroupingStrategy = (cells: OrderedPos[]) => Group[]

/** An accent motif placed within a group, in sub-tile coordinates. */
export interface PlacedAccent {
    file: string
    /** Top-left in tiles, relative to the group's top-left tile. */
    tileX: number
    tileY: number
    /** Footprint in tiles. */
    tilesW: number
    tilesH: number
}
