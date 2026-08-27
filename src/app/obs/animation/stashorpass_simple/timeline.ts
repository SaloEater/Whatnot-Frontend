/**
 * The two loop variants, built as flat lists of Web Animations API steps.
 *
 * A JS-driven timeline is REQUIRED, not CSS keyframes: the fan slot for each draw
 * is random per cycle, and Loop B needs a second slot chosen to differ from the
 * first. WAAPI is sufficient — no library.
 *
 * SCHEDULE-THEN-WAIT, not await-chaining. Every step carries an absolute `delay`
 * from its loop's t=0, so the whole loop is fired in one pass and the driver
 * (page.tsx) sets a single timer for the total duration. Chaining `await
 * anim.finished` per beat would let one dropped frame drift the entire
 * remainder of the loop.
 *
 * Beat tables live in tokens.ts (LOOP_A / LOOP_B) and mirror spec §8 line for
 * line, so the timing can be read against the spec without decoding this file.
 */

import {
  DEAD,
  EASE,
  FLOAT,
  HEADLINE,
  HEAD_A,
  HEAD_B,
  JUMP,
  LOOP_A,
  LOOP_B,
  RECOIL,
  SLOTS,
  SLOT_COUNT,
  STASH_LAG,
  TUMBLE,
  X,
  ZONE_Y,
  slotTransform,
  transformAt,
} from './tokens'

export type CardRefs = {
  /** .sp-card — position and in-plane tilt. */
  root: HTMLElement
  /** .sp-card-3d — which face is showing. */
  flip: HTMLElement
  glow: HTMLElement
  stashed: HTMLElement
  dead: HTMLElement
}

/**
 * One igniting word. `group` exists only to carry the scale pop; `ignite` and
 * `bloom` are the two animated layers. The neutral and ember layers are
 * deliberately absent — nothing in the timeline may touch them (the ember is a
 * free-running CSS animation, and writing to it would reset it).
 */
export type WordRefs = {
  group: SVGGElement
  ignite: SVGTextElement
  bloom: SVGTextElement
}

/** A conductor rail's lit dashes, in FILL ORDER — index 0 nearest OR. */
export type RailRefs = { lit: SVGRectElement[] }

export type Stage = {
  cards: CardRefs[]
  words: { stash: WordRefs; pass: WordRefs }
  or: SVGTextElement
  rails: { left: RailRefs; right: RailRefs }
  /** The group holding the label, so text and any future siblings fade as one. */
  pullAgain: SVGGElement
}

export type Step = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions }
export type Loop = { steps: Step[]; duration: number }

// ---------------------------------------------------------------------------
// Transform vocabulary
// ---------------------------------------------------------------------------

/** Local aliases for the shared coordinate helpers in tokens.ts. */
const at = transformAt
const slotAt = slotTransform

const HOVER = at(X.hover, ZONE_Y)
const IN_STASH = at(X.stash, ZONE_Y)
const IN_PASS = at(X.pass, ZONE_Y)
const DEAD_AT = at(X.pass, ZONE_Y + DEAD.drop, DEAD.tilt)

const FACE_DOWN = 'rotateY(180deg)'
const FACE_UP = 'rotateY(0deg)'

const FILL: FillMode = 'forwards'

// ---------------------------------------------------------------------------
// Step primitives
// ---------------------------------------------------------------------------

function move(
  el: Element,
  from: string,
  to: string,
  delay: number,
  duration: number,
  easing: string,
): Step {
  return {
    el,
    keyframes: [{ transform: from }, { transform: to }],
    options: { delay, duration, easing, fill: FILL },
  }
}

function fade(
  el: Element,
  from: number,
  to: number,
  delay: number,
  duration: number,
  easing: string = EASE.linear,
): Step {
  return {
    el,
    keyframes: [{ opacity: from }, { opacity: to }],
    options: { delay, duration, easing, fill: FILL },
  }
}

/**
 * An instantaneous state write expressed as an animation rather than an inline
 * style. It has to be an animation: a fill:forwards animation from earlier in the
 * loop keeps overriding inline styles, so `el.style.transform = ...` mid-loop
 * would silently do nothing. Later-starting animations win for the same property,
 * which is what makes this work.
 */
function set(el: Element, keyframe: Keyframe, delay: number): Step {
  return { el, keyframes: [keyframe, keyframe], options: { delay, duration: 1, fill: FILL } }
}

