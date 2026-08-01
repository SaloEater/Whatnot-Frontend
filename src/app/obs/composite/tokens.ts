/**
 * Design tokens for the Mount Olympus composite overlay (figure 4h).
 *
 * Every number here is in CANVAS pixels on a fixed 1080 x 1920 portrait stage.
 * The stage is scaled to the viewport once, at the root, with
 *   transform: scale(min(vw / 1080, vh / 1920))
 * so nothing below this line ever needs a viewport unit.
 *
 * LEGIBILITY RULE — the overlay is watched on a phone, inside a video player.
 * Effective downscale is ~3x. Therefore:
 *   canvas px / 3 = apparent phone px
 *   nothing that is text may be smaller than TYPE.floor (36 -> 12 phone px)
 *   anything a buyer must act on is TYPE.price or larger (36 -> 12 phone px)
 */

export const CANVAS = {
  width: 1080,
  height: 1920,
  /** Divide any canvas px by this to get apparent size on a phone. */
  phoneDivisor: 3,
} as const

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * Chryselephantine: gold + ivory on dark, the palette of the cult statues.
 * The ground is WARM near-black (a lamp-lit cella), not blue-black.
 *
 * Contrast ratios are measured against COLOR.cella.
 */
export const COLOR = {
  /** Ground. Warm near-black. */
  cella: '#16130E',
  /** Panel fill, one step up from the ground. */
  cellaLift: '#1F1A13',

  /** Primary text and available-tile content. 14.1:1 — AAA. */
  ivory: '#E8DFCB',
  /** Secondary text. 7.4:1 — AAA. HARD FLOOR: nothing dimmer may be text. */
  ivory70: 'rgba(232,223,203,.70)',
  /** Hairlines, inactive borders. Not for text. */
  ivory20: 'rgba(232,223,203,.20)',
  /** Surface tint. Not for text. */
  ivory06: 'rgba(232,223,203,.06)',

  /** Structural metal. Draws EVERY line: frame, meander, dividers, brackets. 3.2:1. */
  bronze: '#756241',

  /** Semi-transparent panel behind the series checklist. */
  panel: 'rgba(31,26,19,.62)',
  panelBorder: 'rgba(117,98,65,.45)',

  /** Opaque plate used behind any text that could overlap the camera portal. */
  plate: '#1F1A13',
} as const

/**
 * Medal frames, applied to the tile border by price rank.
 *
 * NOTE: this supersedes an earlier rule that gold was reserved for exceptional
 * events (a hit, a giveaway, the last slot). Gold is now a TIER, not an EVENT.
 * If a "someone just pulled something big" signal is still wanted it needs a
 * different treatment — motion is the obvious candidate, since nothing else on
 * the board moves sharply.
 *
 * Gold and silver are distinguished by HUE (warm vs neutral), not brightness —
 * which is how medals actually read.
 */
export const FRAME = {
  gold: '#C6A35A',   // 7.8:1
  silver: '#B3AB9B', // 8.2:1
  bronze: '#756241', // 3.2:1
  /**
   * 2.7:1 — deliberately just under the 3:1 guidance for UI components.
   * The bottom tier is meant to recede, and the price text still carries the
   * ranking at 12:1.
   */
  grey: '#5F5A50',
} as const

/** Sold tile: tarnish. Faint texture, NOT empty — empty reads as broken. */
export const TARNISH =
  'repeating-linear-gradient(45deg,rgba(232,223,203,.045) 0 5px,#16130E 5px 11px)'

