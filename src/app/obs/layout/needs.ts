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
    text: [],
    'image-box': [],
    // `priceRanges` also renders `series.kind` (PriceRangesElement.tsx), so it needs the same
    // `series` source the cobra board and `name` widget pull, in addition to its own ranges list.
    priceRanges: ['needsSeriesPriceRanges', 'needsSeries'],
} as const satisfies Record<RegistryId, readonly NeedFlag[]>