// ---------------------------------------------------------------------------
// Headline beats
// ---------------------------------------------------------------------------

/** Destination word only, during the card's travel. Ignite layer 0 -> 0.35. */
function armWord(w: WordRefs, t0: number, dur: number, out: Step[]) {
  out.push(fade(w.ignite, HEADLINE.idle, HEADLINE.armed, t0, dur, EASE.out))
}

/**
 * The landing: ignite layer to full then settling to hold, bloom in behind it,
 * and the scale pop — all on one 180ms window so they read as a single event.
 *
 * The pop is on the <g>, so it carries all four layers together; running it on
 * the ignite layer alone would slide the bright copy off its neutral underneath.
 */
function igniteWord(w: WordRefs, t0: number, out: Step[]) {
  const options: KeyframeAnimationOptions = {
    delay: t0,
    duration: HEADLINE.popDur,
    easing: EASE.out,
    fill: FILL,
  }

  out.push({
    el: w.ignite,
    keyframes: [
      { opacity: HEADLINE.armed, offset: 0 },
      { opacity: HEADLINE.ignite, offset: HEADLINE.riseAt },
      { opacity: HEADLINE.hold, offset: 1 },
    ],
    options,
  })
  out.push({
    el: w.bloom,
    keyframes: [
      { opacity: 0, offset: 0 },
      { opacity: HEADLINE.ignite, offset: HEADLINE.riseAt },
      { opacity: HEADLINE.hold, offset: 1 },
    ],
    options,
  })
  out.push({
    el: w.group,
    keyframes: [
      { transform: 'scale(1)', offset: 0 },
      { transform: `scale(${HEADLINE.popScale})`, offset: HEADLINE.popPeakAt },
      { transform: 'scale(1)', offset: 1 },
    ],
    options: { ...options, easing: EASE.sine },
  })
}

/** Any later level move on a word — hold -> trail, trail -> 0, the afterglow. */
function wordLevel(w: WordRefs, from: number, to: number, t0: number, dur: number, out: Step[]) {
  out.push(fade(w.ignite, from, to, t0, dur))
  out.push(fade(w.bloom, from, to, t0, dur))
}

/**
 * OR charges as the card rises beneath it and discharges in step with the rail
 * filling — the light is transferred outward, not emitted, so OR reads as the
 * source giving its charge to the chosen side.
 */
function chargeOr(or: SVGTextElement, from: number, to: number, t0: number, dur: number, out: Step[]) {
  out.push(fade(or, from, to, t0, dur, EASE.out))
}

/** Dashes light in sequence, away from OR. */
function railFill(r: RailRefs, t0: number, stagger: number, out: Step[]) {
  r.lit.forEach((el, i) => {
    out.push(fade(el, 0, 1, t0 + i * stagger, HEADLINE.dashDur, EASE.out))
  })
}

/**
 * Dashes go out in REVERSE — outermost first, running back toward OR, against the
 * direction they filled.
 */
function railDrain(r: RailRefs, from: number, t0: number, stagger: number, out: Step[]) {
  const last = r.lit.length - 1
  r.lit.forEach((el, i) => {
    out.push(fade(el, from, 0, t0 + (last - i) * stagger, HEADLINE.dashDur, EASE.in))
  })
}

/** Whole rail to a residual level at once — the route stays drawn, dimmed. */
function railLevel(r: RailRefs, from: number, to: number, t0: number, dur: number, out: Step[]) {
  r.lit.forEach((el) => out.push(fade(el, from, to, t0, dur)))
}

// ---------------------------------------------------------------------------
// Beats
// ---------------------------------------------------------------------------

/**
 * The card lifts from its fan slot to the hover point, rotating from its slot
 * angle to 0 and turning face-up. The reveal beat — it enters anonymous and gains
 * its identity.
 *
 * Position and flip are two independent animations because the flip finishes
 * early (400ms inside a 450ms lift). One keyframe list would have to hand-
 * interpolate the position at the moment the flip completes.
 */
function draw(c: CardRefs, slot: number, t0: number, dur: number, flipDur: number, out: Step[]) {
  out.push(move(c.root, slotAt(slot), HOVER, t0, dur, EASE.out))
  out.push(move(c.flip, FACE_DOWN, FACE_UP, t0, flipDur, EASE.out))
}

