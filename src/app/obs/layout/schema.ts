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

export const BOARD_VARIANTS = ['flat', 'classic', 'cobra'] as const
export type BoardVariant = (typeof BOARD_VARIANTS)[number]

// `count` split into `boxesLeft`/`chasersLeft` (obs-layout-plan.md §2.7) — mirrors upstream commit
// e31e2aa splitting the old single `/channel/[id]/widget/count` page into two, so each cell can be
// placed and positioned independently. See registry.ts `makeElement`/config.ts `migrateConfig` for
// the stored-config migration this required.
export const WIDGET_IDS = ['pick2', 'stashorpass', 'name', 'boxesPerBreak', 'boxesLeft', 'chasersLeft'] as const
export type WidgetId = (typeof WIDGET_IDS)[number]

export const FRAME_VARIANTS = ['static'] as const
export type FrameVariant = (typeof FRAME_VARIANTS)[number]

// obs-layout-plan.md §1.9's wrap-around stash-or-pass, plus `stashOrPassWrapTl` — the same
// animation rebuilt on a local label timeline (stash-or-pass-timeline-plan.md). The two are
// deliberately both available so they can be placed together and compared; whichever wins, the
// other is deleted and this union goes back to one member.
export const ANIMATION_IDS = ['stashOrPassWrap', 'stashOrPassWrapTl', 'stashOrPassWrapRing'] as const
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

export type Element =
    | { kind: 'board'; variant: BoardVariant; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
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
          fit?: ImageFit
          // Which part of the image shows when `fit` crops or letterboxes it (obs-image-box-plan.md
          // §5) — a percentage pair, default DEFAULT_IMAGE_POSITION (centred). Ignored by `stretch`.
          position?: { x: number; y: number }
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }

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
