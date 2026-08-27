/**
 * Design tokens for the "Stash or Pass" banner — /obs/animation.
 *
 * Every number here is a canvas pixel on a fixed 1080 x 360 stage. The stage is
 * scaled to the viewport once, at the root (useBannerScale), so nothing below
 * this line ever needs a viewport unit.
 *
 * This file is deliberately standalone: it does NOT import from
 * src/app/obs/composite/tokens.ts. That canvas is 1080 x 1920 and its palette is
 * the Mount Olympus one — this banner shares neither.
 *
 * See stash-or-pass-spec.md for the design brief. Section references below point
 * into that document.
 *
 * LEGIBILITY RULE — the banner is watched on a phone, inside a video player.
 * The browser source is 1080 wide, matching the portrait stream, so:
 *   canvas px / 3 = apparent phone px
 * The 100px headline cap is ~33px on a phone; nothing readable falls below ~10.
 */

export const CANVAS = {
  width: 1080,
  height: 360,
  /** Divide any canvas px by this to get apparent size on a phone. */
  phoneDivisor: 3,
} as const

// ---------------------------------------------------------------------------
// Geometry (spec §3)
// ---------------------------------------------------------------------------

/** Card side length. Cards are square. S = 0.167 x H. */
export const S = 60
export const HALF_S = S / 2

/**
 * Row 2 is raised by this much from where the plain 70/30 split would put it.
 *
 * ONE CONSTANT, and everything in row 2 derives from it — zone centre, fan pivot,
 * PULL AGAIN's baseline, and the exit tumble's waypoints. Changing this number
 * moves the whole card apparatus together; changing any of them individually
 * pulls the layout apart, because the tumble's geometry is measured relative to
 * where the card starts.
 *
 * SIDE EFFECT WORTH KNOWING: at 50 the fan is no longer half-clipped by the
 * bottom edge. Slot centres move to y 310.6-326.0, so the outer cards' bottoms
 * land at 356 against a 360 edge — the deck is fully visible, floating ~4px
 * clear, rather than reading as a hand held at the frame edge. Set this back to
 * 0 to restore the clipped deck.
 */
export const ROW2_LIFT = 50

export const ROW = {
  /** Row 1 — the headline. y 0-252, 70% of H. */
  oneHeight: 252,
  /** Zones sub-row — landing zones + hover point. 1.3S tall. */
  zonesTop: 252 - ROW2_LIFT,
  zonesHeight: 78,
  /** Deck sub-row — the fan. 0.5S tall. */
  deckTop: 330 - ROW2_LIFT,
  deckHeight: 30,
} as const

/** Centre of the zones sub-row. All three zone points share it. */
export const ZONE_Y = 291 - ROW2_LIFT

export const X = { stash: 324, hover: 540, pass: 756 } as const

/** Hover point to either zone. Purely horizontal. */
export const TRAVEL = 216

/**
 * The fan's virtual pivot sits below the banner; cards ride an arc around it,
 * which is what gives the outer cards their natural drop. R = 0.96H.
 */
export const FAN = {
  pivotX: 540,
  /** Rides up with the rest of row 2, so the arc keeps its shape. */
  pivotY: 705.6 - ROW2_LIFT,
  radius: 345.6,
  angles: [-17.5, -10.5, -3.5, 3.5, 10.5, 17.5],
} as const

export type Slot = { x: number; y: number; deg: number }

/**
 * COMPUTED, not transcribed. The spec's slot table (§3) is a check on this
 * arithmetic rather than a second copy of it that can drift out of sync.
 * Expected: x 436.1 / 477.0 / 518.9 / 561.1 / 603.0 / 643.9,
 *           y 376.0 / 365.8 / 360.6 / 360.6 / 365.8 / 376.0.
 */
export const SLOTS: Slot[] = FAN.angles.map((deg) => {
  const r = (deg * Math.PI) / 180
  return {
    x: FAN.pivotX + FAN.radius * Math.sin(r),
    y: FAN.pivotY - FAN.radius * Math.cos(r),
    deg,
  }
})

