// Registry table for the OBS layout system: every placeable element kind/variant/widget
// maps to one entry here (label, sizing defaults, allowed phases, and — for now — a
// placeholder component). See obs-layout-plan.md §1.2 and Phase 2 inventory.

import type { ComponentType } from 'react'
import { Placeholder } from './Placeholder'
import { FrameElement } from './elements/frame/FrameElement'
import { StashOrPassWrap } from './elements/animation/StashOrPassWrap'
import { StashOrPassTl } from './elements/animation/tl/StashOrPassTl'
import { StashOrPassRing } from './elements/animation/ring/StashOrPassRing'
import { StashOrPassQuarters } from './elements/animation/quarters/StashOrPassQuarters'
import { FlatBoard } from './elements/board-flat/FlatBoard'
import { ClassicBoard } from './elements/board-classic/ClassicBoard'
import { CobraBoard } from './elements/board-cobra/CobraBoard'
import { CobraFlatBoard } from './elements/board-cobra-flat/CobraFlatBoard'
import { SportStyleBoard } from './elements/board-sport-style/SportStyleBoard'
import { ResultsElement } from './elements/results/ResultsElement'
import { ThinResults } from './elements/results-thin/ThinResults'
import { CircleWidget } from './elements/circle/CircleWidget'
import { CardsElement } from './elements/cards/CardsElement'
import { TextElement } from './elements/text/TextElement'
import { ImageBoxElement } from './elements/image-box/ImageBoxElement'
import { PriceRangesElement } from './elements/price-ranges/PriceRangesElement'
import { PriceSignElement } from './elements/price-sign/PriceSignElement'
import { SceneElement } from './elements/scene/SceneElement'
import { SCENE_PRELOAD } from './elements/scene/assets'
import { SIGN_PRELOAD } from './elements/price-sign/assets'
import { TickerElement } from './elements/ticker/TickerElement'
import { TICKER_PRELOAD } from './elements/ticker/assets'
import { CameraShelfElement } from './elements/camera-shelf/CameraShelfElement'
import { SHELF_ASSETS, SHELF_PRELOAD } from './elements/camera-shelf/assets'
import { ObsToggleElement } from './elements/obs-toggle/ObsToggleElement'
import { mountObsToggle } from './elements/obs-toggle/mount'
import type { AnimationId, BoardVariant, Box, Element, ElementKind, FrameVariant, Phase, TickerSlot, WidgetId } from './schema'
import { ANIMATION_IDS, DEFAULT_FRAME_BORDERS, DEFAULT_FRAME_WIDTH, DEFAULT_SCENE_EFFECTS, DEFAULT_TICKER_SLOTS, WIDGET_IDS } from './schema'
import type { SceneEventName } from './sceneEvents'
import type { MountFn } from './stageHooks'
// `registryIdOf` moved to elementId.ts (obs-layout-adding-elements-plan.md §A.1) — that module has
// no runtime imports, so useLayoutData.tsx/needs.ts can call it without pulling in this file's
// whole element-component tree (the cycle it avoids: this file imports every element component,
// and those import useLayoutData). Re-exported here so every existing
// `import {registryIdOf} from '.../registry'` keeps resolving to the same function unchanged.
import { registryIdOf } from './elementId'
export { registryIdOf }

