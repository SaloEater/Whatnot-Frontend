import { BASELINE, CANVAS, CAP_CENTRE, RAIL, TYPE, X } from './tokens'

/**
 * One igniting word: four stacked <text> nodes inside a single <g>.
 *
 *   bloom    pre-blurred gold-bright duplicate, behind — animates with the ignite
 *   neutral  gold-mid, ALWAYS opacity 1, never animated
 *   ember    gold-bright, free-running breath, driven entirely by CSS
 *   ignite   gold-bright, the timeline's only headline channel
 *
 * Because the neutral layer is never touched, "the words are always coloured" is
 * structural rather than a rule someone has to remember — the same trick the card
 * faces use for their stashed and dead states.
 *
 * ALL FOUR MUST SIT INSIDE THIS ONE <g>, or the ignite's scale pop separates them.
 *
 * transform-origin is given in explicit user-space px (324px 126px / 756px 126px)
 * rather than relying on transform-box: fill-box, which is unreliable on SVG
 * <text>. It is the word's own cap centre, so the pop is symmetric: nothing
 * drifts, nothing reflows, and no neighbouring element moves.
 */
function Word({ id, x, label }: { id: 'stash' | 'pass'; x: number; label: string }) {
  const common = { x, y: BASELINE.headline, fontSize: TYPE.headline }
  return (
    <g
      className={`sp-word sp-word-${id}`}
      style={{ transformOrigin: `${x}px ${CAP_CENTRE}px` }}
    >
      <text className="sp-bloom" {...common}>
        {label}
      </text>
      <text className="sp-neutral" {...common}>
        {label}
      </text>
      <text className="sp-ember" {...common}>
        {label}
      </text>
      <text className="sp-ignite" {...common}>
        {label}
      </text>
    </g>
  )
}

/**
 * A conductor rail: chunky dashes in the gap flanking OR, at cap-centre height.
 *
 * Each dash is two stacked rects — an unlit gold-mid one at 0.25 that is always
 * visible, and a lit gold-bright one whose opacity is the animated channel. Same
 * pattern and same reason as the words: nothing in the headline ever goes dark.
 *
 * Both the unlit and the lit sets are emitted in FILL ORDER (index 0 nearest OR),
 * so querySelectorAll returns them in the order the timeline lights them.
 */
function Rail({ side, dashes }: { side: 'left' | 'right'; dashes: readonly number[] }) {
  return (
    <g className={`sp-rail sp-rail-${side}`}>
      {dashes.map((x, i) => (
        <rect
          key={`unlit-${i}`}
          className="sp-dash-unlit"
          x={x}
          y={RAIL.top}
          width={RAIL.dashWidth}
          height={RAIL.thickness}
        />
      ))}
      {dashes.map((x, i) => (
        <rect
          key={`lit-${i}`}
          className="sp-dash-lit"
          x={x}
          y={RAIL.top}
          width={RAIL.dashWidth}
          height={RAIL.thickness}
        />
      ))}
    </g>
  )
}

/**
 * The headline: STASH / OR / PASS, plus the two conductor rails.
 *
 * It is the destination labelling for row 2 — a card landing in a zone ignites the
 * word directly above it — so the x positions here must stay locked to the zone
 * centres in tokens.ts. Vertical alignment is the only thing connecting card to
 * word; there are no arrows or connectors.
 *
 * SVG, not HTML, because §4 specifies type by cap height and baseline. In SVG,
 * <text y> IS the baseline. In CSS you would be reverse-engineering it out of
 * line-height, the font's ascent/descent and half-leading, and every one of those
 * is a place for the layout to land silently a few px off.
 *
 * OR is written literally. The font maps lowercase to cap forms anyway, so "or"
 * would render identically, but relying on that substitution hides the intent.
 * It is smaller and dimmer than the other two, and its ceiling — 1.00 — is
 * exactly a resting word's floor, which is what lets it charge and discharge
 * without ever entering the ignite state.
 */
export function Headline() {
  return (
    <svg
      className="sp-headline"
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      width={CANVAS.width}
      height={CANVAS.height}
      aria-hidden="true"
    >
      {/*
       * No plate here. The 90% ground is the panel in page.tsx, which runs to the
       * bottom edge and so has to render BELOW the cards — this layer stays above
       * them, and a plate at this depth would hide the whole animation.
       */}
      <Rail side="left" dashes={RAIL.left} />
      <Rail side="right" dashes={RAIL.right} />

      <Word id="stash" x={X.stash} label="STASH" />

      {/*
       * OR is two stacked layers for the same reason the words are four: a
       * keyline cannot change colour on an opacity animation, and animating
       * `stroke` is a paint property. The base carries the resting body and its
       * grey keyline and is never animated; the charge layer crossfades in over
       * it, taking the keyline to white as it goes.
       */}
      <g className="sp-word-or">
        <text className="sp-or-base" x={X.hover} y={BASELINE.or} fontSize={TYPE.or}>
          OR
        </text>
        <text className="sp-or-charge" x={X.hover} y={BASELINE.or} fontSize={TYPE.or}>
          OR
        </text>
      </g>

      <Word id="pass" x={X.pass} label="PASS" />
    </svg>
  )
}

/**
 * PULL AGAIN, on its OWN layer BENEATH the cards.
 *
 * It sits at the HOVER POINT, not under PASS: it lights up at the exact spot
 * where the next card is about to appear, and then the card appears there and
 * fulfils it — prediction, then payoff, in one location. It is the only copy
 * carrying the entire rule.
 *
 * Why its own layer instead of living in the headline SVG: the label holds
 * through the whole hold beat, and card 2 arcs straight THROUGH the hover point
 * on its way to STASH between 1.85s and 2.45s. Above the cards, it would swallow
 * card 2 for that whole stretch. Below them, the card passes in front — which is
 * also the better read, since the card arrives on top of the promise it fulfils.
 *
 * It carries no plate of its own: the panel already covers this region, and a
 * second 90% rect on top would composite to ~99%, a visibly darker patch inside
 * an otherwise even ground.
 */
export function PullAgain() {
  return (
    <svg
      className="sp-pull-again-layer"
      viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`}
      width={CANVAS.width}
      height={CANVAS.height}
      aria-hidden="true"
    >
      <g className="sp-pull-again">
        <text x={X.hover} y={BASELINE.pullAgain} fontSize={TYPE.pullAgain}>
          PULL AGAIN
        </text>
      </g>
    </svg>
  )
}