export const SLOT_COUNT = SLOTS.length

/**
 * `.sp-card` carries negative margins that put its own centre on the origin, so
 * these are raw canvas coordinates for the card's CENTRE — transformAt(324, 291)
 * is the STASH zone, straight off the table above, with no offset arithmetic
 * hidden in the keyframes.
 *
 * Shared by Card.tsx (which stamps the rest position at render time, so the fan
 * is assembled on frame one with no JS timing dependency) and timeline.ts.
 */
export const transformAt = (x: number, y: number, deg = 0) =>
  `translate(${x}px, ${y}px) rotate(${deg}deg)`

export const slotTransform = (s: number) => transformAt(SLOTS[s].x, SLOTS[s].y, SLOTS[s].deg)

/**
 * Perspective, declared PER CARD (page.css `.sp-card`), not on the shared card
 * layer. On the layer, all six cards share one vanishing point at the layer's
 * centre and any card away from it shears instead of compressing when it turns —
 * it never reaches edge-on and its ground stays a visible quad. Per card, the
 * origin is always the card's own centre. See the long note in page.css.
 */
export const PERSPECTIVE = 600

// ---------------------------------------------------------------------------
// Type (spec §4)
// ---------------------------------------------------------------------------

/**
 * ONE TYPEFACE: Grechka SHA. Three things the layout depends on —
 *
 *   1. SINGLE WEIGHT. There is no bold. Never set font-weight above 400 or the
 *      browser synthesises a faux-bold and smears the stencil cuts.
 *   2. NO TRUE LOWERCASE. Lowercase codepoints render as cap forms, so "or"
 *      comes out as "OR" regardless. The markup says OR explicitly.
 *   3. CAP HEIGHT IS 0.70em (1434/2048). To get a cap of height C, set
 *      font-size C / 0.70. Digits are 0.697em tall (1428/2048).
 *
 * Positions below are BASELINES, set as SVG <text y>. CSS cannot place a
 * baseline directly — you would be reverse-engineering it out of line-height,
 * ascent/descent and half-leading, and every one of those is a place to be
 * silently a few px off. In SVG, y IS the baseline.
 */
export const TYPE = {
  headline: 143,
  or: 70,
  pullAgain: 64,
  numeral: 50,
  capRatio: 1434 / 2048,
  digitRatio: 1428 / 2048,
} as const

/**
 * Cap CENTRES align on y = 126 (the middle of row 1), not baselines. At the 2:1
 * size ratio between the headline and "OR", baseline alignment would drop OR to
 * the floor of the line and make it read as a footnote rather than a connector.
 */
export const BASELINE = {
  /** cap centre 126 + cap 100/2 */
  headline: 176,
  /** cap centre 126 + cap 49/2 */
  or: 150.5,
  /**
   * Cap centre on ZONE_Y — the hover point — so the label follows row 2 up.
   * It has to: card 2 arcs through that exact point, and the whole
   * prediction-then-payoff beat depends on the two sharing a location.
   */
  pullAgain: ZONE_Y + (TYPE.pullAgain * TYPE.capRatio) / 2,
  /** Digit sits on the baseline: card centre 30 + glyph height 34.8/2. */
  numeral: 47.4,
} as const

/**
 * Measured advance widths in Grechka, in em. Multiply by a font-size to get the
 * rendered width — e.g. STASH at 143px is 1.631 * 143 = 233px, spanning 207->441
 * about its centre at x=324.
 *
 * REFERENCE ONLY as of the full-bleed panel — nothing computes from these any
 * more. They stay because they are measured from the font binary and are what
 * §4's headline-metrics table and every clearance claim in it are derived from;
 * re-deriving them means reopening the .otf. Reach for them if any type size
 * changes, or if something needs to be positioned against the words again.
 */
export const ADVANCE = { stash: 1.631, or: 0.687, pass: 1.358, pullAgain: 2.918 } as const