export type RegistryId =
    | 'board:flat'
    | 'board:classic'
    | 'board:cobra'
    | 'board:cobra_flat'
    | 'board:sport_style'
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
    | 'animation:stashOrPassSportStyle'
    | 'text'
    | 'image-box'
    | 'priceRanges'
    | 'priceSign'
    | 'scene'
    | 'ticker'
    | 'cameraShelf'
    | 'obsToggle'

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
    // results/cards/ripbar/reserved are one-each. Widgets, animations, text and BOARDS are not
    // singletons: a layout may hold several boards, of the same variant or of different ones, and
    // place them independently per stage. `singletonGroup` is the key used to enforce this and is
    // only ever consulted when `singleton` is true — entries that must not coexist share a group.
    singleton: boolean
    singletonGroup: string
    defaultBox: Box
    // Every entry allows every stage — with per-channel configurable stages (schema.ts's `Stage`)
    // a static list can no longer express which stages an element is placeable in, so there is no
    // `allowedPhases` any more (config.ts's `validatePlacements` accepts any of the config's own
    // stages, or 'all', for every registry entry). There is no `defaultPhases` either: the builder
    // always knows which stage the operator is adding to, and seeding a default stage on top of it
    // put every new element into `selling` as well as the stage it was added from.
    preload: string[]
    component: ComponentType<ElementProps>
    // false = schema-ready but not offered by the builder.
    available: boolean
    // Boxless elements (obs-layout-plan.md §1.9): the layout mounts them in a full-canvas,
    // non-clipping frame and they position their own content (typically via useResolvedBox() —
    // see resolvedBoxes.tsx); controls hides their x/y/w/h inputs (Layer stays). Default true —
    // only frame:static opts out so far.
    hasBox: boolean
    // Boxed elements are clipped to their box by ElementFrame. `unclipped: true` keeps the box
    // (position/size, box editor) but lets content draw outside it — the element is then
    // responsible for clipping whatever it doesn't want to spill (`cards` clips its own list mode
    // and lets only the carousel's side cards overhang the box edges).
    unclipped?: boolean
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
    // Anchor NAMES this element type publishes (board-anchors-plan.md §3), in the order the
    // "Attach to" select (controls/elements/StashOrPassWrapSettings.tsx) should list them. Absent
    // (or empty) means "no anchors" — the select is hidden and a wrap animation targeting this
    // element always uses its plain box. [convention]: nothing checks that the component actually
    // publishes these via `usePublishAnchors` (anchors.tsx) — a stale/wrong name here just means the
    // runtime falls back to the box at render time (useTargetShape), never a build/type error.
    anchors?: readonly string[]
    // Stage-hook mount function (obs-camera-shelf-plan.md §5): runs on the CONTROLS page only
    // (controls/useStageHooks.ts is the runner), letting an element type subscribe to
    // stageOut/stageIn events without storing anything in the config. Absent means "this element
    // type subscribes to nothing" — most entries leave it unset.
    mount?: MountFn
}

function widgetDefaultBox(index: number): Box {
    // 240x240 cells along the bottom of the 1080x1920 canvas. The count cells (boxesLeft /
    // chasersLeft) use this too rather than a rectangle of their own — they are the same kind of
    // readout as the circle widgets and are expected to line up with them.
    return { x: 20 + index * 250, y: 1920 - 240 - 40, w: 240, h: 240 }
}