/** The decision beat. Only card 1 gets one — pull 2 is not a decision. */
function hoverFloat(c: CardRefs, t0: number, dur: number, out: Step[]) {
  out.push({
    el: c.root,
    keyframes: [
      { transform: HOVER },
      { transform: at(X.hover, ZONE_Y - FLOAT) },
      { transform: HOVER },
    ],
    options: { delay: t0, duration: dur, easing: EASE.sine, fill: FILL },
  })
}

/**
 * Locking into the STASH zone: the state change, the glow, and a short landing
 * hop — all starting on the same frame, at t0.
 *
 * The hop shares its start with the glow deliberately. Ignite alone reads as a
 * light being switched on over a card that is already parked; the card moving at
 * that instant reads as the card reacting to being kept.
 *
 * Only ever called for the STASH zone (both loops), which is why the hop's x is
 * pinned to X.stash — a passed card drops and tilts instead, it does not hop.
 */
function stash(c: CardRefs, t0: number, dur: number, out: Step[]) {
  out.push(fade(c.stashed, 0, 1, t0, dur, EASE.out))
  out.push(fade(c.glow, 0, 1, t0, dur, EASE.out))

  out.push({
    el: c.root,
    keyframes: [
      { transform: at(X.stash, ZONE_Y), offset: 0, easing: EASE.out },
      { transform: at(X.stash, ZONE_Y - JUMP.height), offset: 0.4, easing: EASE.in },
      { transform: at(X.stash, ZONE_Y), offset: 0.72, easing: EASE.out },
      { transform: at(X.stash, ZONE_Y - JUMP.rebound), offset: 0.86, easing: EASE.in },
      { transform: at(X.stash, ZONE_Y), offset: 1 },
    ],
    options: { delay: t0, duration: JUMP.duration, fill: FILL },
  })
}

/** Desaturate, tilt, drop. Grey 1 on the right is half of Loop B's end frame. */
function die(c: CardRefs, t0: number, dur: number, out: Step[]) {
  out.push(fade(c.dead, 0, 1, t0, dur, EASE.out))
  out.push(move(c.root, IN_PASS, DEAD_AT, t0, dur, EASE.out))
}

/**
 * Exit tumble — the card is yanked up and out, bottom edge over the top.
 *
 * Reaching 90deg exactly as it crosses y=252 into row 1 is the POINT of this
 * timing: the card is edge-on and effectively invisible precisely when it enters
 * the headline's territory, so there is no pop of a card appearing over the type.
 * It re-emerges as a back, already partway up and already fading.
 *
 * The opacity ramp finishes at .84 rather than 1.0 because the wash is only 50%
 * opaque — the past-90deg back face is visible through the gaps between the
 * letters, and biasing the fade early is what manages that.
 */
function tumble(c: CardRefs, fromX: number, t0: number, dur: number, out: Step[]) {
  out.push({
    el: c.root,
    keyframes: [
      { transform: at(fromX, ZONE_Y), offset: 0, easing: EASE.out },
      { transform: at(fromX, TUMBLE.dipY), offset: TUMBLE.dipAt, easing: EASE.in },
      { transform: at(fromX, TUMBLE.crossY), offset: TUMBLE.crossAt },
      { transform: at(fromX, TUMBLE.midY), offset: TUMBLE.midAt },
      { transform: at(fromX, TUMBLE.endY), offset: 1 },
    ],
    options: { delay: t0, duration: dur, fill: FILL },
  })
  out.push({
    el: c.flip,
    keyframes: [
      { transform: 'rotateX(0deg)', offset: 0 },
      { transform: 'rotateX(0deg)', offset: TUMBLE.dipAt },
      { transform: 'rotateX(90deg)', offset: TUMBLE.crossAt },
      { transform: 'rotateX(150deg)', offset: TUMBLE.midAt },
      { transform: 'rotateX(180deg)', offset: 1 },
    ],
    options: { delay: t0, duration: dur, easing: EASE.linear, fill: FILL },
  })
  out.push({
    el: c.root,
    keyframes: [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: TUMBLE.crossAt },
      { opacity: 0, offset: TUMBLE.fadeOutAt },
      { opacity: 0, offset: 1 },
    ],
    options: { delay: t0, duration: dur, easing: EASE.linear, fill: FILL },
  })
  // Glow peaks on the anticipation dip, then goes with the card.
  out.push(fade(c.glow, 1, 0, t0, dur * TUMBLE.crossAt, EASE.linear))
}

/**
 * The passed card drops back into its own gap, turning face-down on the way so it
 * slots in matching its neighbours. The deck is a second channel for the whole
 * idea: stashed cards leave it, passed cards don't.
 */
