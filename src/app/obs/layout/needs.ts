// The data-needs table for the layout spine (obs-layout-adding-elements-plan.md §A.2). Replaces
// the hand-written `if (element.kind === …) needsX = true` chain that used to live inside
// useLayoutData.tsx's `deriveNeeds` — that chain compiled fine with a new element missing from it,
// so it just rendered with no data and no error (see the plan's "soft spot" table). Every registry
// id must appear here; an element that reads no spine-provided data beyond what always polls says
// `[]`. `NEEDS_BY_ID` is keyed by `RegistryId` (type-only import — no runtime dependency on
// registry.ts, see elementId.ts's header) so the `satisfies` below is what fails to compile when a
// new id is added and forgotten here.
import type { RegistryId } from './registry'
import type { Needs } from './useLayoutData'

export type NeedFlag = keyof Needs

export const NEEDS_BY_ID = {
    'board:flat': [],
    'board:classic': [],
    // Cobra (and cobra_flat, which shares its settings panel) render `series.kind` via the `name`
    // widget's data path and read the channel's price-range/team-price sources — both gated behind
    // `needsCobra`/`needsSeries` in useLayoutData's pollers.
    'board:cobra': ['needsCobra', 'needsSeries'],
    'board:cobra_flat': ['needsCobra', 'needsSeries'],
    // Reads `stream`/`events` (always-on sources) plus a lazily-loaded, self-cached team palette
    // (teamPalette.ts, no flag needed) — and, since R3 (tiered edges + centered sort), the same
    // price-range/team-price sources `board:cobra`/`board:cobra_flat` gate behind
    // `needsCobra`/`needsSeries`, so a team lands on the same tier here as on those boards.
    'board:sport_style': ['needsCobra', 'needsSeries'],
    'widget:pick2': ['needsPick2'],
    'widget:stashorpass': ['needsStashOrPass'],
    // Only needs the shared `series` source, not a flag of its own — mirrors the old code's local
    // `needsName`, which existed solely to OR into `needsSeries` and was never exposed itself.
    'widget:name': ['needsSeries'],
    'widget:boxesPerBreak': ['needsBoxesPerBreak'],
    'widget:boxesLeft': ['needsCount'],
    'widget:chasersLeft': ['needsCount'],
    results: [],
    resultsThin: [],
    cards: ['needsCards'],
    ripbar: [],
    reserved: [],
    'frame:static': [],
    'animation:stashOrPassWrap': [],
    'animation:stashOrPassWrapTl': [],
    'animation:stashOrPassWrapRing': [],
    'animation:stashOrPassSportStyle': [],
    text: [],
    'image-box': [],
    // `priceRanges` also renders `series.kind` (PriceRangesElement.tsx), so it needs the same
    // `series` source the cobra board and `name` widget pull, in addition to its own ranges list.
    priceRanges: ['needsSeriesPriceRanges', 'needsSeries'],
    // Same data source as `priceRanges` — a second skin over the same series ranges list
    // (obs-price-sign-plan.md §3).
    priceSign: ['needsSeriesPriceRanges', 'needsSeries'],
    // Reads no break/stream data (obs-scene-element-plan.md §2.2) — everything it renders comes
    // from its own element config.
    scene: [],
    // The UNION of every one of the six widgets' flags (obs-ticker-plan.md §4): the operator can
    // enable any slot at runtime and needs are static per registry id, so every source a slot might
    // read has to be on. Over-fetches when only a couple of slots are enabled — accepted, the
    // spine's pollers are cheap and per-element dynamic needs don't exist yet.
    ticker: ['needsPick2', 'needsStashOrPass', 'needsSeries', 'needsBoxesPerBreak', 'needsCount'],
    // Reads no break/stream data (obs-camera-shelf-plan.md) — the window is a live OBS camera
    // feed, not anything the spine provides; everything else here is static art/config.
    cameraShelf: [],
    // Reads no spine data (obs-visibility-toggle-plan.md §5) — it carries only a list of OBS
    // source names and renders nothing.
    obsToggle: [],
} as const satisfies Record<RegistryId, readonly NeedFlag[]>
