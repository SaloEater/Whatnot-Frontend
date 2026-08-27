// Pure-TypeScript schema for the OBS layout system.
// See obs-layout-plan.md §1.2 for the design this file implements, §1.7 for v2 (persistent
// elements via 'all', the frame element kind, `z` render order, and transition becoming a
// controls-only action instead of a phase), and §1.9 for v3 (scene events, `reactions`, the
// `Cue` discriminated union, and boxless elements — the standalone `effect` element kind it
// replaced is gone, see config.ts `migrateConfig`).

import type { SceneEventName } from './sceneEvents'

export type Phase = 'selling' | 'results' | 'ripping'

// A placement is keyed by a real phase, or 'all' — a persistent fallback used when no
// phase-specific placement exists. Resolution: placements[phase] ?? placements.all (see
// `resolveBox` in config.ts).
export type PlacementKey = Phase | 'all'

export type Box = { x: number; y: number; w: number; h: number }

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

export type BoardVariant = 'flat' | 'classic' | 'cobra'

export type WidgetId = 'pick2' | 'stashorpass' | 'name' | 'boxesPerBreak' | 'count'

export type FrameVariant = 'static'

// Only one animation exists so far (obs-layout-plan.md §1.9's wrap-around stash-or-pass), but the
// id is its own type — like WidgetId/FrameVariant — so a second one slots in the same way later.
export type AnimationId = 'stashOrPassWrap'

// Sort mode shared by `results` (§2.3, always 'alphabetical') and `resultsThin` (§2.4, operator
// choice) — see elements/results/orderResults.ts.
export type ResultsSort = 'alphabetical' | 'customer'

// Per-element opt-out of a native reaction its registry entry declares in `reactsTo` (registry.ts)
// — default (key absent, or `undefined`) is "on"; only `false` turns it off. See config.ts
// `effectiveReactions()`.
export type Reactions = Partial<Record<SceneEventName, boolean>>

export type Element =
    | { kind: 'board'; variant: BoardVariant; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
    | { kind: 'widget'; widget: WidgetId; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
    | { kind: 'results' | 'cards' | 'ripbar' | 'reserved'; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
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
    | { kind: 'frame'; variant: FrameVariant; image?: string; placements: Partial<Record<PlacementKey, Box>>; z?: number; reactions?: Reactions }
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
          placements: Partial<Record<PlacementKey, Box>>
          z?: number
          reactions?: Reactions
      }

export type LayoutConfig = {
    version: 1
    canvas: { w: 1080; h: 1920 }
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

// Discriminated cue union (obs-layout-plan.md §1.9). `event` carries a semantic scene event
// (see sceneEvents.ts); `photos-changed` and `refetch` are the pre-existing data-spine cues
// (useLayoutData.tsx), formalized here instead of the previous open `{kind: string, ...}` shape.
export type Cue =
    | { kind: 'event'; name: SceneEventName; params?: Record<string, unknown> }
    | { kind: 'photos-changed' }
    | { kind: 'refetch'; key: string }

export type BusPayload = {
    seq: number
    state: OverlayState
    config: LayoutConfig
    cue?: Cue
}

export const PHASES: Phase[] = ['selling', 'results', 'ripping']

// Display labels for the stages. Lives here rather than in the controls page because the Stream
// Deck vocabulary (obs/controls/useDeckBridge.ts) sends them to the plugin, which has no stage
// list of its own.
export const PHASE_LABELS: Record<Phase, string> = {
    selling: 'Selling',
    results: 'Results',
    ripping: 'Ripping',
}

export const CANVAS: { w: 1080; h: 1920 } = { w: 1080, h: 1920 }

export const BUS_EVENT_NAME = 'mob:trigger'
export const DEV_CHANNEL_NAME = 'mob:bus'
