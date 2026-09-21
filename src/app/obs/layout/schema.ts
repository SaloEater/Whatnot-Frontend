// Pure-TypeScript schema for the OBS layout system.
// See obs-layout-plan.md §1.2 for the design this file implements, §1.7 for v2 (persistent
// elements via 'all', the frame element kind, `z` render order, and transition becoming a
// controls-only action instead of a phase), and §1.9 for v3 (scene events, `reactions`, the
// `Cue` discriminated union, and boxless elements — the standalone `effect` element kind it
// replaced is gone, see config.ts `migrateConfig`).

import type { SceneEventName } from './sceneEvents'

// A stage (formerly a fixed `selling | results | ripping` union) is now per-channel config data
// (obs-layout-plan.md follow-up: "configurable stages") — an operator can add and remove stages,
// so a phase is only ever validated against ONE config's `LayoutConfig.stages`, never a global
// constant. `id` is derived once at creation time (see the controls-side Stages tab) and is
// immutable afterwards: every element's `placements` key on it, so renaming would orphan them.
export type Stage = { id: string; label: string }

// Loosened from the old 3-literal union to a plain string: which strings are actually valid is now
// a property of one `LayoutConfig.stages` array, checked at runtime (config.ts's `isPhase`), not
// something the type system can express any more.
export type Phase = string

// A placement is keyed by a real phase, or 'all' — a persistent fallback used when no
// phase-specific placement exists. Resolution: placements[phase] ?? placements.all (see
// `resolveBox` in config.ts).
export type PlacementKey = Phase | 'all'

export type Box = { x: number; y: number; w: number; h: number }

// Per-side widths (px, >= 0) — used by the `frame` element's `borders` (obs-layout-plan.md §2.5).
// Kept separate from `Box`: a border has no x/y, only four independent thicknesses.
export type Sides = { top: number; right: number; bottom: number; left: number }

export type ElementKind =
    | 'board'
    | 'results'
    | 'resultsThin'
    | 'cards'
    | 'widget'
    | 'reserved'
    | 'ripbar'
    | 'frame'
    | 'animation'
    | 'text'
    | 'imageBox'
    | 'priceRanges'
    | 'priceSign'
    | 'scene'
    | 'ticker'

export const BOARD_VARIANTS = ['flat', 'classic', 'cobra', 'cobra_flat', 'sport_style'] as const
export type BoardVariant = (typeof BOARD_VARIANTS)[number]

