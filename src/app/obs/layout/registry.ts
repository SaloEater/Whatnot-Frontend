// Registry table for the OBS layout system: every placeable element kind/variant/widget
// maps to one entry here (label, sizing defaults, allowed phases, and — for now — a
// placeholder component). See obs-layout-plan.md §1.2 and Phase 2 inventory.

import type { ComponentType } from 'react'
import { Placeholder } from './Placeholder'
import { FrameElement } from './elements/frame/FrameElement'
import { StashOrPassWrap } from './elements/animation/StashOrPassWrap'
import { StashOrPassTl } from './elements/animation/tl/StashOrPassTl'
import { StashOrPassRing } from './elements/animation/ring/StashOrPassRing'
import { FlatBoard } from './elements/board-flat/FlatBoard'
import { CobraBoard } from './elements/board-cobra/CobraBoard'
import { ResultsElement } from './elements/results/ResultsElement'
import { ThinResults } from './elements/results-thin/ThinResults'
import { CircleWidget } from './elements/circle/CircleWidget'
import { CardsElement } from './elements/cards/CardsElement'
import { TextElement } from './elements/text/TextElement'
import type { AnimationId, BoardVariant, Box, Element, ElementKind, FrameVariant, Phase, WidgetId } from './schema'
import { ANIMATION_IDS, DEFAULT_FRAME_BORDERS, DEFAULT_FRAME_WIDTH } from './schema'
import type { SceneEventName } from './sceneEvents'

export type RegistryId =
    | 'board:flat'
    | 'board:classic'
    | 'board:cobra'
    | 'widget:pick2'
    | 'widget:stashorpass'
    | 'widget:name'
    | 'widget:boxesPerBreak'
    | 'widget:boxesLeft'
    | 'widget:chasersLeft'
    | 'results'
    | 'resultsThin'
    | 'cards'
    | 'ripbar'
    | 'reserved'
    | 'frame:static'
    | 'animation:stashOrPassWrap'
    | 'animation:stashOrPassWrapTl'
    | 'animation:stashOrPassWrapRing'
    | 'text'

// Shared prop contract every registry component (placeholder now, real components in Phase 2)
// implements.
export type ElementProps = {
    elementKey: string
    element: Element
    box: Box
    phase: Phase
}

export type RegistryEntry = {
    id: RegistryId
    kind: ElementKind
    label: string
    // Boards share ONE singleton slot across all variants — only one board element allowed in a
    // config, regardless of which variant it is. Same idea for results/cards/ripbar/reserved
    // (one each). Widgets are not singletons. `singletonGroup` is the key used to enforce this:
    // entries that must not coexist share the same group.
    singleton: boolean
    singletonGroup: string
    defaultBox: Box
    // Every entry allows every stage — with per-channel configurable stages (schema.ts's `Stage`)
    // a static list can no longer express which stages an element is placeable in, so there is no
    // `allowedPhases` any more (config.ts's `validatePlacements` accepts any of the config's own
    // stages, or 'all', for every registry entry).
    defaultPhases: Phase[]
    preload: string[]
    component: ComponentType<ElementProps>
    // false = schema-ready but not offered by the builder.
    available: boolean
    // Boxless elements (obs-layout-plan.md §1.9): the layout mounts them in a full-canvas,
    // non-clipping frame and they position their own content (typically via useResolvedBox() —
    // see resolvedBoxes.tsx); controls hides their x/y/w/h inputs (Layer stays). Default true —
    // only frame:static opts out so far.
    hasBox: boolean
    /**
     * Element blocks whose settings are too wide for a narrow column — the cards panel carries a
     * whole card grid. These span every column of the controls list however many the operator has
     * chosen with the Columns slider.
     */
    wideBlock?: boolean
    // Scene events (obs-layout-plan.md §1.9) this element type reacts to natively — an empty
    // array means it never reacts to anything. Config-level `Element.reactions` can switch a
    // declared reaction off per element instance (see config.ts `effectiveReactions()`); it can
    // never turn ON one the type doesn't implement.
    reactsTo: SceneEventName[]
}