function returnToDeck(c: CardRefs, slot: number, t0: number, dur: number, out: Step[]) {
  out.push(move(c.root, DEAD_AT, slotAt(slot), t0, dur, EASE.in))
  out.push(move(c.flip, FACE_UP, FACE_DOWN, t0, dur, EASE.in))
  // Clear the dead face only once it is face-down, so the reset is invisible.
  out.push(set(c.dead, { opacity: 0 }, t0 + dur))
}

/** A ripple through the remaining cards as PULL AGAIN lands. */
function recoil(stage: Stage, deck: (number | null)[], t0: number, out: Step[]) {
  const centre = (SLOT_COUNT - 1) / 2
  deck.forEach((cardIndex, slot) => {
    if (cardIndex === null) return
    const rest = slotAt(slot)
    out.push({
      el: stage.cards[cardIndex].root,
      keyframes: [
        { transform: rest },
        { transform: at(SLOTS[slot].x, SLOTS[slot].y + RECOIL, SLOTS[slot].deg) },
        { transform: rest },
      ],
      options: {
        delay: t0 + Math.abs(slot - centre) * LOOP_B.recoilStagger,
        duration: LOOP_B.recoilDur,
        easing: EASE.sine,
        fill: FILL,
      },
    })
  })
}

/**
 * Close a gap left by a stashed card and bring the deck back to 6 (invariant 6).
 *
 * Cards above the gap shift down one slot, and the card that just exited is
 * recycled in at the outer edge — reset face-down and faded up from 0, so nothing
 * of its stashed state survives. `deck` is MUTATED to the new arrangement.
 */
function closeGap(
  stage: Stage,
  deck: (number | null)[],
  gapSlot: number,
  recycled: number,
  t0: number,
  dur: number,
  out: Step[],
) {
  const before = deck.slice()
  for (let s = gapSlot; s < SLOT_COUNT - 1; s++) deck[s] = deck[s + 1]
  deck[SLOT_COUNT - 1] = recycled

  for (let s = 0; s < SLOT_COUNT; s++) {
    const cardIndex = deck[s]
    if (cardIndex === null || cardIndex === recycled) continue
    const from = before.indexOf(cardIndex)
    if (from === s) continue
    out.push(move(stage.cards[cardIndex].root, slotAt(from), slotAt(s), t0, dur, EASE.out))
  }

  const c = stage.cards[recycled]
  out.push(set(c.flip, { transform: FACE_DOWN }, t0))
  out.push(set(c.stashed, { opacity: 0 }, t0))
  out.push(set(c.dead, { opacity: 0 }, t0))
  out.push(set(c.glow, { opacity: 0 }, t0))
  out.push(set(c.root, { transform: slotAt(SLOT_COUNT - 1) }, t0))
  out.push(fade(c.root, 0, 1, t0, dur, EASE.out))
}

/**
 * The deck at rest: slot s holds card s. Rebuilt every cycle rather than carried
 * forward, so the bookkeeping cannot drift over a stream-length run. All six
 * cards are identical, so a viewer cannot tell that slot assignments reset.
 */
const freshDeck = (stage: Stage): (number | null)[] => stage.cards.map((_, i) => i)

// ---------------------------------------------------------------------------
// Loop A — "Keep it" (~3.2s)
// ---------------------------------------------------------------------------

/**
 * One pull, one outcome. A runs FIRST so it establishes the baseline and B reads
 * as the twist rather than as the default.
 */