const CAP_HEADLINE = TYPE.headline * TYPE.capRatio

/**
 * The 90% panel: FULL CANVAS WIDTH, from just above the headline caps down to the
 * bottom edge. 0, 71 -> 1080, 360.
 *
 * It backs the headline, both landing zones, the hover point and the fan as one
 * continuous ground, and bleeds off both sides rather than floating as a box.
 * Only the top edge is inset — by PLATE_PAD above the CAP box, not the em box,
 * since these are caps with no descenders and the em box's descent would read as
 * lopsided padding above the words. "OR" is smaller and sits inside it already.
 *
 * That top edge is the one visible seam: a hard horizontal line at y=71 with the
 * 50% wash above it and 90% below. Full-bleed sides mean it reads as a band, so
 * the seam is the only thing giving the panel a shape — if it wants softening,
 * that is the edge to work on, not the sides.
 *
 * IT MUST RENDER BELOW THE CARD LAYER. Reaching the bottom edge means it spans
 * everything the cards move through; above them it would simply hide the whole
 * animation. See the layer order in page.css.
 */
export const PLATE_PAD = 5

export const PANEL = {
  x: 0,
  y: BASELINE.headline - CAP_HEADLINE - PLATE_PAD,
  width: CANVAS.width,
  height: CANVAS.height - (BASELINE.headline - CAP_HEADLINE - PLATE_PAD),
} as const

// ---------------------------------------------------------------------------
// Colour (spec §5) — final, not placeholder
// ---------------------------------------------------------------------------

export const COLOR = {
  /** Card borders and the card-back lattice. Still the card's colour. */
  goldDark: '#8A6A1F',
  /**
   * Headline neutral, "OR", and the unlit rail dashes.
   *
   * ~L*66 against goldDark's ~L*48. On a ~95% black panel L*48 reads as dull
   * ochre rather than gold, which is what made the idle headline look switched
   * off. The cost is most of the ignite's brightness headroom: the old jump was
   * L*48 -> 79, this one is 66 -> 79. That is why the ignite is re-engineered
   * onto bloom, the scale pop and the conductor rails — brightness is now the
   * smallest part of it.
   */
  goldMid: '#C99A38',
  goldBright: '#F0C24B',
  greyDead: '#6B6B6B',
  cardGround: '#14100A',
  /** Uniform half-transparent black over the whole canvas. Not a plate. */
  wash: 'rgba(0,0,0,.5)',
} as const

// ---------------------------------------------------------------------------
// Headline behaviour (spec §4, "Headline behaviour")
// ---------------------------------------------------------------------------

/** Cap centre of row 1. Pop origin, rail height, everything vertical up here. */
export const CAP_CENTRE = 126

/**
 * Each of STASH and PASS is four stacked <text> nodes in one <g>:
 *
 *   bloom    pre-blurred gold-bright duplicate, behind — animates with the ignite
 *   neutral  gold-mid, ALWAYS opacity 1, never animated
 *   ember    gold-bright, free-running breath, CSS only
 *   ignite   gold-bright, the timeline's only headline channel
 *
 * Because the neutral layer is never touched, "the words are always coloured" is
 * structural rather than a rule to remember — the same trick the card faces use.
 */