function widgetDefaultBox(index: number): Box {
    // 240x240 cells along the bottom of the 1080x1920 canvas. The count cells (boxesLeft /
    // chasersLeft) use this too rather than a rectangle of their own — they are the same kind of
    // readout as the circle widgets and are expected to line up with them.
    return { x: 20 + index * 250, y: 1920 - 240 - 40, w: 240, h: 240 }
}

const BOARD_BOX: Box = { x: 0, y: 300, w: 1080, h: 1300 }
const FULL_BOX: Box = { x: 0, y: 0, w: 1080, h: 1920 }
const RIPBAR_BOX: Box = { x: 0, y: 0, w: 1080, h: 120 }
const RESERVED_BOX: Box = { x: 1080 - 480, y: 0, w: 480, h: 270 }
// A narrow right-hand column, same vertical span as BOARD_BOX — sized for "alongside a board"
// (obs-layout-plan.md §2.4's stated use case), not full-canvas like `results` (§2.3). Purely a
// starting point; the operator resizes it in the builder like any other box.
const RESULTS_THIN_BOX: Box = { x: 1080 - 340, y: 300, w: 340, h: 1300 }
// Upper-middle strip, chosen to land in the one gap the other defaults leave clear at that height:
// below RIPBAR_BOX (y 0-120, full width) and to the left of RESERVED_BOX (x 600-1080, y 0-270),
// above BOARD_BOX (starts y 300). x=40..600 and y=130..290 sits inside all three gaps at once, so
// a freshly-added text element doesn't spawn already overlapping the camera hole, the rip bar, or
// the board — purely a starting point, the operator repositions/resizes it like anything else.
const TEXT_BOX: Box = { x: 40, y: 130, w: 560, h: 160 }