export function buildLoopA(stage: Stage, slot: number): Loop {
  const steps: Step[] = []
  const deck = freshDeck(stage)
  const c = stage.cards[slot]

  deck[slot] = null

  draw(c, slot, LOOP_A.draw, LOOP_A.drawDur, LOOP_A.flipDur, steps)
  hoverFloat(c, LOOP_A.hover, LOOP_A.hoverDur, steps)
  steps.push(move(c.root, HOVER, IN_STASH, LOOP_A.travel, LOOP_A.travelDur, EASE.out))

  // Word at arrival, card a beat later — see STASH_LAG.
  stash(c, LOOP_A.ignite + STASH_LAG, LOOP_A.igniteDur, steps)

  tumble(c, X.stash, LOOP_A.exit, LOOP_A.exitDur, steps)
  closeGap(stage, deck, slot, slot, LOOP_A.close, LOOP_A.closeDur, steps)

  // --- headline track ------------------------------------------------------
  chargeOr(stage.or, HEADLINE.orIdle, HEADLINE.orCharged, HEAD_A.orCharge, HEAD_A.orChargeDur, steps)
  chargeOr(
    stage.or,
    HEADLINE.orCharged,
    HEADLINE.orIdle,
    HEAD_A.orDischarge,
    HEAD_A.orDischargeDur,
    steps,
  )
  railFill(stage.rails.left, HEAD_A.railFill, HEAD_A.railFillStagger, steps)
  armWord(stage.words.stash, HEAD_A.arm, HEAD_A.armDur, steps)
  igniteWord(stage.words.stash, HEAD_A.ignite, steps)
  railDrain(stage.rails.left, 1, HEAD_A.railDrain, HEAD_A.railDrainStagger, steps)
  wordLevel(stage.words.stash, HEADLINE.hold, 0, HEAD_A.afterglow, HEADLINE.afterglowDur, steps)

  return { steps, duration: LOOP_A.total }
}

// ---------------------------------------------------------------------------
// Loop B — "Pass it" (~4.65s)
// ---------------------------------------------------------------------------

/**
 * Pass, then a second pull that is yours to keep. The second pull is the entire
 * value proposition, so every beat here serves making it legible.
 *
 * `slotB` MUST differ from `slotA` (invariant 3) — the same slot reads as the
 * same card coming back. The caller enforces it.
 */