export const HEADLINE = {
  /** Default. The ember breath is all that shows. */
  idle: 0,
  /** During the card's travel, destination word only. */
  armed: 0.35,
  /** On landing. */
  ignite: 1,
  /** Settles here 180ms after the peak. */
  hold: 0.85,
  /** PASS through Loop B's hold — the route taken stays drawn. */
  trail: 0.25,

  /**
   * The scale pop, on the <g> wrapping all four layers.
   *
   * transform-origin MUST be explicit user-space px (324px 126px / 756px 126px).
   * Do not reach for transform-box: fill-box on SVG <text>.
   *
   * This is the amendment invariant 1 had to take: a symmetric scale about the
   * word's own cap centre. Nothing drifts, nothing reflows, no neighbour moves.
   */
  popScale: 1.035,
  popDur: 180,
  popPeakAt: 0.4,
  /** Where inside popDur the ignite layer reaches full before settling to hold. */
  riseAt: 0.33,

  afterglowDur: 800,

  /**
   * OR's CHARGE LAYER, not OR's visible opacity. OR is two stacked <text> nodes:
   * a base at 0.55 with a grey keyline that is never animated, and this charge
   * layer with a white keyline that crossfades over it. So the endpoints here are
   * 0 (base alone) and 1 (charge fully covering it, reading as OR at 1.00).
   *
   * The 0.55 resting level lives on `.sp-or-base` in page.css. OR never ignites:
   * its ceiling is exactly a resting STASH or PASS's floor.
   */
  orIdle: 0,
  orCharged: 1,

  /** Per-dash crossfade. */
  dashDur: 60,
} as const

/**
 * Ember breath — free-running sine, 0 <-> 0.10.
 *
 * IT IS A CSS ANIMATION, NOT A TIMELINE STEP, AND THAT IS LOAD-BEARING. The
 * driver cancels every WAAPI animation it owns at each loop boundary; an ember
 * built as a step would be reset every cycle, locking it to the 8.15s period.
 * Periodic motion is filtered out by the visual system within about thirty
 * seconds, which is the exact failure this whole feature exists to avoid.
 *
 * The two periods are incommensurate with each other AND with the cycle, so the
 * words drift in and out of phase and never resolve into a pattern. Running
 * underneath continuously also means no rejoin logic after an afterglow.
 *
 * resetStage must never write inline opacity to an ember layer — that would
 * override the animation.
 */
export const EMBER = { max: 0.1, stashPeriod: 5300, passPeriod: 6700 } as const

/**
 * Conductor rails — chunky dashes in the gaps flanking OR, at cap-centre height,
 * lighting in sequence as a card travels and going out in reverse as it leaves.
 *
 * 6px thick is a FLOOR, not a preference: at the /3 phone divisor it lands at
 * 2 phone px, where a 2px canvas hairline would be 0.67px and render
 * inconsistently.
 *
 * The flanking gaps are unequal (75px left, 95px right) because STASH is 233px
 * wide against PASS's 194px and both are centred on their zones — and OR cannot
 * move to fix it, since x=540 is the hover point, the card origin and PULL
 * AGAIN's centre. Equal padding from OR with unequal dash counts is the version
 * that reads as correct. Holding the dash UNIT fixed is what makes that true:
 * the unit is the material, the count is not.
 *
 * Both arrays are in FILL ORDER — index 0 nearest OR, filling outward.
 */
export const RAIL = {
  dashWidth: 8,
  gap: 5,
  pitch: 13,
  thickness: 6,
  /** Centred on the cap centre. */
  top: CAP_CENTRE - 3,
  unlit: 0.25,
  /** 453 -> 500. 16px to OR, 12px to STASH. */
  left: [492, 479, 466, 453],
  /** 580 -> 640. 16px to OR, 19px to PASS. */
  right: [580, 593, 606, 619, 632],
} as const

/**
 * Loop A headline track (spec §4). Times are ms from the loop's t=0.
 *
 * The rail fill is mapped to TRAVEL PROGRESS, not to the card's x. The card
 * covers 216px while the left rail spans 47px, so position-mapping would have the
 * rail full through the last 60% of the trip. The last dash lands 40ms before the
 * ignite, so the light visibly arrives and THEN the word answers.
 */
export const HEAD_A = {
  orCharge: 100,
  orChargeDur: 350,
  orDischarge: 650,
  orDischargeDur: 360,
  /** 0.71 / 0.81 / 0.91 / 1.01 — last dash 40ms before the 1.05 ignite. */
  railFill: 710,
  railFillStagger: 100,
  arm: 650,
  armDur: 360,
  ignite: 1050,
  /** 2.25-2.55: 4 dashes, 80ms apart, 60ms each. */
  railDrain: 2250,
  railDrainStagger: 80,
  afterglow: 2250,
} as const

