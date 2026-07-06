// A cell's exposure = which sides sit on its group's outer boundary.
// Because a group is a filled rectangle, a side is Exposed exactly when the cell
// is on that edge of the rectangle (the neighbor beyond it is not in the group).

import {Exposure, Group, Pos} from "./types"

export function cellExposure(pos: Pos, group: Group): Exposure {
    return {
        top: pos.row === group.r0,
        bottom: pos.row === group.r1,
        left: pos.col === group.c0,
        right: pos.col === group.c1,
    }
}