export function buildLoopB(stage: Stage, slotA: number, slotB: number): Loop {
  const steps: Step[] = []
  const deck = freshDeck(stage)
  const a = stage.cards[slotA]
  const b = stage.cards[slotB]

  // --- card 1: drawn, hovered, passed -------------------------------------
  deck[slotA] = null

  draw(a, slotA, LOOP_B.draw, LOOP_B.drawDur, LOOP_B.flipDur, steps)
  hoverFloat(a, LOOP_B.hover, LOOP_B.hoverDur, steps)
  steps.push(move(a.root, HOVER, IN_PASS, LOOP_B.travel, LOOP_B.travelDur, EASE.out))

  steps.push(fade(stage.pullAgain, 0, 1, LOOP_B.pullIn, LOOP_B.pullDur, EASE.out))
  recoil(stage, deck, LOOP_B.recoil, steps)

  die(a, LOOP_B.die, LOOP_B.dieDur, steps)

  // --- card 2: a different slot, and it does NOT stop ----------------------
  deck[slotB] = null

  // From `cross`, NOT `pullOut` — the label now outlives the crossing, and this
  // value has to stay a legal [0,1] keyframe offset. See LOOP_B.cross.
  const crossAt = (LOOP_B.cross - LOOP_B.lift) / LOOP_B.liftDur
  steps.push({
    el: b.root,
    keyframes: [
      { transform: slotAt(slotB), offset: 0 },
      // Crosses the hover point without pausing — the asymmetry with card 1 is
      // what expresses "pull 2 is final" through motion alone.
      { transform: HOVER, offset: crossAt },
      { transform: at((X.hover + X.stash) / 2, ZONE_Y - 6), offset: 0.72 },
      { transform: IN_STASH, offset: 1 },
    ],
    options: { delay: LOOP_B.lift, duration: LOOP_B.liftDur, easing: EASE.out, fill: FILL },
  })
  // Face-up by the time it reaches the hover point, so the numeral 2 is readable
  // at the exact spot PULL AGAIN predicted it.
  steps.push(move(b.flip, FACE_DOWN, FACE_UP, LOOP_B.lift, LOOP_B.liftFlipDur, EASE.out))
  steps.push(fade(stage.pullAgain, 1, 0, LOOP_B.pullOut, LOOP_B.pullDur))

  // Same split as Loop A: word at arrival, card a beat later.
  stash(b, LOOP_B.stashIgnite + STASH_LAG, LOOP_B.igniteDur, steps)

  // --- unwind: pass card first, then the stash card ------------------------
  // The cycle ends on the payoff, not on the discard.
  returnToDeck(a, slotA, LOOP_B.ret, LOOP_B.retDur, steps)
  deck[slotA] = slotA

  tumble(b, X.stash, LOOP_B.exit, LOOP_B.exitDur, steps)
  closeGap(stage, deck, slotB, slotB, LOOP_B.close, LOOP_B.closeDur, steps)

  // --- headline track ------------------------------------------------------
  // OR charges for card 1 only. It takes no charge for card 2 and stays at idle
  // from 1.10 to the end of the loop, because PULL AGAIN owns the centre column
  // across that whole span and a second lit element stacked directly above it
  // would compete for the same glance.
  chargeOr(stage.or, HEADLINE.orIdle, HEADLINE.orCharged, HEAD_B.orCharge, HEAD_B.orChargeDur, steps)
  chargeOr(
    stage.or,
    HEADLINE.orCharged,
    HEADLINE.orIdle,
    HEAD_B.orDischarge,
    HEAD_B.orDischargeDur,
    steps,
  )

  railFill(stage.rails.right, HEAD_B.rightFill, HEAD_B.rightFillStagger, steps)
  armWord(stage.words.pass, HEAD_B.passArm, HEAD_B.passArmDur, steps)
  igniteWord(stage.words.pass, HEAD_B.passIgnite, steps)

  // The route taken stays drawn: OR -> right rail -> PASS all sit at a residual
  // level through the hold while STASH is at 0.85, so the frame shows both the
  // outcome and how it was reached.
  wordLevel(stage.words.pass, HEADLINE.hold, HEADLINE.trail, HEAD_B.passTrail, HEAD_B.passTrailDur, steps)
  railLevel(stage.rails.right, 1, HEAD_B.rightDimLevel, HEAD_B.rightDim, HEAD_B.rightDimDur, steps)

  railFill(stage.rails.left, HEAD_B.leftFill, HEAD_B.leftFillStagger, steps)
  armWord(stage.words.stash, HEAD_B.stashArm, HEAD_B.stashArmDur, steps)
  igniteWord(stage.words.stash, HEAD_B.stashIgnite, steps)

  railDrain(stage.rails.right, HEAD_B.rightDimLevel, HEAD_B.rightDrain, HEAD_B.rightDrainStagger, steps)
  wordLevel(stage.words.pass, HEADLINE.trail, 0, HEAD_B.passFade, HEAD_B.passFadeDur, steps)
  railDrain(stage.rails.left, 1, HEAD_B.leftDrain, HEAD_B.leftDrainStagger, steps)
  wordLevel(stage.words.stash, HEADLINE.hold, 0, HEAD_B.afterglow, HEADLINE.afterglowDur, steps)

  return { steps, duration: LOOP_B.total }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

/**
 * Put every element back to its rest state at the top of each cycle.
 *
 * ORDER MATTERS AND THIS IS THE EASY THING TO GET WRONG: a fill:forwards
 * animation keeps overriding inline styles after it finishes, so the caller MUST
 * cancel every animation from the previous loop BEFORE calling this. Otherwise
 * these writes land on the element and are ignored, and the fan visibly degrades
 * over the following minutes.
 *
 * Resetting from the token table each cycle — rather than animating back to where
 * things were — is also what stops sub-pixel drift accumulating over the
 * thousands of cycles a stream-length run performs.
 */
export function resetStage(stage: Stage): void {
  stage.cards.forEach((c, i) => {
    c.root.style.transform = slotAt(i)
    c.root.style.opacity = '1'
    c.root.dataset.numeral = '1'
    c.flip.style.transform = FACE_DOWN
    c.glow.style.opacity = '0'
    c.stashed.style.opacity = '0'
    c.dead.style.opacity = '0'
  })
  const restWord = (w: WordRefs) => {
    w.ignite.style.opacity = '0'
    w.bloom.style.opacity = '0'
    w.group.style.transform = 'scale(1)'
  }
  restWord(stage.words.stash)
  restWord(stage.words.pass)

  stage.or.style.opacity = String(HEADLINE.orIdle)
  for (const rail of [stage.rails.left, stage.rails.right]) {
    for (const dash of rail.lit) dash.style.opacity = '0'
  }
  stage.pullAgain.style.opacity = '0'

  /*
   * NOTHING TOUCHES THE EMBER OR NEUTRAL LAYERS, deliberately.
   *
   * The ember is a free-running CSS animation on a 5.3s / 6.7s period, chosen to
   * be incommensurate with each other and with the 8.15s cycle. Writing an inline
   * opacity here would both override the animation and re-lock it to the loop
   * boundary, making it periodic — and periodic motion is filtered out by the
   * visual system within about thirty seconds, which is the exact failure this
   * feature exists to avoid. The neutral layer is never animated at all.
   */
}