export const REGISTRY: Record<RegistryId, RegistryEntry> = {
    'board:flat': {
        id: 'board:flat',
        kind: 'board',
        label: 'Board — Flat',
        singleton: true,
        singletonGroup: 'board',
        defaultBox: BOARD_BOX,
        defaultPhases: ['selling'],
        // Just the static board background — the per-cell/per-tile skin art is combinatorial
        // (style x tier x piece x variant, resolved from manifest.json at runtime) and not worth
        // eagerly preloading here (obs-layout-plan.md §2.1).
        preload: ['/images/board.png'],
        component: FlatBoard,
        available: true,
        hasBox: true,
        // A manually-triggered 'sold' scene event forces an immediate events refetch so the
        // board flips right away instead of waiting up to 5s for the spine's normal poll.
        reactsTo: [],
    },
    'board:classic': {
        id: 'board:classic',
        kind: 'board',
        label: 'Board — Classic',
        singleton: true,
        singletonGroup: 'board',
        defaultBox: BOARD_BOX,
        defaultPhases: ['selling'],
        preload: [],
        component: Placeholder,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'board:cobra': {
        id: 'board:cobra',
        kind: 'board',
        label: 'Board — Cobra',
        singleton: true,
        singletonGroup: 'board',
        defaultBox: BOARD_BOX,
        defaultPhases: ['selling'],
        preload: [],
        component: CobraBoard,
        available: true,
        hasBox: true,
        // The settings panel now carries the whole "Prices" section (side-cards price, price
        // ranges table, and the presets list/apply/save-as/delete controls) — same reasoning as
        // `cards` above: a narrow column would squash the price-ranges table and preset list.
        wideBlock: true,
        reactsTo: [],
    },
    'widget:pick2': {
        id: 'widget:pick2',
        kind: 'widget',
        label: 'Widget — Pick 2',
        singleton: false,
        singletonGroup: 'widget:pick2',
        defaultBox: widgetDefaultBox(0),
        defaultPhases: ['selling'],
        preload: [],
        component: CircleWidget,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'widget:stashorpass': {
        id: 'widget:stashorpass',
        kind: 'widget',
        label: 'Widget — Stash or Pass',
        singleton: false,
        singletonGroup: 'widget:stashorpass',
        defaultBox: widgetDefaultBox(1),
        defaultPhases: ['selling'],
        preload: [],
        component: CircleWidget,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'widget:name': {
        id: 'widget:name',
        kind: 'widget',
        label: 'Widget — Name',
        singleton: false,
        singletonGroup: 'widget:name',
        defaultBox: widgetDefaultBox(2),
        defaultPhases: ['selling'],
        preload: [],
        component: CircleWidget,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'widget:boxesPerBreak': {
        id: 'widget:boxesPerBreak',
        kind: 'widget',
        label: 'Widget — Boxes Per Break',
        singleton: false,
        singletonGroup: 'widget:boxesPerBreak',
        defaultBox: widgetDefaultBox(3),
        defaultPhases: ['selling'],
        preload: [],
        component: CircleWidget,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'widget:boxesLeft': {
        id: 'widget:boxesLeft',
        kind: 'widget',
        label: 'Widget — Boxes Left',
        singleton: false,
        singletonGroup: 'widget:boxesLeft',
        defaultBox: widgetDefaultBox(4),
        defaultPhases: ['selling'],
        preload: [],
        component: CircleWidget,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'widget:chasersLeft': {
        id: 'widget:chasersLeft',
        kind: 'widget',
        label: 'Widget — Chasers Left',
        singleton: false,
        singletonGroup: 'widget:chasersLeft',
        defaultBox: widgetDefaultBox(5),
        defaultPhases: ['selling'],
        preload: [],
        component: CircleWidget,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    results: {
        id: 'results',
        kind: 'results',
        label: 'Results',
        singleton: true,
        singletonGroup: 'results',
        defaultBox: FULL_BOX,
        defaultPhases: ['results'],
        preload: [],
        component: ResultsElement,
        available: true,
        hasBox: true,
        // Matches board-flat (obs-layout-plan.md §2.1): a manually-triggered 'sold' scene event
        // forces an immediate events refetch so the results grid updates without waiting up to
        // 5s for the spine's normal poll (obs-layout-plan.md §2.3).
        reactsTo: [],
    },
    resultsThin: {
        id: 'resultsThin',
        kind: 'resultsThin',
        label: 'Results (thin)',
        // Its own singleton group — separate from `results` (§2.3) — so a config may have both a
        // full results board AND a thin list at the same time (obs-layout-plan.md §2.4: "both
        // elements may be placed at once"), while still only allowing one of each.
        singleton: true,
        singletonGroup: 'resultsThin',
        defaultBox: RESULTS_THIN_BOX,
        // Interpretation: the plan's use case is "alongside a board, or during ripping" — full
        // `results` already owns the `results` phase by default, so this defaults to `ripping`
        // rather than competing with it. The operator can add it to any phase either way.
        defaultPhases: ['ripping'],
        preload: [],
        component: ThinResults,
        available: true,
        hasBox: true,
        // Matches `results` (§2.3): a manually-triggered 'sold' scene event forces an immediate
        // events refetch instead of waiting up to 5s for the spine's normal poll.
        reactsTo: [],
    },
    cards: {
        id: 'cards',
        kind: 'cards',
        label: 'Cards',
        singleton: true,
        singletonGroup: 'cards',
        defaultBox: FULL_BOX,
        defaultPhases: ['selling'],
        preload: [],
        component: CardsElement,
        available: true,
        hasBox: true,
        wideBlock: true,
        reactsTo: [],
    },
    ripbar: {
        id: 'ripbar',
        kind: 'ripbar',
        label: 'Rip Bar',
        singleton: true,
        singletonGroup: 'ripbar',
        defaultBox: RIPBAR_BOX,
        defaultPhases: ['ripping'],
        preload: [],
        component: Placeholder,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    reserved: {
        id: 'reserved',
        kind: 'reserved',
        label: 'Reserved',
        singleton: true,
        singletonGroup: 'reserved',
        defaultBox: RESERVED_BOX,
        defaultPhases: ['selling'],
        preload: [],
        component: Placeholder,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'frame:static': {
        id: 'frame:static',
        kind: 'frame',
        // The registry id/variant kept the name `static` (obs-layout-plan.md §2.5 interpretation:
        // renaming would also mean updating `RegistryId`, `registryIdOf`, `makeElement`, and adding
        // a variant migration for existing stored configs — more moving parts than the border/
        // ornament rework this step is actually about). The label is what changed, since the old
        // one ("static image") is now actively wrong.
        label: 'Frame (generated)',
        singleton: true,
        singletonGroup: 'frame',
        defaultBox: FULL_BOX,
        // Irrelevant for frame — makeElement() below always places it via `all` instead.
        defaultPhases: [],
        preload: [],
        component: FrameElement,
        available: true,
        // Boxless (obs-layout-plan.md §1.9): it draws its border bands + edge ornament over its
        // full-canvas frame itself rather than being clipped to a placed box.
        hasBox: false,
        reactsTo: [],
    },
    'animation:stashOrPassWrap': {
        id: 'animation:stashOrPassWrap',
        kind: 'animation',
        label: 'Stash or Pass — wrap',
        // Each instance gets its own group (obs-layout-plan.md §1.9: "own group per instance") —
        // unlike widgets, which share one shared string per widget id, this one is keyed by
        // nothing shared, so `singleton: false` alone is what actually allows multiple copies
        // (singletonGroup is only ever consulted when `singleton` is true).
        singleton: false,
        singletonGroup: 'animation:stashOrPassWrap',
        defaultBox: FULL_BOX,
        // Irrelevant here too — makeElement() always places it via `all`, same as frame.
        defaultPhases: [],
        // Self-hosted font (public/fonts/Grechka SHA_0.otf) — see StashOrPassWrap.css.
        preload: ['/fonts/Grechka SHA_0.otf'],
        component: StashOrPassWrap,
        available: true,
        // Boxless (obs-layout-plan.md §1.9): it draws a ring around ANOTHER element's box
        // (useResolvedBox(target)) rather than occupying one of its own.
        hasBox: false,
        reactsTo: ['stash_or_pass'],
    },
    // The timeline rebuild (stash-or-pass-timeline-plan.md). Identical config surface to the
    // entry above — same `kind: 'animation'` shape, so `makeElement()` needs no new branch and
    // stored configs need no migration — and it reacts to the same cue, so placing both and
    // pointing them at different boards with `target` plays old and new from one keypress.
    'animation:stashOrPassWrapTl': {
        id: 'animation:stashOrPassWrapTl',
        kind: 'animation',
        label: 'Stash or Pass — wrap (timeline)',
        singleton: false,
        singletonGroup: 'animation:stashOrPassWrapTl',
        defaultBox: FULL_BOX,
        defaultPhases: [],
        preload: ['/fonts/Grechka SHA_0.otf'],
        component: StashOrPassTl,
        available: true,
        hasBox: false,
        reactsTo: ['stash_or_pass'],
    },
    // The single-lane build: one continuous ring of text instead of four marquees, and four copies
    // that arrive together to form it. Same config surface again, same cue again — all three wrap
    // builds can be on the canvas at once, each `target`ed at a different board.
    'animation:stashOrPassWrapRing': {
        id: 'animation:stashOrPassWrapRing',
        kind: 'animation',
        label: 'Stash or Pass — wrap (single lane)',
        singleton: false,
        singletonGroup: 'animation:stashOrPassWrapRing',
        defaultBox: FULL_BOX,
        defaultPhases: [],
        preload: ['/fonts/Grechka SHA_0.otf'],
        component: StashOrPassRing,
        available: true,
        hasBox: false,
        reactsTo: ['stash_or_pass'],
    },
    text: {
        id: 'text',
        kind: 'text',
        label: 'Text box',
        // Several may be placed (obs-layout-plan.md §2.12) — like the wrap animations, each
        // instance gets its own group so `singleton: false` alone is what allows multiple copies.
        singleton: false,
        singletonGroup: 'text',
        defaultBox: TEXT_BOX,
        defaultPhases: ['selling'],
        preload: [],
        component: TextElement,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
}

export function registryIdOf(element: Element): RegistryId {
    switch (element.kind) {
        case 'board':
            return `board:${element.variant}` as RegistryId
        case 'widget':
            return `widget:${element.widget}` as RegistryId
        case 'results':
            return 'results'
        case 'resultsThin':
            return 'resultsThin'
        case 'cards':
            return 'cards'
        case 'ripbar':
            return 'ripbar'
        case 'reserved':
            return 'reserved'
        case 'frame':
            return `frame:${element.variant}` as RegistryId
        case 'animation':
            return `animation:${element.animation}` as RegistryId
        case 'text':
            return 'text'
        default: {
            const _exhaustive: never = element
            throw new Error(`registryIdOf: unhandled element ${JSON.stringify(_exhaustive)}`)
        }
    }
}

/** Narrows a registry id's suffix to a real AnimationId, refusing anything ANIMATION_IDS lacks. */
function toAnimationId(registryId: RegistryId): AnimationId {
    const suffix = registryId.split(':')[1]
    if (!(ANIMATION_IDS as readonly string[]).includes(suffix)) {
        throw new Error(
            `registry: "${registryId}" has no matching entry in ANIMATION_IDS (schema.ts) — ` +
                `add it there, or the config validator will reject every element built from it.`
        )
    }
    return suffix as AnimationId
}

export function makeElement(registryId: RegistryId): Element {
    const entry = REGISTRY[registryId]
    if (!entry) {
        throw new Error(`makeElement: unknown registry id "${registryId}"`)
    }

    // Frame is persistent by construction: it always gets a single `all` placement (never
    // per-phase entries) plus a default z that sits above the rest of the layout, and a default
    // `borders` (obs-layout-plan.md §2.5) — also via `all`, so a freshly-added frame is "same on
    // every stage" until the operator overrides one.
    if (entry.kind === 'frame') {
        return {
            kind: 'frame',
            variant: registryId.split(':')[1] as FrameVariant,
            placements: { all: { ...entry.defaultBox } },
            borders: { all: { ...DEFAULT_FRAME_BORDERS } },
            frameWidth: DEFAULT_FRAME_WIDTH,
            z: 10,
        }
    }

    // The wrap animation is "usually persistent" (obs-layout-plan.md §1.9) and, being boxless,
    // its `all` placement is really just "present in every stage" — the box itself is never
    // rendered from. `target`/`pad`/`bandThickness`/`speed`/`holdMs` are left unset so the
    // component's own defaults apply (see StashOrPassWrap.tsx's DEFAULT_* constants).
    if (entry.kind === 'animation') {
        return {
            kind: 'animation',
            // Validated, not cast. `as AnimationId` here is what let `stashOrPassWrapTl` and then
            // `stashOrPassWrapRing` ship with a registry entry but no entry in ANIMATION_IDS: the
            // cast asserted the id was valid, the runtime validator disagreed, and adding the
            // element failed with "invalid animation id". Throwing at construction turns that into
            // an immediate, obvious failure at the one place new variants are added.
            animation: toAnimationId(registryId),
            placements: { all: { ...entry.defaultBox } },
            z: 20,
        }
    }

    const placements: Partial<Record<Phase, Box>> = {}
    for (const phase of entry.defaultPhases) {
        placements[phase] = { ...entry.defaultBox }
    }
    switch (entry.kind) {
        case 'board':
            return { kind: 'board', variant: registryId.split(':')[1] as BoardVariant, placements }
        case 'widget':
            return { kind: 'widget', widget: registryId.split(':')[1] as WidgetId, placements }
        case 'results':
            return { kind: 'results', placements }
        case 'resultsThin':
            // columns/textSize/iconSize/sort left unset — the component's own defaults apply
            // (see ThinResults.tsx's DEFAULT_* constants), same convention as the wrap animation.
            return { kind: 'resultsThin', placements }
        case 'cards':
            return { kind: 'cards', placements }
        case 'ripbar':
            return { kind: 'ripbar', placements }
        case 'reserved':
            return { kind: 'reserved', placements }
        case 'text':
            // text/fontSize left unset — the component's own default applies (TextElement.tsx's
            // DEFAULT_FONT_SIZE), same convention as resultsThin's columns/textSize/iconSize/sort.
            return { kind: 'text', placements }
        default: {
            const _exhaustive: never = entry.kind
            throw new Error(`makeElement: unhandled kind ${JSON.stringify(_exhaustive)}`)
        }
    }
}