// `count` split into `boxesLeft`/`chasersLeft` (obs-layout-plan.md §2.7) — mirrors upstream commit
// e31e2aa splitting the old single `/channel/[id]/widget/count` page into two, so each cell can be
// placed and positioned independently. See registry.ts `makeElement`/config.ts `migrateConfig` for
// the stored-config migration this required.
export const WIDGET_IDS = ['pick2', 'stashorpass', 'name', 'boxesPerBreak', 'boxesLeft', 'chasersLeft'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

// `ticker` (obs-ticker-plan.md §3): one FIXED slot per WidgetId — the operator switches each on/off
// and recolours it; order is always the canonical WIDGET_IDS order, never a free list. `label`
// overrides the default label text ("Pick 2", …, see TickerElement.tsx's DEFAULT_TICKER_LABELS);
// empty/undefined = default. Colours are `#rrggbb` (validated by config.ts's ticker validator);
// undefined = the component's own DEFAULT_LABEL_COLOR/DEFAULT_VALUE_COLOR.
export type TickerSlot = {
    enabled: boolean
    label?: string // max 40 chars
    labelColor?: string // CSS hex '#rrggbb', default '#9fd6ff'
    valueColor?: string // CSS hex '#rrggbb', default '#ffffff'
    // chasersLeft ONLY (config.ts rejects it on any other slot): colour of the "/" in a
    // "<count> / <pct>%" value. Undefined = the slot's value colour.
    slashColor?: string // CSS hex '#rrggbb'
}
export type TickerDirection = 'left' | 'right'
export const TICKER_DIRECTIONS = ['left', 'right'] as const

// Seeded by `makeElement` (registry.ts) for a freshly-placed ticker — all six widgets on, no label/
// colour overrides. Cloned per element (never shared by reference) the same way `DEFAULT_SCENE_EFFECTS`
// is cloned in `makeElement`'s `scene` case.
export const DEFAULT_TICKER_SLOTS: Record<WidgetId, TickerSlot> = Object.fromEntries(
    WIDGET_IDS.map((id) => [id, { enabled: true }])
) as Record<WidgetId, TickerSlot>

export const FRAME_VARIANTS = ['static'] as const
export type FrameVariant = (typeof FRAME_VARIANTS)[number]

// obs-layout-plan.md §1.9's wrap-around stash-or-pass, plus `stashOrPassWrapTl` — the same
// animation rebuilt on a local label timeline (stash-or-pass-timeline-plan.md). The two are
// deliberately both available so they can be placed together and compared; whichever wins, the
// other is deleted and this union goes back to one member.
export const ANIMATION_IDS = [
    'stashOrPassWrap',
    'stashOrPassWrapTl',
    'stashOrPassWrapRing',
    'stashOrPassSportStyle',
] as const
export type AnimationId = (typeof ANIMATION_IDS)[number]

// How an `imageBox`'s uploaded image fits its box — maps 1:1 onto CSS `object-fit`: contain =
// `contain` (whole image visible, letterboxed), cover = `cover` (box filled, overflow cropped),
// stretch = `fill` (ignores aspect ratio). See elements/image-box/ImageBoxElement.tsx.
export const IMAGE_FITS = ['contain', 'cover', 'stretch'] as const
export type ImageFit = (typeof IMAGE_FITS)[number]

// `imageBox.position` — a percentage pair (each 0..100) mapped straight onto CSS
// `object-position` (obs-image-box-plan.md §5): 50/50 = centred (the default), 0/0 = the image's
// top-left corner pinned to the box's top-left, 100/100 = its bottom-right corner pinned to the
// box's bottom-right. Meaningless for `fit: 'stretch'` (a stretched image has no slack to pan).
export const DEFAULT_IMAGE_POSITION = { x: 50, y: 50 }

// Sort mode shared by `results` (§2.3, always 'alphabetical') and `resultsThin` (§2.4, operator
// choice) — see elements/results/orderResults.ts.
export const RESULTS_SORTS = ['alphabetical', 'customer'] as const
export type ResultsSort = (typeof RESULTS_SORTS)[number]

// Per-element opt-out of a native reaction its registry entry declares in `reactsTo` (registry.ts)
// — default (key absent, or `undefined`) is "on"; only `false` turns it off. See config.ts
// `effectiveReactions()`.
export type Reactions = Partial<Record<SceneEventName, boolean>>

// Which element kinds may be mirrored — the SOURCE side of `mirrorOf` (obs-layout-text-mirror-plan.md).
// Single source of truth: the controls page shows the Mirror button only for these kinds, and
// config.ts's validator refuses a `mirrorOf` whose source is any other kind. Add a kind here to
// make it mirrorable; nothing else needs to change (`resolveEffective` is kind-agnostic).
export const MIRRORABLE_KINDS = ['text', 'scene'] as const satisfies readonly ElementKind[]
export type MirrorableKind = (typeof MIRRORABLE_KINDS)[number]

// Present on every element kind so a mirror can be of any kind the allowlist admits. A mirror
// is the same element again at another X/Y: it inherits everything but its placements' x/y and
// stores nothing else of its own. Resolving the inheritance is centralised in exactly one place,
// config.ts's `resolveEffective` — every renderer/editor reads a merged element through that,
// never through this field directly. Code elsewhere may read `mirrorOf` only for POLICY ("is
// this a mirror" / "who mirrors this"), never to itself merge properties.
export type MirrorFields = { mirrorOf?: string }

// `scene` — a layered 2.5D living background (obs-scene-element-plan.md §1/§2). Delivered in three
// independent iterations; this file carries iteration 1's three effect ids (sky/mountain/clouds),
// iteration 2's `rain`/`lightning` (§5), and iteration 3's `birds` (§6) — each appended to
// `SceneEffect`/`SCENE_EFFECT_IDS`/`DEFAULT_SCENE_EFFECTS` in turn, never reordering or removing
// what's already here (a stored config's `effects` array survives across iterations on that
// promise).
export const SKY_MOODS = ['day', 'dusk', 'night'] as const
export type SkyMood = (typeof SKY_MOODS)[number]

export const SCENE_QUALITIES = ['full', 'reduced'] as const
export type SceneQuality = (typeof SCENE_QUALITIES)[number]

// One entry per effect. `enabled` is on every member so the settings panel can render a uniform
// toggle column. `y`/`yMin`/`yMax` are percentages of the element's own box height (0 = top edge,
// 100 = bottom edge) — see obs-scene-element-plan.md §1.1 for which edge of each ART layer they
// anchor (`mountain`'s bottom edge, a `clouds` strip's vertical centre). Fill layers (`sky`) have
// no `y`. `clouds` may appear twice in one `effects` array (`layer: 'far' | 'near'`, §1.2) — the
// two copies are otherwise-independent effect instances, not two fields of one effect.
export type SceneEffect =
    | { id: 'sky'; enabled: boolean; mood: SkyMood }
    | { id: 'mountain'; enabled: boolean; y: number } // bottom edge at y
    | { id: 'clouds'; enabled: boolean; layer: 'far' | 'near'; speed: number; opacity: number; y: number } // centre at y
    // iteration 2 (obs-scene-element-plan.md §5) — appended, never inserted earlier in the union:
    // a stored config's `effects` array is order-independent by id, but SCENE_EFFECT_IDS/DEFAULT_
    // SCENE_EFFECTS below read this union's member order for nothing load-bearing, so keeping new
    // members at the end is just discipline, not a hard requirement.
    | { id: 'rain'; enabled: boolean; intensity: number } // 0..1
    | { id: 'lightning'; enabled: boolean; ambientIntervalSec: number | null } // null = cue-only, no ambient timer
    // iteration 3 (obs-scene-element-plan.md §6): a flock of a random `countMin..countMax` birds
    // (integer, inclusive, re-rolled per flock) spawns every `intervalSec` (± jitter) and flies the
    // box's width inside the `yMin..yMax` band (art layer, z 40 — see effectRegistry.ts's
    // `LAYER_Z`). A legacy single `count` is migrated to `countMin = countMax = count` by
    // config.ts's `sanitizeSceneEffects`.
    | { id: 'birds'; enabled: boolean; countMin: number; countMax: number; intervalSec: number; yMin: number; yMax: number }

export type SceneEffectId = SceneEffect['id']

// Effect ids actually implemented so far — grows in lockstep with the `SceneEffect` union above as
// §5/§6 append members. Used by config.ts to decide which stored effect ids are "known" (kept) vs.
// "unknown" (dropped, not rejected — obs-scene-element-plan.md §2.2: a config saved by a newer
// build must still load on an older one, and vice versa).
export const SCENE_EFFECT_IDS: readonly SceneEffectId[] = ['sky', 'mountain', 'clouds', 'rain', 'lightning', 'birds']

export function isSceneEffectId(v: unknown): v is SceneEffectId {
    return typeof v === 'string' && (SCENE_EFFECT_IDS as readonly string[]).includes(v)
}

// Seeded by `makeElement` (registry.ts) for a freshly-placed scene, and by config.ts's
// `migrateConfig` whenever a stored `effects` array is missing/empty/entirely-unknown-ids —
// obs-scene-element-plan.md §2.1/§2.2. Order matches the layer table's back-to-front reading order
// (sky, clouds-far, mountain, clouds-near) though paint order is actually decided by
// `elements/scene/effectRegistry.ts`'s `LAYER_Z`, not this array's order.
export const DEFAULT_SCENE_EFFECTS: SceneEffect[] = [
    { id: 'sky', enabled: true, mood: 'day' },
    { id: 'clouds', enabled: true, layer: 'far', speed: 12, opacity: 0.7, y: 35 },
    { id: 'mountain', enabled: true, y: 100 },
    { id: 'clouds', enabled: true, layer: 'near', speed: 28, opacity: 0.9, y: 80 },
    // iteration 2 (obs-scene-element-plan.md §5): both OFF by default — weather is a cue-driven
    // mood (the 'storm' scene event), not the resting state of the scene. `config.ts`'s
    // `sanitizeSceneEffects` appends these two (append-if-missing, not substitute-all) onto any
    // iteration-1 config that predates them.
    { id: 'rain', enabled: false, intensity: 0.5 },
    { id: 'lightning', enabled: false, ambientIntervalSec: null },
    // iteration 3 (obs-scene-element-plan.md §6): on by default — birds are ambient scenery, not a
    // cue-driven mood like the weather effects above. `config.ts`'s `sanitizeSceneEffects` appends
    // this (append-if-missing, not substitute-all) onto any iteration-1/2 config that predates it.
    { id: 'birds', enabled: true, countMin: 2, countMax: 5, intervalSec: 25, yMin: 15, yMax: 45 },
]

export type Element = (
    // `sport_style` (sport-style-board-plan.md §2, R1 fix 5, R3) carries extra fields, read only by
    // that variant and left `undefined` by every other board: `cols` (cells per row,
    // operator-set), `turf`/`patch` (opaque JSON blobs the operator pastes from the
    // /obs/setup/sport_style/* playgrounds' own Export output — `unknown` on purpose, never
    // validated here, see SportStyleBoard.tsx's deep-merge over its own defaults), `margin` (px,
    // transparent band between the element's edge and the painted field on every side; default
    // 0). The field's own edge gap — field edge to the outer strips — is NOT here: it is the
    // `edgeGap` key of the `turf` blob, the same knob the board playground exports.
    // `edgeMode`/`sortMode` (R3.4) are chosen from two selects in SportStyleBoardSettings, same
    // config path (`onPatchElement`), no validation — the component narrows with defaults exactly
    // like `cols`. `edgeMode: 'tiered'` draws a per-tier medal edge (tierSkins.ts) instead of
    // today's auto-palette wear; `sortMode: 'centered'` deals cells `board:cobra_flat`'s way
    // (value-centred, sold pushed to the edges) instead of alphabetically.
    | {
          kind: 'board'
          variant: BoardVariant
          cols?: number
          turf?: unknown
          patch?: unknown
          margin?: number
          edgeMode?: 'plain' | 'tiered'
          sortMode?: 'alphabetical' | 'centered'
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    | { kind: 'widget'; widget: WidgetId; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
    | { kind: 'cards' | 'ripbar' | 'reserved'; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
    // `results` carries its own column count (obs-layout-plan.md §2.3 + the 1f refactor); the
    // grid and the ordering interleave both read it, so they can never disagree.
    | {
          kind: 'results'
          columns?: number
          sort?: ResultsSort
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // Compact/configurable sibling of `results` (obs-layout-plan.md §2.4) — its own registry id
    // (`resultsThin`) rather than a `results` variant, so a config may place both at once (e.g.
    // the full board during `results` plus a thin list next to the board during `selling`/
    // `ripping`). Reuses `elements/results/orderResults.ts` with these as its `{columns, sort}`.
    // `textSize`/`iconSize` are px, applied directly by the component (not derived from `box` —
    // rows squeeze to their content instead of dividing box.h by row count).
    | {
          kind: 'resultsThin'
          columns?: number
          textSize?: number
          iconSize?: number
          sort?: ResultsSort
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // FE-generated frame (obs-layout-plan.md §2.5 — replaces the old full-canvas `<img>`).
    // Two settings, stacked from the canvas edge inwards:
    //   - `borders` — how far the plain BLACK fill reaches in from each screen edge, per side.
    //     Per-stage, resolved exactly like `placements` — `borders[phase] ?? borders.all`, see
    //     `resolveBorders` in config.ts — so "same on every stage" is one edit (`all`) and a stage
    //     can still override.
    //   - `frameWidth` — the thickness of the gradient frame drawn just inside that black fill.
    //     One number for all four sides, and NOT per-stage: the frame is the channel's constant
    //     furniture, it is the black fill around it that stages move (see FrameSettings.tsx).
    // The registry id/variant stays `static` even though the frame is now code-drawn rather than
    // an image (see registry.ts's comment on that choice).
    | {
          kind: 'frame'
          variant: FrameVariant
          borders?: Partial<Record<PlacementKey, Sides>>
          frameWidth?: number
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // Boxless (obs-layout-plan.md §1.9, entrance/orbit rewrite in §2.2): `target` names another
    // element's key to glue to via useResolvedBox() — undefined means "the first board in the
    // config" (resolved by the component itself, not stored here, so re-ordering boards never
    // needs a config rewrite). `pad` is the band's offset from the target's box edge (registry
    // default 24). `bandThickness` is the marquee band's own thickness (registry default 56).
    // `speed` is the marquee scroll speed in canvas px/s (registry default 220). `holdMs` is the
    // entrance's "hold" beat duration (spec §2/§7.1 — the single most likely timing to need
    // retuning without a redeploy; registry default 220). There is no `durationMs`/auto-dismiss:
    // the orbit runs until the operator toggles `OverlayState.active.stash_or_pass` off.
    | {
          kind: 'animation'
          animation: AnimationId
          target?: string
          // board-anchors-plan.md §3: which of `target`'s registry-declared `anchors`
          // (registry.ts's `RegistryEntry.anchors`) to glue to instead of its plain resolved box —
          // undefined means "the whole box" (useTargetShape, anchors.tsx). Deliberately NOT
          // cross-checked against the target's current registry entry here or in config.ts: a board
          // variant swap must not invalidate the whole config. A stale/unpublished name simply falls
          // back to the box at render time, and the settings panel flags it (see
          // StashOrPassWrapSettings.tsx's "Attach to" select).
          targetAnchor?: string
          pad?: number
          bandThickness?: number // deprecated: bands now size themselves to their text
          laneFontSize?: number
          speed?: number
          holdMs?: number
          /**
           * Playback rate for `stashOrPassWrapTl`'s timeline. 1 = the choreography's real spec
           * timings; lower is slower. Defaults to DEFAULT_RATE (0.2), which reproduces the pace of
           * the `stashOrPassWrap` element this one is being compared against — that one bakes in a
           * committed `TIME_SCALE = 5`, so a rate-1 rebuild runs five times faster than the thing
           * it replaces. Unused by `stashOrPassWrap`.
           */
          rate?: number
          /**
           * `animation:stashOrPassSportStyle` only (stash-or-pass-quarters-plan.md Revision 2,
           * R1). The lane is a filled ring shape, not a stroked centreline: `cornerWidth` is the
           * OUTER corner radius in canvas px (default: the element's own lane thickness), and
           * `cornerRoundness` (0..1) sets the INNER corner radius as a fraction of `cornerWidth`
           * (default 0.5). Both are clamped at render to fit the rect they round. Unused by every
           * other animation id.
           */
          cornerWidth?: number
          cornerRoundness?: number
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // Free-form operator text (obs-layout-plan.md §2.12) — a custom string and a font size,
    // centred on both axes in its box. `fontSize` is absolute canvas px (see TextElement.tsx's
    // comment for why: unlike the circle widgets' fixed-content readouts, this holds arbitrary
    // text the operator sizes by eye, so it is deliberately NOT derived from `box`). `text` is
    // capped at MAX_TEXT_LENGTH (below) by config.ts's validator.
    | {
          kind: 'text'
          text?: string
          fontSize?: number
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // An operator-uploaded picture rendered inside the layout itself (obs-image-box-plan.md): the
    // controls page uploads a file to `/api/layout/image/upload`, the backend stores it on
    // DigitalOcean Spaces and returns a public URL, and that URL is stored here. The layout page
    // renders an `<img>` at the element's box/layer like any other element — no OBS involvement.
    // `fit` picks how the image fills its box (default 'contain', see IMAGE_FITS above).
    | {
          kind: 'imageBox'
          url?: string
          // Display label shown in the settings panel (element's own name + `W × H px`), copied
          // from the gallery row or the upload form's Name field (obs-image-box-plan.md §6). Never
          // read by the layout page itself.
          name?: string
          fit?: ImageFit
          // Which part of the image shows when `fit` crops or letterboxes it (obs-image-box-plan.md
          // §5) — a percentage pair, default DEFAULT_IMAGE_POSITION (centred). Ignored by `stretch`.
          position?: { x: number; y: number }
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // Series-scoped raw-text readout of a `price_ranges` series' contents
    // (series-price-ranges-plan.md §4) — "how many cards in each price band". The ranges
    // themselves are series data (SeriesPriceRange, entities.ts), edited on the controls page's
    // PriceRangesSettings and read through useLayoutData's `seriesPriceRanges` source, not stored
    // here. It has two per-element settings, stored in LayoutConfig like `text.fontSize`:
    // `labelFontSize` (the range label) and `badgeFontSize` (the count badge), both absolute
    // canvas px.
    | {
          kind: 'priceRanges'
          labelFontSize?: number
          badgeFontSize?: number
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // A second readout of the same `price_ranges` series as `priceRanges` above, styled as a
    // wooden shop sign hanging by two chains from a wall bracket, swaying gently in a fake wind
    // (obs-price-sign-plan.md). Same data source, different skin — see
    // elements/price-sign/PriceSignElement.tsx. Not in MIRRORABLE_KINDS (mirroring a hanging sign
    // makes no sense the way mirroring a text/scene layer does). All fields optional — component
    // defaults (DEFAULT_* constants, PriceSignElement.tsx) apply when unset, same convention as
    // `priceRanges`'s labelFontSize/badgeFontSize.
    | {
          kind: 'priceSign'
          labelFontSize?: number // canvas px, default 44 (same as priceRanges)
          badgeFontSize?: number // canvas px, default 40
          boardWidthPct?: number // board width as % of box.w, any finite number > 0 (may exceed 100), default 72
          chainLength?: number // canvas px of visible chain between the two hooks, 0..1000, default 120
          windStrength?: number // 0..2 multiplier on swing amplitude, default 1; 0 = static
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // Layered 2.5D living background (obs-scene-element-plan.md §1/§2/§4) — a normal boxed element
    // sized entirely from its own resolved `box`, no reference resolution/aspect assumption (§1.1).
    // `quality` defaults to 'full' when absent (registry default; see SceneElement.tsx). `effects`
    // is REQUIRED (unlike most other kinds' optional settings-with-a-component-default pattern)
    // because it is a list, not a scalar — there is no single sane "leave it unset" for an array of
    // independently-toggled layers; `makeElement` seeds it from DEFAULT_SCENE_EFFECTS.
    | {
          kind: 'scene'
          quality?: SceneQuality
          effects: SceneEffect[]
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
    // Curved LED-band text ticker (obs-ticker-plan.md) — a static `curve.png` texture with one line
    // of "label: value" parts compiled from the six circle widgets' data, looped forever along the
    // band's centreline. The circle widgets themselves are not placed; this only reuses their data
    // sources and settings panels (elements/ticker/TickerElement.tsx,
    // controls/elements/TickerSettings.tsx). `slots` is REQUIRED, like `scene.effects` above — a
    // list of six independently-toggled entries has no single sane "leave it unset" default; a
    // freshly-added ticker is seeded with `DEFAULT_TICKER_SLOTS` (all six enabled, no overrides).
    // Every other field is optional — component defaults (TickerElement.tsx's DEFAULT_* constants)
    // apply when unset, same convention as `priceSign`'s labelFontSize/badgeFontSize/etc. Not in
    // MIRRORABLE_KINDS (§3: "a moving ticker mirrored elsewhere would drift out of phase").
    | {
          kind: 'ticker'
          slots: Record<WidgetId, TickerSlot>
          separator?: string // default '   •   '; capped at MAX_TEXT_LENGTH
          fontSize?: number // canvas px, default 48
          speed?: number // canvas px/s, 0..600, default 90; 0 = static
          direction?: TickerDirection // default 'left' (text travels right→left)
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }
) & MirrorFields

export type LayoutConfig = {
    version: 1
    canvas: { w: 1080; h: 1920 }
    // Ordered — this order IS the prev/dropdown/next cycle on the controls page and the Stream
    // Deck's next_stage/prev_stage wrap. Always non-empty and always contains the three built-ins
    // (see `BUILT_IN_STAGES` below) — enforced by config.ts's `validateConfig`.
    stages: Stage[]
    elements: Record<string, Element> // key = stable id, e.g. 'board', 'camera', 'pick2'
    obsBindings: {
        transitionSource?: string
        cameraItem?: string
        // Transition is a controls-only action (the layout page never learns about it) — see
        // obs-layout-plan.md §1.7 "Transition as a controls action".
        useTransition?: boolean
    }
}

// A named, per-channel snapshot of a LayoutConfig (obs-layout-presets-plan.md). Wire shape as
// stored/returned by the backend, snake_case like every other entity consumed raw (`series_id`,
// `active_break_id`). `config` is deliberately typed `unknown`, not `LayoutConfig`: it is whatever
// blob was stored — possibly under an older schema version — and only becomes a trustworthy
// `LayoutConfig` by passing `migrateConfig` + `validateConfig` on load (see `applyPreset` below).
export type LayoutPreset = {
    id: number
    channel_id: number
    name: string
    config: unknown
    created_at: string
    updated_at: string
}

export type OverlayState = {
    phase: Phase
    phaseData?: Record<string, unknown> // discarded on phase change
    overrides?: Record<string, { visible?: boolean }>
    /**
     * Scene events that are currently LATCHED ON (obs-layout-plan.md §2.2). Most scene events are
     * momentary — the cue plays an animation and is over. A few (stash-or-pass) stay up until the
     * operator toggles them off, which can be minutes, so their on/off-ness is state rather than a
     * cue: a browser source that reloads mid-orbit reads this and resumes, while the cue that rode
     * alongside the toggle (and played the entrance) is long gone.
     */
    active?: Partial<Record<SceneEventName, boolean>>
}

// Discriminated cue union (obs-layout-plan.md §1.9), split into the two channels it can ride
// (see the DURABLE/TRANSIENT split below `BUS_EVENT_NAME`) so the type system — not just naming
// and comments — enforces which cue can go on which bus.

// Rides the DURABLE bus (BusPayload, BUS_EVENT_NAME below). Every emit is preceded by a backend
// state write that bumps `seq`, which is what lets a reloaded browser source catch up: state is
// re-read on mount, so a durable cue's effects survive a refresh even though the cue itself is
// long gone by then.
export type DurableCue =
    // `event` carries a semantic scene event (see sceneEvents.ts); `photos-changed` and `refetch`
    // are the pre-existing data-spine cues (useLayoutData.tsx), formalized here instead of the
    // previous open `{kind: string, ...}` shape.
    | { kind: 'event'; name: SceneEventName; params?: Record<string, unknown> }
    | { kind: 'photos-changed' }
    | { kind: 'refetch'; key: string }

// Rides the TRANSIENT bus (CuePayload, BUS_CUE_EVENT_NAME below). No backend write, no `seq` —
// meaningless a moment after it fires, so nothing here needs to (or could safely) survive a
// browser-source refresh.
export type TransientCue =
    // The operator hovering a card in the controls page's card grid; the `cards` element zooms
    // that card the same way a local hover does. `photoId: null` means "nothing highlighted".
    // Rides the TRANSIENT bus (BUS_CUE_EVENT_NAME below), never a BusPayload: it fires on mouse
    // movement, and the BusPayload path writes state to the backend and bumps `seq` on every emit.
    | { kind: 'highlight-photo'; photoId: number | null }
    // The board:sport_style settings panel's "Regenerate turf"/"Regenerate teams" buttons
    // (sport-style-board-plan.md R1 fix 6) — re-rolls one of the element's two module-level seeds
    // (turf render, or every team's edge wear) and re-renders. No backend write: like
    // `highlight-photo`, it means nothing a moment after it fires, so the TRANSIENT bus (never a
    // BusPayload) is the right channel.
    | { kind: 'sport-style-regenerate'; target: 'turf' | 'wear' }

export type Cue = DurableCue | TransientCue

export type BusPayload = {
    seq: number
    state: OverlayState
    config: LayoutConfig
    cue?: DurableCue
}

// The three stages every config is born with and can never fully lose — deleting one is refused
// by the Stages tab UI, and config.ts's `validateConfig` rejects a config missing any of them
// outright, since an ungoverned config would leave elements placed on a stage nothing can reach.
// They CAN be reordered — this array's order is not itself meaningful, it's a set of ids/labels.
export const BUILT_IN_STAGES: Stage[] = [
    { id: 'selling', label: 'Selling' },
    { id: 'results', label: 'Results' },
    { id: 'ripping', label: 'Ripping' },
]

// What `defaultConfig()` (config.ts) seeds `stages` with, and what `migrateConfig` backfills onto
// any config stored before `stages` existed. Same three, same order, as `BUILT_IN_STAGES` — kept
// as a separate constant (rather than every caller reusing BUILT_IN_STAGES directly) so the two
// concerns — "which stages can never be deleted" vs. "what a fresh config starts with" — can drift
// independently if a future change ever needs them to.
export const DEFAULT_STAGES: Stage[] = BUILT_IN_STAGES.map((s) => ({ ...s }))

export const CANVAS: { w: 1080; h: 1920 } = { w: 1080, h: 1920 }

// Fallback used by `resolveBorders` (config.ts) when a `frame` element has no `borders` at all,
// and by `makeElement` (registry.ts) as the default for a freshly-added frame. Lives here (not in
// config.ts or registry.ts) so both can import one literal without a circular dependency between
// those two files.
export const DEFAULT_FRAME_BORDERS: Sides = { top: 24, right: 24, bottom: 24, left: 24 }

// Fallback used by `resolveFrameWidth` (config.ts) when a `frame` element has no `frameWidth`, and
// by `makeElement` (registry.ts) for a freshly-added frame. 8px was the width of the fixed edge
// ornament this setting replaces, so a config stored before `frameWidth` existed keeps the same
// overall footprint it had: its `borders` become the black fill and the frame sits inside them.
export const DEFAULT_FRAME_WIDTH = 8

// Cap on `text` element's `text` field (obs-layout-plan.md §2.12: "Validate text as a string
// (capped)"). 500 was picked as generous for a few lines of operator copy while still being far
// short of anything that could bloat the config payload or overflow a box in a way `white-space:
// pre-wrap` can't just wrap around. Enforced by config.ts's validator and used as the controls
// textarea's `maxLength` (TextSettings.tsx) so the two never disagree.
export const MAX_TEXT_LENGTH = 500

export const BUS_EVENT_NAME = 'mob:trigger'
export const DEV_CHANNEL_NAME = 'mob:bus'

// ── Return path: layout -> controls ─────────────────────────────────────────────────────────
// The ONLY channel that flows this direction (obs-browser-event-bus.md §8). The `cards` element
// (pending-sold-cards-plan.md §2.3) publishes which photo ids are pending-removal so the controls
// page's CardsSettings (§3) can tint the matching cards. Plain BroadcastChannel, no obs-websocket
// involved: works because an OBS browser source and an OBS custom browser dock share one Chromium
// profile, so it does nothing in a plain Chrome tab controls page (accepted — the tint is missing
// there, nothing else breaks).
export const PENDING_CHANNEL_NAME = 'mob:pending'
export type PendingPayload = { kind: 'pending-photos'; channelId: number; photoIds: number[]; sentAt: number }

// ── Transient cue channel ────────────────────────────────────────────────────────────────────
// A second, deliberately separate bus event carrying a cue and NOTHING else. `BusPayload` is the
// durable channel: every emit is preceded by a backend state write that bumps `seq`, which is what
// makes a reloaded browser source able to catch up. That is exactly wrong for a signal driven by
// mouse movement — one row in `overlay_state` per hover — so cues that are purely ephemeral (they
// mean nothing after the moment they describe) go here instead.
//
// It carries no state and no config, so it cannot desync the layout and it stays clear of the
// `seq` guard. `n` is only for ORDERING: obs-browser-event-bus.md §6.5 says delivery order is not
// preserved, and a "highlight off" overtaking its "highlight on" would leave a card stuck zoomed
// on stream. Unlike `seq`, `n` is client-assigned (no backend is involved), so it is seeded from
// the wall clock at first use — a reloaded controls page then resumes ABOVE whatever its previous
// life sent, instead of restarting at 1 and having every cue dropped as stale.
//
// Accepted limitation (confirmed fine, documented rather than fixed): this assumes ONE controls
// page per channel at a time. With two concurrent controls tabs, the older tab's `n` is seeded
// from an earlier wall-clock read than the newer tab's, so its cues sit below the newer tab's
// seed and are dropped by the receiver's single high-water mark.
export const BUS_CUE_EVENT_NAME = 'mob:cue'
export const DEV_CUE_CHANNEL_NAME = 'mob:cue-bus'

export type CuePayload = { n: number; cue: TransientCue }
