'use client'

// The `frame:static` registry component (obs-layout-plan.md §1.7, rewritten in §2.5). Used to
// render a single `<img>` stretched over the whole canvas; now draws the frame itself, as two
// stacked bands working in from the canvas edge:
//   - plain black fill, per-side and per-stage-resolvable (`resolveBorders` in ../../config.ts,
//     which mirrors `resolveBox`'s `placements[phase] ?? placements.all` rule exactly);
//   - the gradient frame just inside it, one thickness on all four sides (`resolveFrameWidth`),
//     filled with a single canvas-wide diagonal gradient: black at the top-right and bottom-left
//     corners, bronze through the middle. That gradient is global — one gradient across the whole
//     1080x1920 canvas, of which only the frame band is painted — so opposite sides pick up
//     different parts of it instead of each repeating the ramp, and it drifts left to right on a
//     seamless loop (see FrameElement.css for the geometry that makes the loop join invisible).
// Everything inside those two bands is left fully transparent so the board (and everything else)
// underneath stays visible. Boxless (`hasBox: false` in registry.ts) — always the whole canvas —
// and its `z` still flips it above/below the rest of the layout via FrameSettings.tsx's toggle.

import type { ElementProps } from '../../registry'
import { resolveBorders, resolveFrameWidth } from '../../config'
import { CANVAS } from '../../schema'
import './FrameElement.css'

// The drifting gradient layer is three canvases wide so it still covers the canvas at both ends of
// its one-loop slide — see the geometry note in FrameElement.css.
const DRIFT_SPAN = CANVAS.w * 3

// Fixed black rule on the INNER side of the gradient frame — the edge that meets the board, where
// it has something to read against (on the outer side it would just abut the black fill). Not a
// setting: it is what stops the gradient bleeding straight into the content behind the frame.
const INNER_RULE_PX = 2

export function FrameElement({ element, phase }: ElementProps) {
    if (element.kind !== 'frame') return null
    // `borders` is the black fill's reach in from each screen edge; the frame sits inside it, and
    // the inner rule inside that again — so a side is fill, then frame, then 2px.
    const fill = resolveBorders(element, phase)
    const frameWidth = resolveFrameWidth(element)
    const innerRule = {
        top: fill.top + frameWidth,
        right: fill.right + frameWidth,
        bottom: fill.bottom + frameWidth,
        left: fill.left + frameWidth,
    }

    return (
        <div className="frm-root">
            {/* The black fill outside the frame. Drawn as borders so the four sides mitre
                themselves and a side set to 0 simply disappears. */}
            <div
                className="frm-black"
                style={{
                    inset: 0,
                    borderTopWidth: fill.top,
                    borderRightWidth: fill.right,
                    borderBottomWidth: fill.bottom,
                    borderLeftWidth: fill.left,
                }}
            />
            {/* The gradient frame: inset by the black fill, `frameWidth` thick. The width is fed
                in as padding — FrameElement.css masks `.frm-mat` down to exactly that padding
                ring, so the drifting gradient inside it paints on the frame and nowhere else. */}
            <div
                className="frm-mat"
                style={{
                    top: fill.top,
                    right: fill.right,
                    bottom: fill.bottom,
                    left: fill.left,
                    padding: frameWidth,
                }}
            >
                {/* Sized and offset in canvas units, NOT percentages of the inset ring above, so
                    the gradient stays anchored to the canvas however wide the black fill is. */}
                <div
                    className="frm-drift"
                    style={{
                        width: DRIFT_SPAN,
                        height: CANVAS.h,
                        left: -fill.left,
                        top: -fill.top,
                    }}
                />
            </div>
            {/* The 2px rule closing the frame off on the inside — same bordered-ring trick as the
                fill, inset past the frame and uniform on all four sides. */}
            <div
                className="frm-black"
                style={{
                    top: innerRule.top,
                    right: innerRule.right,
                    bottom: innerRule.bottom,
                    left: innerRule.left,
                    borderWidth: INNER_RULE_PX,
                }}
            />
        </div>
    )
}

export default FrameElement