/** Special spots (ZEUS / HERA / ARES / NIKE / MEGA): different material, same shape. */
export const HATCH =
  'repeating-linear-gradient(45deg,rgba(232,223,203,.11) 0 6px,#1F1A13 6px 13px)'

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * TYPEFACE — Barlow Condensed, weights 400 and 600. That is the entire set.
 *
 * The mock also loads Barlow (non-condensed) and Caveat. NEITHER SHIPS:
 *   - Caveat is the handwriting used for annotation notes on the canvas.
 *   - Barlow is set once as a container default and nothing inherits it —
 *     every text node overrides to Barlow Condensed.
 * Loading either in production is dead weight.
 *
 * CONDENSED IS LOAD-BEARING, not a style choice. The layout maths assumes its
 * narrow advance width:
 *   "$100" at 36px ≈ 65px, inside a tile with ~73px of usable width.
 * Substitute a normal-width grotesque and the tile price overflows, the
 * two-line widget captions wrap, and the divider metopes stop fitting between
 * the rules. If the family has to change, re-derive LAYOUT before trusting it.
 *
 * All-caps plus wide tracking is what carries the classical register — Greek
 * inscriptions are caps-only with even spacing. See TRACKING. Do not "clean up"
 * the letter-spacing; it is the design, not decoration.
 *
 * LOADING — this matters more than usual. An OBS browser source paints
 * immediately and may start with no network or a slow one. If the webfont has
 * not arrived, the first frames render in a fallback with different metrics,
 * the layout shifts on air, and every width in this file is wrong.
 *   - Self-host the woff2. Do NOT depend on the Google Fonts CDN at stream time.
 *   - Preload both weights.
 *   - font-display: block — better a beat of invisible text than a visible reflow.
 */
export const FONT = {
  /**
   * The only family that ships. Fallback is metric-adjacent on purpose: if the
   * webfont fails, Arial Narrow keeps roughly the same advance width so the
   * layout degrades instead of exploding.
   */
  display: "'Barlow Condensed', 'Arial Narrow', system-ui, sans-serif",
  weight: {
    /** Labels, captions, section headings, divider metopes. */
    regular: 400,
    /** Widget values, tile prices, checklist prices. */
    semibold: 600,
  },
  /** Numeric readouts (e.g. 12 OF 148) must not jitter as digits change. */
  numeric: 'tabular-nums',
  /** Verify Barlow Condensed ships `tnum`; if not, reserve width manually. */
  files: ['barlow-condensed-400.woff2', 'barlow-condensed-600.woff2'],
} as const

/**
 * All-caps + wide tracking is doing the classical work here, not ornament.
 * Greek inscriptions are caps-only with even spacing; that is why the labels
 * read as they do. Keep the tracking.
 */
export const TYPE = {
  /** Widget values ($15, $25). */
  value: 60,
  /** Tile price, section labels, divider metopes. Also the FLOOR. */
  price: 36,
  label: 36,
  floor: 36,
} as const

export const TRACKING = {
  /** Section label, e.g. SERIES #1 */
  label: '.28em',
  /** Two-line widget captions, e.g. STASH / OR PASS */
  caption: '.20em',
  /** Mid-divider metope, e.g. 3 BOXES */
  metope: '.16em',
  /** Numeric readout, e.g. 12 OF 148 — pair with tabular-nums */
  numeric: '.12em',
} as const

// ---------------------------------------------------------------------------
// Space
// ---------------------------------------------------------------------------

export const SPACE = {
  gridGap: 8,
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 40,
  xxl: 44,
  /** Left/right inset of ALL content. 1080 - 2*108 = 864 = 80% of width. */
  contentInset: 108,
  /** Root padding, inside which the frame sits. */
  pagePad: 24,
} as const