/** Loop B headline track (spec §4). */
export const HEAD_B = {
  orCharge: 100,
  orChargeDur: 350,
  orDischarge: 650,
  orDischargeDur: 360,
  /**
   * OR takes NO charge for card 2, and stays at idle from 1.10 to the end of the
   * loop. PULL AGAIN owns the centre column across that whole span and is the
   * only copy carrying the rule; a second lit element stacked directly above it
   * would compete for the same glance. It also sharpens the card-1-pauses /
   * card-2-does-not asymmetry instead of blurring it.
   */
  rightFill: 690,
  rightFillStagger: 80,
  passArm: 650,
  passArmDur: 360,
  passIgnite: 1050,
  /** In step with card 1 dying. */
  passTrail: 1200,
  passTrailDur: 200,
  rightDim: 1200,
  rightDimDur: 200,
  rightDimLevel: 0.3,
  /** 2.10-2.41, ~103ms apart, as card 2 crosses centre and runs on. */
  leftFill: 2100,
  leftFillStagger: 103.33,
  stashArm: 2100,
  stashArmDur: 310,
  stashIgnite: 2450,
  /** Drains BACKWARD toward OR, against its fill direction, on the same beat as
   *  the passed card dropping home. The headline unwinds the way the deck does. */
  rightDrain: 3450,
  rightDrainStagger: 65,
  passFade: 3450,
  passFadeDur: 400,
  leftDrain: 4000,
  leftDrainStagger: 80,
  afterglow: 4000,
} as const

// ---------------------------------------------------------------------------
// Motion (spec §7, §8, §9)
// ---------------------------------------------------------------------------

/**
 * Opacity and scale run DIFFERENT durations on the same element on purpose: the
 * headline must be at full opacity by 150ms (a hard requirement, invariant 7),
 * and a single 220ms container fade would miss it by 70ms.
 */
export const OPEN = { fade: 150, scale: 220, from: 0.96, total: 250 } as const

export const EASE = {
  /** Draws and travels — they decelerate into position. */
  out: 'cubic-bezier(.22,.61,.36,1)',
  /** Exit tumble and return drop — they accelerate away. */
  in: 'cubic-bezier(.55,.06,.68,.19)',
  /** The hover float. */
  sine: 'ease-in-out',
  linear: 'linear',
} as const

/** Loop A — "Keep it". One pull, one outcome. Establishes the baseline. */
export const LOOP_A = {
  draw: 0,
  drawDur: 450,
  /** rotateY completes at ~400ms, inside the 450ms lift. */
  flipDur: 400,
  hover: 450,
  hoverDur: 200,
  travel: 650,
  travelDur: 400,
  ignite: 1050,
  /** Card treatment only now; the WORD is driven by HEAD_A / HEAD_B. */
  igniteDur: 120,
  exit: 2100,
  exitDur: 500,
  close: 2600,
  closeDur: 300,
  total: 3200,
} as const