const BOARD_BOX: Box = { x: 0, y: 300, w: 1080, h: 1300 }
// cobra_flat is a wide strip of square cells (11 columns), not a portrait board: a 32-team break
// at 11 columns is 3 rows of squares, about 1080x320 including padding, so BOARD_BOX's 1080x1300
// portrait footprint would sit two-thirds empty (cobra-flat-board-plan.md §4). Purely a starting
// point — the operator resizes it in the builder like any other box.
const COBRA_FLAT_BOX: Box = { x: 0, y: 300, w: 1080, h: 340 }
// classic is a 10-column grid of square team tiles plus an 8-cell centre block: 32 teams + 8
// reserved cells = 40 cells / 10 cols = 4 rows of squares — at REF_W (ClassicBoard.tsx, 810) that's
// roughly 2.1:1, landscape (obs-layout-plan.md §2.10.4). BOARD_BOX is 1080x1300 (0.83:1, portrait)
// and would leave two-thirds of the box empty, same reasoning as COBRA_FLAT_BOX above.
const CLASSIC_BOX: Box = { x: 0, y: 620, w: 1080, h: 560 }
// sport-style-board-plan.md §2: 10 cols of a 1080-wide box gives 96px cells (edgeGap 60 each side);
// 4 rows of 96px cells plus 2*60px edge gap = 504, rounded up to 520 for a little slack. Purely a
// starting point — height/cell-size are derived from box width + cols (§4.2), so the operator only
// ever tunes the box's width and the Cells-per-row setting; the Fit height button (§5) resizes the
// box to whatever the current break's slot count actually needs.
const SPORT_STYLE_BOX: Box = { x: 0, y: 300, w: 1080, h: 520 }
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
// Centred square — an image box has no natural home on the canvas (it is whatever the operator
// wants to show), so it spawns where it is easiest to see and gets moved from there.
const IMAGE_BOX: Box = { x: 300, y: 720, w: 480, h: 480 }
// Same starting corner as TEXT_BOX (the one gap the other defaults leave clear, see that comment)
// but taller — a price-ranges list is a handful of stacked lines, not one line of copy.
const PRICE_RANGES_BOX: Box = { x: 40, y: 130, w: 560, h: 400 }
// obs-price-sign-plan.md §3: right edge flush with the 1080 canvas so the wall bracket/plate reads
// as actually mounted on the edge rather than floating mid-canvas. h: 1000 (revised 2026-09-21,
// was 700) — the assembled sign (bracket + chains + board) needs roughly 920px at this width with
// a typical 4-row board and the default chainLength (120); see PriceSignElement.tsx's header
// comment for the derivation.
const PRICE_SIGN_BOX: Box = { x: 300, y: 120, w: 780, h: 1000 }
// obs-scene-element-plan.md §1.1: the stage is the box itself, no reference aspect assumed — this
// is a starting point only (roughly the "upper third" the plan's intro describes replacing), same
// as every other registry default box; the operator resizes it in the builder like any other.
const SCENE_BOX: Box = { x: 0, y: 0, w: 1080, h: 640 }
// obs-ticker-plan.md §4: full canvas width, texture aspect (361 = 1080 * 725 / 2170) — same
// starting-point convention as every other registry default box; the operator resizes/repositions
// it in the builder like anything else.
const TICKER_BOX: Box = { x: 0, y: 1500, w: 1080, h: 361 }
// obs-camera-shelf-plan.md §4: bottom third of the canvas, matching the reference cabinet
// (`layout_ver2.png`'s "CURRENT BREAK" shelf) — a wide, shallow strip near the bottom edge rather
// than a portrait box. `h` matches the whole cabinet art's own aspect at this width, same formula
// as the settings panel's Fit height button.
const SHELF_BOX: Box = { x: 40, y: 1240, w: 1000, h: Math.round((SHELF_ASSETS.shelf.h * 1000) / SHELF_ASSETS.shelf.w) }