export const LAYOUT = {
  /** Content column width. */
  contentWidth: 864,

  board: {
    cols: 10,
    rows: 5,
    rowHeight: 116,
    gap: SPACE.gridGap,
    /** (864 - 9*8) / 10 */
    tileWidth: 79.2,
    /** 5*116 + 4*8 */
    height: 612,
  },

  /**
   * The portal is NOT positioned by hand — it is exactly the cells the route
   * never visits. Change the route and the camera window follows.
   * Cols 3-8, rows 1-2 => 515 x 240.
   */
  portal: { colStart: 3, colEnd: 9, rowStart: 1, rowEnd: 3, width: 515, height: 240 },

  divider: { height: 36 },

  checklist: {
    /** Hard floor: exactly 50% of canvas height. */
    minHeight: 960,
    panelPadding: 20,
    panelBorder: 2,
    cols: 3,
    rows: 3,
    gridWidth: 572,
    gap: SPACE.sm,
    /** (572 - 32) / 3 */
    cardWidth: 180,
    /** cardWidth * 7/5 */
    cardHeight: 252,
    cardAspect: '5 / 7',
    /**
     * Price label sits ABOVE its card, not below.
     *
     * This relies on labelGap being much smaller than the row gap
     * (6 vs 16): the label must read as grouped with the card *under* it, not
     * with the card above it. If either number changes, keep labelGap well
     * below LAYOUT.checklist.gap or the association flips and the grid becomes
     * ambiguous.
     */
    labelPosition: 'above' as 'above' | 'below',
    /** Gap between a card and its price label. Must stay < gap. */
    labelGap: 6,
    chevronWidth: 60,
    chevronHeight: 86,
  },
} as const

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * AMBIENT BUDGET — this overlay is composited into a video encoder. Every
 * moving pixel is subtracted from the camera feed, which is the thing people
 * are buying from. Target: total ambient motion under ~5% of frame area.
 *
 * As scoped, ambient totals roughly 8%: gears 5.0, tile sheen 2.3, divider
 * meander 0.4, chevron fill 0.3. Cutting the tile sheen brings it to ~5.7%,
 * near target — and the sheen is also the layer most likely to read as flicker
 * once downscaled to a phone, so it is the first thing to drop.
 *
 * Cost asymmetry worth knowing before adding anything: motion OVER THE CAMERA
 * PORTAL is cheap, because those macroblocks are already being re-encoded every
 * frame. Motion over STATIC DARK is expensive. Every ambient layer here sits
 * over static dark, which is why the budget is tight.
 *
 * All periods are mutually coprime on purpose — the layers beat against each
 * other instead of marching in lockstep, which is what stops repetition from
 * reading as mechanical.
 */
export const MOTION = {
  /** Ivory lights running the divider meander via stroke-dashoffset. */
  flowBright: '53s',
  flowDim: '79s',
  /** Meander path geometry — dasharray must sum to pathLength. */
  meander: {
    unit: { width: 40, height: 23, length: 116 },
    repeats: 22,
    pathLength: 2552,
    brightDash: '90 2462',
    dimDash: '70 2482',
    strokeWidth: 4,
    bandHeight: 36,
  },

  /** Checklist paging indicator. Stand-in — match to the real page interval. */
  chevronFill: '8s',

  /** Per-tile specular sweep. Marks AVAILABILITY, not decoration. */
  sheen: {
    period: '9s',
    /** Sweep occupies the first 18% of the cycle, then dark. */
    dutyCycle: 0.18,
    /** Negative delay per tile index — produces a wavefront, not 24 twinkles. */
    staggerSeconds: 0.55,
    gradient:
      'linear-gradient(105deg,transparent 38%,rgba(232,223,203,.50) 50%,transparent 62%)',
  },

  /**
   * Antikythera-style gear train behind everything (z-index -1).
   * Periods derive from radius ratios, so it turns as ONE mechanism.
   * Meshing gears counter-rotate — directions alternate down the chain.
   * Teeth are a dashed stroke ring: only strokes move, so it is cheap.
   * Constant dasharray across all seven => constant tooth pitch, as a real
   * train requires.
   */
  gears: {
    opacity: 0.45,
    toothDash: '11 20',
    toothStroke: 14,
    lineStroke: 3,
    wheels: [
      { cx: 540, cy: 300, r: 330, dur: '210s', reverse: false },
      { cx: 170, cy: 700, r: 200, dur: '127s', reverse: true },
      { cx: 880, cy: 760, r: 240, dur: '153s', reverse: true },
      { cx: 400, cy: 1120, r: 280, dur: '178s', reverse: false },
      { cx: 870, cy: 1310, r: 220, dur: '140s', reverse: true },
      { cx: 330, cy: 1580, r: 190, dur: '121s', reverse: true },
      { cx: 830, cy: 1700, r: 170, dur: '108s', reverse: false },
    ],
  },

  /**
   * STATE tier — the Zuma advance. This is the only part of the overlay that
   * needs real engineering; everything else is layout.
   */
  advance: {
    /** Per-tile slide duration. */
    duration: 380,
    /** Delay per index-distance from the gap. Produces a ripple, not a jump. */
    stagger: 40,
    /** Slight overshoot + settle, the way Zuma balls bump and compress. */
    ease: 'cubic-bezier(.34, 1.3, .64, 1)',
    /**
     * Re-sort at most this often. A burst of sales must resolve as ONE ripple,
     * or the board twitches per sale.
     */
    debounce: 2500,
  },
} as const

