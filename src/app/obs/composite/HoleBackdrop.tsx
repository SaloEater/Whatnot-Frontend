'use client'

import { CANVAS, COLOR } from './tokens'

export interface HoleRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Opaque `COLOR.cella` fill everywhere on the canvas EXCEPT `rect`.
 *
 * Built as ONE element whose four borders form the hole (content box =
 * `rect`). Four abutting panels would leave sub-pixel seams at the rect's
 * edges once the stage scale lands them between device pixels — a single
 * element cannot seam against itself.
 *
 * Parameterized (was `BackgroundHole`, hardcoded to the live overlay's
 * `PORTAL_RECT`) so the results screen can reuse the identical trick for its
 * own rectangle — the camera window at the foot of the board — instead of
 * duplicating this component. Same idea, different hole: the live page
 * punches a hole through the board for the camera; the results page punches
 * one for the camera window band. Neither opaque fill may cover the camera
 * feed, hence a real CSS hole rather than a plate drawn "underneath".
 */
export function HoleBackdrop({ rect }: { rect: HoleRect }) {
  const { left, top, width, height } = rect

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        boxSizing: 'border-box',
        borderStyle: 'solid',
        borderColor: COLOR.cella,
        borderTopWidth: top,
        borderLeftWidth: left,
        borderRightWidth: CANVAS.width - (left + width),
        borderBottomWidth: CANVAS.height - (top + height),
        pointerEvents: 'none',
      }}
      aria-hidden
    />
  )
}
