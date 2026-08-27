import { BASELINE, S, TYPE, slotTransform } from './tokens'

/**
 * Both digits ship in every face; the visible one is selected by the card's
 * `data-numeral` attribute in CSS. The timeline sets that attribute imperatively
 * (see page.tsx), which keeps React out of the animation loop entirely — a
 * re-render mid-cycle would risk clobbering the inline transforms that WAAPI and
 * the per-loop reset are writing.
 *
 * The numeral means PULL ORDER, not card identity, and is assigned at draw time.
 * That is why a random fan slot always yields "1" for the first pull: face-down
 * cards have no identity until they are drawn.
 *
 * y is the BASELINE. A digit is 0.697em tall and sits on the baseline, so
 * centring it in the card puts the baseline at 30 + 34.8/2 = 47.4. Flex-centring
 * would centre the em box instead and leave the glyph visibly high.
 */
function Digits() {
  return (
    <svg className="sp-face-digits" viewBox={`0 0 ${S} ${S}`} width={S} height={S} aria-hidden="true">
      <text className="sp-digit sp-digit-1" x={S / 2} y={BASELINE.numeral} fontSize={TYPE.numeral}>
        1
      </text>
      <text className="sp-digit sp-digit-2" x={S / 2} y={BASELINE.numeral} fontSize={TYPE.numeral}>
        2
      </text>
    </svg>
  )
}

/**
 * One card. Square, dark-gold border on both faces.
 *
 * TWO NESTED TRANSFORM LAYERS, and the split is load-bearing:
 *   .sp-card    — where it is and how it is tilted (translate + in-plane rotate)
 *   .sp-card-3d — which face is showing (rotateY for the draw/return, rotateX for
 *              the exit tumble)
 * Keeping them separate is what lets the draw's 400ms flip run inside the 450ms
 * lift as two independent animations, instead of one keyframe list that would
 * have to hand-interpolate the position at the moment the flip completes.
 *
 * THREE STACKED FRONT VARIANTS, cross-faded by OPACITY. The spec allows transform
 * and opacity only (§9), which rules out transitioning border-color, color, or
 * filter: saturate() to reach the stashed and dead states. So each state is a
 * complete pre-styled face and igniting is an opacity ramp. That is 5 layers x 6
 * cards, but only ever 2 cards are mid-animation and the rest sit static at
 * opacity 0.
 */
export function Card({ slot }: { slot: number }) {
  return (
    /*
     * The rest transform is stamped at render time so the fan is fully assembled
     * on frame one (spec §7) with no dependency on when the driver's effect runs.
     *
     * The timeline then overwrites .style.transform imperatively. That does not
     * fight React: `style` is only rewritten when the diff sees a changed value,
     * and this object holds the same string on every render, so React never
     * touches it again after mount.
     */
    <div className="sp-card" data-numeral="1" style={{ transform: slotTransform(slot) }}>
      <div className="sp-card-3d">
        <div className="sp-card-glow" />
        <div className="sp-face sp-face-back" />
        <div className="sp-face sp-face-neutral">
          <Digits />
        </div>
        <div className="sp-face sp-face-stashed">
          <Digits />
        </div>
        <div className="sp-face sp-face-dead">
          <Digits />
        </div>
      </div>
    </div>
  )
}