/** Loop B — "Pass it". The twist: pass, then a second pull that is yours. */
export const LOOP_B = {
  draw: 0,
  drawDur: 450,
  flipDur: 400,
  hover: 450,
  hoverDur: 200,
  travel: 650,
  travelDur: 400,
  /** Card treatment only now; the WORD is driven by HEAD_A / HEAD_B. */
  igniteDur: 120,
  /** PULL AGAIN appears at the hover point, where card 2 is about to arrive. */
  pullIn: 1100,
  pullDur: 150,
  /**
   * The moment card 2 passes the hover point. SEPARATE from `pullOut` on
   * purpose: it is also the keyframe offset for card 2's arc, computed as
   * (cross - lift) / liftDur, which must land inside [0, 1]. Deriving it from
   * `pullOut` — which now sits past the end of the hold — would produce an
   * out-of-range offset and el.animate() would throw.
   */
  cross: 2100,
  recoil: 1100,
  recoilDur: 260,
  recoilStagger: 20,
  die: 1200,
  dieDur: 200,
  /**
   * Card 2 does NOT hover. There is no decision about pull 2 — it's yours.
   *
   * The 750ms gap back to `pullIn` (1100) is deliberate dwell, not slack: PULL
   * AGAIN is the only copy carrying the rule, and the second pull is the thing it
   * is promising, so the label gets read before the payoff arrives. Nothing else
   * moves between the death of card 1 at 1.40 and this lift.
   */
  lift: 1850,
  liftDur: 600,
  /** Face-up exactly as it crosses the hover point at 2100, fulfilling the label. */
  liftFlipDur: 300,
  /**
   * The label holds all the way through the hold beat and only clears as the
   * unwind starts. It is the only copy carrying the entire rule, and the earlier
   * behaviour — clearing the instant card 2 crossed centre — gave it about 700ms
   * on screen, which §8 flagged as likely to read as a flicker. It now runs
   * 1.10-3.45s and shares the frame with the finished outcome.
   */
  pullOut: 3450,
  stashIgnite: 2450,
  /** Pass card returns FIRST, so the cycle ends on the payoff, not the discard. */
  ret: 3450,
  retDur: 400,
  exit: 3850,
  exitDur: 500,
  close: 4350,
  closeDur: 300,
  total: 4950,
} as const

/**
 * Exit tumble (spec §9), as offsets within exitDur. Reaching 90deg exactly as
 * the card crosses y=252 into row 1 is the point of this timing — the card is
 * invisible precisely when it enters the headline's territory.
 *
 * The opacity ramp is biased EARLY (mostly gone by .84, not 1.0) because the
 * wash is only 50% opaque: the past-90deg back face is visible through the gaps
 * between the letters, and this is what manages that.
 */
export const TUMBLE = {
  /** Anticipation dip, then rise. y values are absolute canvas px. */
  dipAt: 0.16,
  dipY: ZONE_Y + 4,
  crossAt: 0.52,
  crossY: ROW.zonesTop,
  midAt: 0.76,
  /**
   * These ride up with row 2 as well. They are absolute canvas px measured from
   * where the card STARTS, so leaving them fixed while the card starts 50px
   * higher would shrink the rise and put the card edge-on almost immediately —
   * the 90deg-on-crossing beat is a ratio of the travel, not a fixed altitude.
   */
  midY: 196 - ROW2_LIFT,
  endY: 159 - ROW2_LIFT,
  fadeOutAt: 0.84,
} as const

/** Dead state (spec §5): tilted ~4deg, dropped 3px, grey at ~50%. */
export const DEAD = { tilt: 4, drop: 3 } as const

/** Hover float, +/-2px. The decision beat. */
export const FLOAT = 2

/**
 * The stash card's landing hop, fired on the same frame the glow comes up so the
 * two read as one event — the card reacting to being kept, rather than a light
 * being switched on over a card that is already parked.
 *
 * 7px is ~12% of the card and about 2px on a phone: enough to register as a beat,
 * small enough not to break the card's lock to the STASH zone centre. The small
 * rebound after the landing is what stops it reading as a dead stop.
 */
export const JUMP = { height: 7, rebound: 2.5, duration: 280 } as const

/**
 * Beat between a card landing in the STASH zone and its own stashed treatment —
 * glow, bright face, and the hop — starting.
 *
 * The WORD ignites at arrival regardless; only the card waits. That split mirrors
 * the PASS branch exactly, where PASS lights the instant card 1 lands (1.05) and
 * the card's own state change follows at 1.20. Both branches therefore read as
 * "the zone answers immediately, the card responds a beat later", which is what
 * keeps the two outcomes feeling like the same mechanism with different results.
 *
 * Fits with room to spare: the hop ends at 1.48 in Loop A (hold runs to 2.10) and
 * at 2.88 in Loop B (hold runs to 3.45).
 */
export const STASH_LAG = 150

/** Fan recoil when PULL AGAIN lands — a ripple through the remaining cards. */
export const RECOIL = 3