/**
 * Compositor-only properties. Never animate width/top/box-shadow/filter — they
 * force layout or paint every frame and OBS will drop frames it needs for
 * encoding.
 */
export const ANIMATABLE = ['transform', 'opacity', 'stroke-dashoffset', 'clip-path'] as const

// ---------------------------------------------------------------------------
// Shell values read off the figure 4h mock — not in the original token set
// ---------------------------------------------------------------------------
/**
 * These are literal values pulled from the authoritative fig4h mock markup
 * (Overlay Wireframes.dc.html) that weren't captured anywhere above. Kept
 * here, clearly separated, so every shell component still imports its
 * numbers/colours from tokens.ts instead of hand-writing them inline.
 */
export const SHELL = {
  frame: {
    /** Outer frame border. Mock line 59: `border:3px solid #756241`. */
    borderWidth: 3,
    /**
     * Top/bottom Greek-key band. A DIFFERENT unit than MOTION.meander (that
     * one is the divider's fret, unit 40x23) — this is a 32x32 key pattern,
     * mock lines 61-69.
     */
    band: {
      unit: 32,
      path: 'M0 29 H32 M5 29 V5 H27 V21 H14 V12',
      strokeWidth: 3,
      left: 24,
      top: 20,
      bottom: 20,
      width: 1032,
      height: 32,
    },
  },
  /** Divider fret path (mock lines 124-126). Same geometry as MOTION.meander
   *  (unit width 40, length 116, pathLength 2552 = 116 * 22) expressed as the
   *  literal relative-path segment, so the base path and the stage-3 running
   *  lights can share one `d` string. */
  divider: {
    /** One unit, repeated MOTION.meander.repeats times. */
    unitSegment: 'h7 v-23 h26 v14 h-15 v9 h22',
    /** Starting point of the path, mock: `M0,28`. */
    startY: 28,
  },
  statTile: {
    /** Mock line 72: `border:2px solid rgba(117,98,65,.85)` — a different alpha than COLOR.panelBorder (.45). */
    borderColor: 'rgba(117,98,65,.85)',
    padding: '14px 28px',
    /** Gap between caption and value inside one tile. */
    innerGap: 22,
    /** Gap between the two tiles. */
    tileGap: 16,
  },
  portal: {
    /** Mock line 83: `border:3px solid #756241`. */
    borderWidth: 3,
    /** Corner brackets, mock lines 114-117: 26x26, 4px borders, offset -7px outside the portal rect. */
    bracket: {
      size: 26,
      offset: -7,
      strokeWidth: 4,
    },
  },
  checklistCard: {
    /** Mock line 143. Replaces the stage-1 placeholder (ivory06 + card_bg.svg). */
    background: '#231F19',
    border: '2px solid #403C34',
    boxShadow: '0 10px 28px rgba(0,0,0,.55)',
    /** Mock line 144 price colour — distinct alpha from COLOR.ivory70 (.70). */
    priceColor: 'rgba(232,223,203,.85)',
    /** Gap between the chevrons and the card grid (mock line 135), and hugging alignment. */
    chevronGap: 22,
  },
} as const