export const REGISTRY: Record<RegistryId, RegistryEntry> = {
    'board:flat': {
        id: 'board:flat',
        kind: 'board',
        label: 'Board — Flat',
        // Not a singleton: several boards may coexist (obs/controls — any number, any mix of
        // variants), so each variant gets its own group and `singleton: false` is what allows it.
        singleton: false,
        singletonGroup: 'board:flat',
        defaultBox: BOARD_BOX,
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
        // Not a singleton: several boards may coexist (obs/controls — any number, any mix of
        // variants), so each variant gets its own group and `singleton: false` is what allows it.
        singleton: false,
        singletonGroup: 'board:classic',
        defaultBox: CLASSIC_BOX,
        // Just the static board background + the mount_golden.png overlay — the per-team PNGs
        // (x2 for the sold " BW" variant) are combinatorial and not worth eagerly preloading here,
        // same call as board:flat's manifest-resolved skins (obs-layout-plan.md §2.10.7).
        preload: ['/images/board.png', '/images/mount_golden.png'],
        component: ClassicBoard,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'board:cobra': {
        id: 'board:cobra',
        kind: 'board',
        label: 'Board — Cobra',
        // Not a singleton: several boards may coexist (obs/controls — any number, any mix of
        // variants), so each variant gets its own group and `singleton: false` is what allows it.
        singleton: false,
        singletonGroup: 'board:cobra',
        defaultBox: BOARD_BOX,
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
    'board:cobra_flat': {
        id: 'board:cobra_flat',
        kind: 'board',
        label: 'Board — Cobra Flat',
        // Not a singleton: several boards may coexist, so each variant gets its own group and
        // `singleton: false` is what allows it — same convention as every other board entry.
        singleton: false,
        singletonGroup: 'board:cobra_flat',
        defaultBox: COBRA_FLAT_BOX,
        // Logos are per team, resolved at render time from /images/new_teams/ — nothing to
        // eagerly preload (same reasoning as `board:cobra`).
        preload: [],
        component: CobraFlatBoard,
        available: true,
        hasBox: true,
        // Shares CobraBoardSettings with `board:cobra` (ElementSettings.tsx) — the tier thresholds
        // are channel-wide and are the only setting this board reads, so it needs the same wide
        // column the price-ranges table/preset list require.
        wideBlock: true,
        // cobra-flat-board-plan.md §6 asks for `reactsTo: ['sold']`, mirroring board-flat/results.
        // `sold` is no longer a member of SceneEventName (sceneEvents.ts: removed from the
        // vocabulary "on request"), and board-flat/results/resultsThin all import `useSceneEvent`
        // but never call it — that wiring is already dead in every board this was meant to copy.
        // Left `[]`, matching what those entries actually declare; see CobraFlatBoard.tsx's header
        // for the full note. The board still catches up within one events poll (5s) of a sale.
        reactsTo: [],
    },
    'board:sport_style': {
        id: 'board:sport_style',
        kind: 'board',
        label: 'Board — Sport style',
        // Not a singleton: several boards may coexist, same convention as every other board entry.
        singleton: false,
        singletonGroup: 'board:sport_style',
        defaultBox: SPORT_STYLE_BOX,
        // Turf/patch are opaque JSON pasted by the operator (schema.ts) — nothing to preload here;
        // team logos resolve at render time from /images/teams/ like every other patch-based board.
        preload: [],
        component: SportStyleBoard,
        available: true,
        hasBox: true,
        // The settings panel carries the Cells-per-row/Slots/Fit-height controls plus two JSON
        // textareas (turf recipe, patch style) — same reasoning as `cards`/`board:cobra`: a narrow
        // column would squash the textareas.
        wideBlock: true,
        reactsTo: [],
        // board-anchors-plan.md §3.3/§3.5: the painted (clipped) turf area, and the cell grid alone
        // — see SportStyleBoard.tsx's `usePublishAnchors` call for what each one resolves to.
        anchors: ['field', 'grid'],
    },
    'widget:pick2': {
        id: 'widget:pick2',
        kind: 'widget',
        label: 'Widget — Pick 2',
        singleton: false,
        singletonGroup: 'widget:pick2',
        defaultBox: widgetDefaultBox(0),
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
        preload: [],
        component: CardsElement,
        available: true,
        hasBox: true,
        unclipped: true,
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
        preload: ['/fonts/Grechka SHA_0.otf'],
        component: StashOrPassRing,
        available: true,
        hasBox: false,
        reactsTo: ['stash_or_pass'],
    },
    // Fourth stash-or-pass build (stash-or-pass-quarters-plan.md): four blue/white quarter-lanes
    // that grow from the side midpoints instead of copies flying in, but the same continuous-ring
    // text and cue/config surface as `stashOrPassWrapRing`. All four wrap builds can be placed at
    // once, each `target`ed at a different board.
    'animation:stashOrPassSportStyle': {
        id: 'animation:stashOrPassSportStyle',
        kind: 'animation',
        label: 'Stash or Pass — sport style',
        singleton: false,
        singletonGroup: 'animation:stashOrPassSportStyle',
        defaultBox: FULL_BOX,
        preload: ['/fonts/Grechka SHA_0.otf'],
        component: StashOrPassQuarters,
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
        preload: [],
        component: TextElement,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    'image-box': {
        id: 'image-box',
        kind: 'imageBox',
        label: 'Image',
        // Several may be placed — each instance holds its own uploaded image.
        singleton: false,
        singletonGroup: 'image-box',
        defaultBox: IMAGE_BOX,
        // Empty: the image URL is per element, not a static registry-level asset, so it can't be
        // listed here. The layout page's mount-time preload instead walks `config.elements` itself
        // and preloads every `imageBox`'s `url` — see `[id]/page.tsx`.
        preload: [],
        component: ImageBoxElement,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    priceRanges: {
        id: 'priceRanges',
        kind: 'priceRanges',
        label: 'Price ranges',
        // The data is per-series, so a second copy would just show the same list twice — one copy
        // per config, like `results`/`cards`.
        singleton: true,
        singletonGroup: 'priceRanges',
        defaultBox: PRICE_RANGES_BOX,
        preload: [],
        component: PriceRangesElement,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    priceSign: {
        id: 'priceSign',
        kind: 'priceSign',
        label: 'Price sign',
        // Own group, separate from `priceRanges` (own singleton group too) — obs-price-sign-plan.md
        // §3: a different skin over the same series data, so the two may coexist on one canvas.
        singleton: true,
        singletonGroup: 'priceSign',
        defaultBox: PRICE_SIGN_BOX,
        preload: SIGN_PRELOAD,
        component: PriceSignElement,
        available: true,
        hasBox: true,
        reactsTo: [],
    },
    scene: {
        id: 'scene',
        kind: 'scene',
        label: 'Scene',
        // One living background per config, like `results`/`cards`/`priceRanges` — there's no use
        // case for two stacked on the same canvas.
        singleton: true,
        singletonGroup: 'scene',
        defaultBox: SCENE_BOX,
        preload: SCENE_PRELOAD,
        component: SceneElement,
        available: true,
        hasBox: true,
        // obs-scene-element-plan.md §5: 'storm' latches rain + ambient lightning on (via
        // SceneElement.tsx's storm-override, read through the same `useEventActive` context
        // StashOrPassWrap.tsx uses); 'thunder' is a momentary single strike, relayed to the
        // lightning effect as a `strike` SceneCue.
        reactsTo: ['storm', 'thunder'],
    },
    ticker: {
        id: 'ticker',
        kind: 'ticker',
        label: 'Ticker (curved LED)',
        // Not a singleton (obs-ticker-plan.md §4): an operator may want one at the top and one at
        // the bottom of the canvas, so each instance gets its own group and `singleton: false`
        // alone is what allows multiple copies — same convention as `text`/the wrap animations.
        singleton: false,
        singletonGroup: 'ticker',
        defaultBox: TICKER_BOX,
        preload: TICKER_PRELOAD,
        component: TickerElement,
        available: true,
        hasBox: true,
        // The settings panel mounts all six widgets' own settings panels (Pick2Settings,
        // StashOrPassSettings, NameSettings, BoxesPerBreakSettings, CountSettings) plus its own
        // line/slot controls — same reasoning as `cards`/`board:cobra`/`scene`: a narrow column
        // would squash it.
        wideBlock: true,
        reactsTo: [],
    },
    cameraShelf: {
        id: 'cameraShelf',
        kind: 'cameraShelf',
        label: 'Camera shelf',
        // Not a singleton (obs-camera-shelf-plan.md): "CURRENT BREAK" and a second, differently
        // -bound shelf (e.g. "WHOLE SHOW") are two instances, so each gets its own group and
        // `singleton: false` alone is what allows multiple copies — same convention as `text`/the
        // wrap animations.
        singleton: false,
        singletonGroup: 'cameraShelf',
        defaultBox: SHELF_BOX,
        preload: SHELF_PRELOAD,
        component: CameraShelfElement,
        available: true,
        hasBox: true,
        reactsTo: [],
        // OBS enable/disable moved to the `obsToggle` element (obs-visibility-toggle-plan.md §11):
        // this entry no longer declares a `mount`.
    },
    obsToggle: {
        id: 'obsToggle',
        kind: 'obsToggle',
        label: 'OBS visibility',
        // Not a singleton: an operator may want several independent lists of sources bound to
        // different stages, so each instance gets its own group and `singleton: false` alone is
        // what allows multiple copies — same convention as `text`/the wrap animations.
        singleton: false,
        singletonGroup: 'obsToggle',
        defaultBox: FULL_BOX, // irrelevant: boxless
        preload: [],
        component: ObsToggleElement,
        available: true,
        // Boxless (obs-visibility-toggle-plan.md): it renders nothing, it only carries `sources`
        // for its stage hook (mount.ts).
        hasBox: false,
        reactsTo: [],
        // obs-visibility-toggle-plan.md §11: `obsToggle` is now the ONE registry entry with a
        // `mount` — see stageHooks.ts/controls/useStageHooks.ts for the mechanism.
        mount: mountObsToggle,
    },
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

    // Deliberately EMPTY. The caller (controls' ElementsPanel) decides the placement — "this
    // stage" or "all stages" — and assigns it immediately. Seeding a default stage here meant an
    // element added while on a custom stage landed in that stage AND in the seeded one.
    const placements: Partial<Record<Phase, Box>> = {}
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
        case 'imageBox':
            // url/fit left unset — the operator uploads an image in ImageBoxSettings, and the
            // element applies 'contain' until `fit` is chosen (ImageBoxElement.tsx DEFAULT_IMAGE_FIT).
            return { kind: 'imageBox', placements }
        case 'priceRanges':
            // labelFontSize/badgeFontSize left unset — the component's own defaults apply
            // (PriceRangesElement.tsx's DEFAULT_LABEL_FONT_SIZE/DEFAULT_BADGE_FONT_SIZE), same
            // convention as `text`'s fontSize above. The ranges themselves are series data, not
            // layout config, so there is nothing else to seed here.
            return { kind: 'priceRanges', placements }
        case 'priceSign':
            // labelFontSize/badgeFontSize/boardWidthPct/chainLength/windStrength all left unset —
            // the component's own DEFAULT_* constants apply (PriceSignElement.tsx), same
            // convention as `priceRanges` above.
            return { kind: 'priceSign', placements }
        case 'scene':
            // Unlike text/imageBox's "leave it unset, the component's own default applies"
            // convention, `effects` is a REQUIRED array (schema.ts's Element union) — there is no
            // single sane "unset" for a list of independently-toggled layers, so a freshly-added
            // scene is seeded with its own copy of DEFAULT_SCENE_EFFECTS. `quality` is left unset
            // (SceneElement.tsx's own default, 'full', applies).
            return { kind: 'scene', placements, effects: DEFAULT_SCENE_EFFECTS.map((e) => ({ ...e })) }
        case 'ticker':
            // `slots` is REQUIRED (schema.ts, same reasoning as `scene.effects` above) — a
            // freshly-added ticker is seeded with its own copy of DEFAULT_TICKER_SLOTS (all six
            // widgets enabled, no label/colour overrides). separator/fontSize/speed/direction are
            // left unset — TickerElement.tsx's own DEFAULT_* constants apply.
            return {
                kind: 'ticker',
                placements,
                slots: Object.fromEntries(WIDGET_IDS.map((id) => [id, { ...DEFAULT_TICKER_SLOTS[id] }])) as Record<
                    WidgetId,
                    TickerSlot
                >,
            }
        case 'cameraShelf':
            // label/labelFontSize/glare/glareOpacity all left unset — the component's own
            // DEFAULT_* constants apply (CameraShelfElement.tsx), same convention as
            // `priceSign`/`text` above.
            return { kind: 'cameraShelf', placements }
        case 'obsToggle':
            // sources left unset — the caller (controls' ElementsPanel/ObsToggleSettings) adds
            // entries after placement, same "empty until edited" convention as `text`/`imageBox`.
            return { kind: 'obsToggle', placements }
        default: {
            const _exhaustive: never = entry.kind
            throw new Error(`makeElement: unhandled kind ${JSON.stringify(_exhaustive)}`)
        }
    }
}
