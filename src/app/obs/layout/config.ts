// Validation and derivation helpers for LayoutConfig / OverlayState.
// Backend does not validate JSON shape (obs-layout-plan.md §1.1) — the frontend owns the schema,
// so everything that touches a config/state coming off the network must go through `migrateConfig`
// / `migrateState` and then `validateConfig` / `validateState` before it is trusted.

import type { Box, Cue, DurableCue, Element, ElementKind, LayoutConfig, OverlayState, Phase, PlacementKey, SceneEffectId, Sides, Stage, TransientCue } from './schema'
import {
    ANIMATION_IDS,
    BOARD_VARIANTS,
    BUILT_IN_STAGES,
    CANVAS,
    DEFAULT_FRAME_BORDERS,
    DEFAULT_FRAME_WIDTH,
    DEFAULT_SCENE_EFFECTS,
    DEFAULT_STAGES,
    FRAME_VARIANTS,
    IMAGE_FITS,
    MAX_TEXT_LENGTH,
    RESULTS_SORTS,
    SCENE_EFFECT_IDS,
    SCENE_QUALITIES,
    SKY_MOODS,
    TICKER_DIRECTIONS,
    WIDGET_IDS, MIRRORABLE_KINDS} from './schema'
import type { RegistryId } from './registry'
import { REGISTRY, registryIdOf } from './registry'
import type { SceneEventName } from './sceneEvents'
import { isSceneEventName } from './sceneEvents'
import { isBackendFailure } from '@/app/lib/backend'

export function defaultConfig(): LayoutConfig {
    return {
        version: 1,
        canvas: { ...CANVAS },
        stages: DEFAULT_STAGES.map((s) => ({ ...s })),
        elements: {},
        obsBindings: { useTransition: false },
    }
}

export function defaultState(): OverlayState {
    return { phase: 'selling' }
}

// What the obs/layout page's 60s reconcile poll (and anything else polling layout_config_get)
// should DO with one response, decided as a pure function so it can be exercised without a
// browser (obs-layout-disappearing-elements-findings.md fix #1). The bug this replaces: every
// FAILURE of the request (a backend 500, a network drop, a non-JSON body — see `isBackendFailure`
// in lib/backend.ts) resolves to the same "no `.config`" shape as a genuine "no row for this
// channel yet" response, and both used to fall back to `defaultConfig()` — wiping a live config
// to zero elements on a mere backend hiccup. The four outcomes:
//   'failed'  — the request itself failed (isBackendFailure). Keep `current` — a failed poll must
//               be a no-op, never a reset.
//   'no-row'  — the request succeeded and genuinely returned `{config: null}`: this channel has
//               no config row yet, which IS real information. `defaultConfig()`.
//   'invalid' — the request succeeded but the payload doesn't pass validateConfig (corrupt row /
//               schema drift). Keep `current` rather than blanking a working layout over a bad
//               write — same reasoning as 'failed'.
//   'ok'      — a genuine, valid config. Use it.
export function reconcileConfigResponse(
    resp: unknown,
    current: LayoutConfig
): { config: LayoutConfig; reason: 'failed' | 'no-row' | 'invalid' | 'ok' } {
    if (isBackendFailure(resp)) {
        return { config: current, reason: 'failed' }
    }
    const rawConfig = (resp as { config?: unknown } | null | undefined)?.config ?? null
    if (rawConfig === null) {
        return { config: defaultConfig(), reason: 'no-row' }
    }
    const result = validateConfig(migrateConfig(rawConfig))
    if (!result.ok) {
        console.error('[obs/layout] invalid config from backend, keeping current config', result.errors)
        return { config: current, reason: 'invalid' }
    }
    return { config: result.config, reason: 'ok' }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v)
}

// Validated against ONE config's `stages` (there is no global stage list any more) — every caller
// below has that config's stages in scope already, since stages are validated before anything that
// needs to check a phase against them (see `validateConfig`'s ordering).
function isPhase(v: unknown, stages: Stage[]): v is Phase {
    return typeof v === 'string' && stages.some((s) => s.id === v)
}

function isPlacementKey(v: unknown, stages: Stage[]): v is PlacementKey {
    return v === 'all' || isPhase(v, stages)
}

function isBox(v: unknown): v is Box {
    if (!isPlainObject(v)) return false
    return (
        isFiniteNumber(v.x) &&
        isFiniteNumber(v.y) &&
        isFiniteNumber(v.w) &&
        isFiniteNumber(v.h) &&
        v.w > 0 &&
        v.h > 0
    )
}

// `frame.borders` values (obs-layout-plan.md §2.5): four independent px widths, all >= 0 (a side
// may be 0 — "draws nothing" is a valid, common setting, unlike a Box's w/h which must be > 0).
// They are how far the frame's plain black fill reaches in from each screen edge.
function isSides(v: unknown): v is Sides {
    if (!isPlainObject(v)) return false
    return (
        isFiniteNumber(v.top) &&
        v.top >= 0 &&
        isFiniteNumber(v.right) &&
        v.right >= 0 &&
        isFiniteNumber(v.bottom) &&
        v.bottom >= 0 &&
        isFiniteNumber(v.left) &&
        v.left >= 0
    )
}

// ---- migrations -------------------------------------------------------------------------------
// `transition` was removed as a Phase in v2 (obs-layout-plan.md §1.7) — it is now purely a
// controls-side action, never something the layout is told about. The standalone `effect`
// element kind was removed in v3 (§1.9), superseded by scene events + boxless elements — any
// stored `effect` element is simply dropped. The `frame` element's old `image` field was dropped
// in favour of `borders` (§2.5) — an existing `frame:static` element just keeps its `placements`
// and `z` and starts rendering the generated frame (registry default borders) from then on. All of
// this is pure, tolerant of already-migrated (or malformed) input, and idempotent — safe to call
// unconditionally before validation, every time a config/state is read from the backend or the bus.

// `scene.y` default per effect id (schema.ts's DEFAULT_SCENE_EFFECTS) — `clouds` has two different
// defaults depending on `layer`, everything else has one. Used by `sanitizeSceneEffects` below to
// fill a missing `y` rather than fail validation (obs-scene-element-plan.md §2.2).
function sceneEffectDefaultY(id: string, layer: unknown): number {
    if (id === 'clouds') {
        const match = DEFAULT_SCENE_EFFECTS.find((d) => d.id === 'clouds' && d.layer === layer)
        if (match && 'y' in match) return match.y
    }
    const fallback = DEFAULT_SCENE_EFFECTS.find((d) => d.id === id)
    return fallback && 'y' in fallback ? fallback.y : 0
}

// `scene.effects` sanitization (obs-scene-element-plan.md §2.2) — same "strip what's no longer
// recognized rather than reject the whole config" policy as the `reactions`/`sold`&`pick2` handling
// below: an unknown effect id (from a newer build, or one since retired) is dropped, not rejected,
// and an art-layer effect missing its own `y` gets that effect's own default rather than failing
// validateConfig's per-kind check. If nothing usable is left after filtering, the whole array falls
// back to DEFAULT_SCENE_EFFECTS — a `scene` element with an empty `effects` array would otherwise
// render nothing rather than falling back to a sane default, which is exactly the "fallback to
// empty CONFIG" failure mode this whole strip-don't-reject policy exists to avoid at the element
// level. Lives in `migrateConfig` (not in `KIND_VALIDATORS.scene`, config.ts's per-kind validator
// below) for the same reason the `reactions` strip above does: this MUTATES the stored shape into
// something valid, which a `KindValidator` — which only ever validates the raw element it's handed,
// never rewrites it, see `validateConfig`'s `elements[key] = rawEl as Element` — has no mechanism
// to do; `validateSceneKind` below trusts that by the time it runs, migration has already made
// `effects` conform.

// Effect ids that were appended after iteration 1 (obs-scene-element-plan.md §5's `rain`/
// `lightning`) — a stored `effects` array that predates them just gets the disabled default
// APPENDED (not the whole array substituted), so an operator's tuned sky/mountain/clouds settings
// survive the upgrade. Kept as its own list (rather than "every id not in some iteration-1 set")
// so a future iteration's append-on-load ids are as explicit as this one.
const SCENE_EFFECT_IDS_APPENDED_IN_ITERATION_2: readonly SceneEffectId[] = ['rain', 'lightning']

// Same append-if-missing upgrade, one iteration later (obs-scene-element-plan.md §6's `birds`) — a
// stored `effects` array that predates iteration 3 gets the enabled default appended.
const SCENE_EFFECT_IDS_APPENDED_IN_ITERATION_3: readonly SceneEffectId[] = ['birds']

function sanitizeSceneEffects(rawEffects: unknown): { effects: unknown[]; changed: boolean } {
    if (!Array.isArray(rawEffects)) {
        return { effects: DEFAULT_SCENE_EFFECTS.map((e) => ({ ...e })), changed: true }
    }

    let changed = false
    const kept: unknown[] = []
    for (const raw of rawEffects) {
        if (!isPlainObject(raw) || typeof raw.id !== 'string' || !(SCENE_EFFECT_IDS as readonly string[]).includes(raw.id)) {
            changed = true
            continue
        }
        if ((raw.id === 'mountain' || raw.id === 'clouds') && raw.y === undefined) {
            kept.push({ ...raw, y: sceneEffectDefaultY(raw.id, raw.layer) })
            changed = true
            continue
        }
        // A `lightning` entry's `ambientIntervalSec` must be `null` or an integer in [1, 600]
        // (validateSceneEffect below). Unlike the missing-`y` case above, this can arrive not just
        // missing but genuinely malformed (NaN, a string, 0, out of range) — e.g. a value that was
        // `undefined` in memory and silently dropped by a JSON round-trip on the way to/from the
        // backend, or an out-of-range leftover from before the settings panel clamped its slider.
        // Same drop-don't-reject policy as the rest of this function: coerce to `null` ("cue only")
        // rather than letting one bad stored field reject the WHOLE config (this is the fix for the
        // "invalid config in payload ... ambientIntervalSec must be null or a number in [1, 600]"
        // failure mode — see obs-scene-element-plan.md §5 and SceneSettings.tsx's lightning row).
        if (raw.id === 'lightning' && raw.ambientIntervalSec !== null) {
            const v = raw.ambientIntervalSec
            if (!isFiniteNumber(v) || v < 1 || v > 600) {
                kept.push({ ...raw, ambientIntervalSec: null })
                changed = true
                continue
            }
        }
        // Legacy birds shape (single `count`, iteration 3 as first shipped) → `countMin`/`countMax`
        // both equal to it, so an existing config keeps its exact flock size until edited.
        if (raw.id === 'birds' && raw.countMin === undefined && raw.countMax === undefined) {
            const { count, ...rest } = raw
            const n = isFiniteNumber(count) && Number.isInteger(count) && count >= 1 && count <= 12 ? count : 3
            kept.push({ ...rest, countMin: n, countMax: n })
            changed = true
            continue
        }
        kept.push(raw)
    }

    if (kept.length === 0) {
        return { effects: DEFAULT_SCENE_EFFECTS.map((e) => ({ ...e })), changed: true }
    }

    // Append-if-missing upgrade (obs-scene-element-plan.md §5/§6): run only once something usable
    // is already left in `kept` — an entirely-unknown/empty array already fell back to the FULL
    // defaults above, which already include rain/lightning/birds.
    for (const id of [...SCENE_EFFECT_IDS_APPENDED_IN_ITERATION_2, ...SCENE_EFFECT_IDS_APPENDED_IN_ITERATION_3]) {
        const present = kept.some((e) => isPlainObject(e) && e.id === id)
        if (!present) {
            const fallback = DEFAULT_SCENE_EFFECTS.find((d) => d.id === id)
            if (fallback) {
                kept.push({ ...fallback })
                changed = true
            }
        }
    }

    return { effects: kept, changed }
}

export function migrateConfig(raw: unknown): unknown {
    if (!isPlainObject(raw)) return raw

    let out: Record<string, unknown> = raw
    let changed = false

    // `stages` is new — any config stored before it existed gets the three built-ins, so it keeps
    // validating and working exactly as it did (every existing element's placements were already
    // keyed by one of these three).
    if (out.stages === undefined) {
        out = { ...out, stages: BUILT_IN_STAGES.map((s) => ({ ...s })) }
        changed = true
    }

    const elementsRaw = out.elements
    if (!isPlainObject(elementsRaw)) return changed ? out : raw

    const migratedElements: Record<string, unknown> = {}
    for (const [key, elRaw] of Object.entries(elementsRaw)) {
        if (!isPlainObject(elRaw)) {
            migratedElements[key] = elRaw
            continue
        }
        if (elRaw.kind === 'effect') {
            changed = true
            continue
        }

        let el: Record<string, unknown> = elRaw
        if (el.kind === 'frame' && 'image' in el) {
            const rest = { ...el }
            delete rest.image
            el = rest
            changed = true
        }

        // The old single `widget:count` id was split into `boxesLeft`/`chasersLeft`
        // (obs-layout-plan.md §2.7) — a stored `count` becomes `chasersLeft` so existing configs
        // keep validating; the operator adds the boxes cell alongside it if they want both (the
        // old page rendered both in one element, which the layout cannot express as one box).
        if (el.kind === 'widget' && el.widget === 'count') {
            el = { ...el, widget: 'chasersLeft' }
            changed = true
        }

        // Scene events can be retired from the vocabulary (`sold` and `pick2` were), and the
        // validator rejects a `reactions` key naming one that no longer exists — which would fail
        // the WHOLE config and drop the operator back to an empty default layout. Strip them.
        const reactionsRaw = el.reactions
        if (isPlainObject(reactionsRaw)) {
            const kept = Object.fromEntries(
                Object.entries(reactionsRaw).filter(([name]) => isSceneEventName(name))
            )
            if (Object.keys(kept).length !== Object.keys(reactionsRaw).length) {
                el = { ...el, reactions: kept }
                changed = true
            }
        }

        // `scene.effects` (obs-scene-element-plan.md §2.2) — see sanitizeSceneEffects' own comment
        // for why this lives here rather than in KIND_VALIDATORS.scene below.
        if (el.kind === 'scene') {
            const sanitized = sanitizeSceneEffects(el.effects)
            if (sanitized.changed) {
                el = { ...el, effects: sanitized.effects }
                changed = true
            }
        }

        const placementsRaw = el.placements
        if (isPlainObject(placementsRaw) && 'transition' in placementsRaw) {
            const rest = { ...placementsRaw }
            delete rest.transition
            migratedElements[key] = { ...el, placements: rest }
            changed = true
        } else {
            migratedElements[key] = el
        }
    }

    if (!changed) return raw
    return { ...out, elements: migratedElements }
}

export function migrateState(raw: unknown): unknown {
    if (!isPlainObject(raw)) return raw

    let out: Record<string, unknown> = raw
    let changed = false

    if (out.phase === 'transition') {
        out = { ...out, phase: 'selling' }
        changed = true
    }

    // Same reasoning as the `reactions` strip in migrateConfig: a latched event that has since been
    // removed from the vocabulary would fail validateState and reset the live state.
    const activeRaw = out.active
    if (isPlainObject(activeRaw)) {
        const kept = Object.fromEntries(
            Object.entries(activeRaw).filter(([name]) => isSceneEventName(name))
        )
        if (Object.keys(kept).length !== Object.keys(activeRaw).length) {
            out = { ...out, active: kept }
            changed = true
        }
    }

    return changed ? out : raw
}

// Aliased straight from schema.ts rather than re-listed here. These used to be a second,
// hand-maintained copy of the same literals, and the two drifted: `stashOrPassWrapTl` was added to
// the AnimationId union and the registry but not to this array, so adding that element produced
// `invalid animation id "stashOrPassWrapTl"` — the type said yes and the validator said no. The
// union is now derived FROM the array, so a new id can only be added in one place.
const VALID_BOARD_VARIANTS = BOARD_VARIANTS
const VALID_WIDGET_IDS = WIDGET_IDS
const VALID_FRAME_VARIANTS = FRAME_VARIANTS
const VALID_ANIMATION_IDS = ANIMATION_IDS
const VALID_RESULTS_SORTS = RESULTS_SORTS

function validatePlacements(key: string, placementsRaw: unknown, regId: RegistryId, stages: Stage[]): string[] {
    const errors: string[] = []
    if (placementsRaw === undefined) return errors
    if (!isPlainObject(placementsRaw)) {
        return [`element "${key}": placements must be an object`]
    }
    const entry = REGISTRY[regId]
    if (!entry) {
        errors.push(`element "${key}": unknown registry ID "${regId}"`)
        return errors
    }
    // Every registry entry allows every stage (there is no more per-type `allowedPhases` — see
    // registry.ts) — a placement is invalid only if its key isn't 'all' or one of THIS config's
    // stages.
    for (const [phase, box] of Object.entries(placementsRaw)) {
        if (!isPlacementKey(phase, stages)) {
            errors.push(`element "${key}": invalid phase "${phase}" in placements`)
            continue
        }
        if (!isBox(box)) {
            errors.push(`element "${key}": placement for phase "${phase}" is not a valid box`)
        }
    }
    return errors
}

function validateZ(key: string, rawEl: Record<string, unknown>): string[] {
    if (rawEl.z === undefined) return []
    if (!isFiniteNumber(rawEl.z)) {
        return [`element "${key}": z must be a finite number`]
    }
    return []
}

// `reactions` (obs-layout-plan.md §1.9): a per-element opt-out map, keyed by scene event name,
// values must be boolean. Unknown event names are rejected rather than silently ignored.
function validateReactions(key: string, rawEl: Record<string, unknown>): string[] {
    if (rawEl.reactions === undefined) return []
    if (!isPlainObject(rawEl.reactions)) {
        return [`element "${key}": reactions must be an object`]
    }
    const errors: string[] = []
    for (const [name, value] of Object.entries(rawEl.reactions)) {
        if (!isSceneEventName(name)) {
            errors.push(`element "${key}": unknown scene event "${name}" in reactions`)
            continue
        }
        if (typeof value !== 'boolean') {
            errors.push(`element "${key}": reactions["${name}"] must be a boolean`)
        }
    }
    return errors
}

// `frame.frameWidth` validation: a single px thickness for the gradient frame, >= 0 (0 = no frame,
// just the black fill), and not per-stage — unlike `borders` above.
function validateFrameWidth(key: string, raw: unknown): string[] {
    if (raw === undefined) return []
    if (!isFiniteNumber(raw) || raw < 0) {
        return [`element "${key}": frameWidth must be a number >= 0`]
    }
    return []
}

// `frame.borders` validation (obs-layout-plan.md §2.5): keyed by the same `PlacementKey` vocabulary
// as `placements` (a real phase, or `all`), each value a `Sides` of four finite numbers >= 0.
// Mirrors `validatePlacements` in shape but there is no `allowedPhases` gate here — a border isn't
// what puts an element in a stage, `placements` already does that, so any `PlacementKey` is valid.
function validateBorders(key: string, bordersRaw: unknown, stages: Stage[]): string[] {
    const errors: string[] = []
    if (bordersRaw === undefined) return errors
    if (!isPlainObject(bordersRaw)) {
        return [`element "${key}": borders must be an object`]
    }
    for (const [phase, sides] of Object.entries(bordersRaw)) {
        if (!isPlacementKey(phase, stages)) {
            errors.push(`element "${key}": invalid phase "${phase}" in borders`)
            continue
        }
        if (!isSides(sides)) {
            errors.push(`element "${key}": borders["${phase}"] must be {top,right,bottom,left} numbers >= 0`)
        }
    }
    return errors
}

// `resultsThin` field validation (obs-layout-plan.md §2.4): `columns` is a positive integer,
// `textSize`/`iconSize` are positive finite numbers (px), `sort` is one of the two literals.
function validateResultsThinFields(key: string, rawEl: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (rawEl.columns !== undefined) {
        if (!isFiniteNumber(rawEl.columns) || !Number.isInteger(rawEl.columns) || rawEl.columns < 1) {
            errors.push(`element "${key}": columns must be an integer >= 1`)
        }
    }
    if (rawEl.textSize !== undefined) {
        if (!isFiniteNumber(rawEl.textSize) || rawEl.textSize <= 0) {
            errors.push(`element "${key}": textSize must be a finite number > 0`)
        }
    }
    if (rawEl.iconSize !== undefined) {
        if (!isFiniteNumber(rawEl.iconSize) || rawEl.iconSize <= 0) {
            errors.push(`element "${key}": iconSize must be a finite number > 0`)
        }
    }
    if (rawEl.sort !== undefined) {
        if (typeof rawEl.sort !== 'string' || !(VALID_RESULTS_SORTS as readonly string[]).includes(rawEl.sort)) {
            errors.push(`element "${key}": sort must be one of ${VALID_RESULTS_SORTS.join(', ')}`)
        }
    }
    return errors
}

// `text` field validation (obs-layout-plan.md §2.12): `text` is a string capped at
// MAX_TEXT_LENGTH (schema.ts), `fontSize` a finite number > 0 (absolute canvas px — see
// TextElement.tsx for why it is not derived from `box`).
function validateTextFields(key: string, rawEl: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (rawEl.text !== undefined) {
        if (typeof rawEl.text !== 'string') {
            errors.push(`element "${key}": text must be a string`)
        } else if (rawEl.text.length > MAX_TEXT_LENGTH) {
            errors.push(`element "${key}": text must be at most ${MAX_TEXT_LENGTH} characters`)
        }
    }
    if (rawEl.fontSize !== undefined && (!isFiniteNumber(rawEl.fontSize) || rawEl.fontSize <= 0)) {
        errors.push(`element "${key}": fontSize must be a finite number > 0`)
    }
    return errors
}

// `mirrorOf` validation (obs-layout-text-mirror-plan.md M.1). A mirror is a real element that
// borrows another element's properties/size/layer/reactions — these checks exist so
// the panel's cascades (ElementsPanel.tsx: `removeElement`, `setPlacement`'s stage-removal
// cascade, `setPersistent`'s refusal) are never actually exercised by a config that skips them —
// if one of these fires on a config the panel produced, the cascade that should have prevented it
// has a bug (see the plan's note on why the messages name both keys).
function validateMirror(
    key: string,
    rawEl: Record<string, unknown>,
    elementsRaw: Record<string, unknown>,
    stages: Stage[]
): string[] {
    if (rawEl.mirrorOf === undefined) return []
    const mirrorOf = rawEl.mirrorOf
    if (typeof mirrorOf !== 'string') {
        return [`element "${key}": mirrorOf must be a string`]
    }
    // Rule 1a: no self-reference.
    if (mirrorOf === key) {
        return [`element "${key}": mirrorOf cannot reference itself`]
    }
    // Rule 1b: must name an existing element whose kind is mirrorable (MIRRORABLE_KINDS) and the
    // SAME kind/variant as the mirror itself — the mirror's own discriminant is what the registry
    // and the per-kind validation below key off, so it must agree with what it will render as.
    const sourceRaw = elementsRaw[mirrorOf]
    if (!isPlainObject(sourceRaw)) {
        return [`element "${key}": mirrorOf "${mirrorOf}" is not an existing element`]
    }
    if (!(MIRRORABLE_KINDS as readonly string[]).includes(String(sourceRaw.kind))) {
        return [`element "${key}": mirrorOf "${mirrorOf}" is a "${String(sourceRaw.kind)}" element, which cannot be mirrored`]
    }
    for (const field of ['kind', 'variant', 'widget', 'animation'] as const) {
        if (sourceRaw[field] !== rawEl[field]) {
            return [`element "${key}": mirrorOf "${mirrorOf}" is a different element type (${field}: ${JSON.stringify(sourceRaw[field])} vs ${JSON.stringify(rawEl[field])})`]
        }
    }

    const errors: string[] = []

    // Rule 2: one level only — the source cannot itself be a mirror.
    if (sourceRaw.mirrorOf !== undefined) {
        errors.push(
            `element "${key}": mirrors "${mirrorOf}", which is itself a mirror (mirrors can only be one level deep)`
        )
    }

    // Rule 3: neither side may be persistent (`placements.all`) — a persistent mirror or source
    // could put a mirror on a stage its source is not (also) placed on.
    const mirrorPlacements = rawEl.placements
    if (isPlainObject(mirrorPlacements) && mirrorPlacements.all !== undefined) {
        errors.push(`element "${key}": a mirror cannot be persistent (placements.all)`)
    }
    const sourcePlacements = sourceRaw.placements
    if (isPlainObject(sourcePlacements) && sourcePlacements.all !== undefined) {
        errors.push(
            `element "${key}": mirrors "${mirrorOf}", which is persistent (placements.all) — a mirror's source cannot be persistent`
        )
    }

    // Rule 4: every stage the mirror is placed in must be one the source is placed in too — this
    // is what makes the inherited size (`resolveEffective`) always resolvable, no fallback.
    // Placement keys that aren't real stages are reported separately by `validatePlacements`.
    if (isPlainObject(mirrorPlacements) && isPlainObject(sourcePlacements)) {
        for (const phase of Object.keys(mirrorPlacements)) {
            if (phase === 'all' || !isPlacementKey(phase, stages)) continue
            if (!(phase in sourcePlacements)) {
                errors.push(`element "${key}": mirrors "${mirrorOf}", which is not placed in stage "${phase}"`)
            }
        }
    }

    return errors
}

// `priceRanges` field validation: both settings are optional (absent = component default applies,
// registry.ts `makeElement` leaves them unset), and when present must be a finite number > 0 —
// same rule as `text.fontSize` above.
function validatePriceRangesFields(key: string, rawEl: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (rawEl.labelFontSize !== undefined && (!isFiniteNumber(rawEl.labelFontSize) || rawEl.labelFontSize <= 0)) {
        errors.push(`element "${key}": labelFontSize must be a finite number > 0`)
    }
    if (rawEl.badgeFontSize !== undefined && (!isFiniteNumber(rawEl.badgeFontSize) || rawEl.badgeFontSize <= 0)) {
        errors.push(`element "${key}": badgeFontSize must be a finite number > 0`)
    }
    return errors
}

// `imageBox` field validation: `url` is the public image URL returned by
// `/api/layout/image/upload` (a plain string, capped well above any realistic Spaces URL length),
// `name` a display label (obs-image-box-plan.md §6, capped at the same length as the upload
// endpoint's `name` field), `fit` one of IMAGE_FITS (schema.ts).
const MAX_IMAGE_URL_LENGTH = 2048
const MAX_IMAGE_NAME_LENGTH = 200

function validateImageBoxFields(key: string, rawEl: Record<string, unknown>): string[] {
    const errors: string[] = []
    if (rawEl.url !== undefined) {
        if (typeof rawEl.url !== 'string') {
            errors.push(`element "${key}": url must be a string`)
        } else if (rawEl.url.length > MAX_IMAGE_URL_LENGTH) {
            errors.push(`element "${key}": url must be at most ${MAX_IMAGE_URL_LENGTH} characters`)
        }
    }
    if (rawEl.name !== undefined) {
        if (typeof rawEl.name !== 'string') {
            errors.push(`element "${key}": name must be a string`)
        } else if (rawEl.name.length > MAX_IMAGE_NAME_LENGTH) {
            errors.push(`element "${key}": name must be at most ${MAX_IMAGE_NAME_LENGTH} characters`)
        }
    }
    if (rawEl.fit !== undefined && (typeof rawEl.fit !== 'string' || !(IMAGE_FITS as readonly string[]).includes(rawEl.fit))) {
        errors.push(`element "${key}": fit must be one of ${IMAGE_FITS.join(', ')}`)
    }
    if (rawEl.position !== undefined) {
        const pos = rawEl.position
        if (
            !isPlainObject(pos) ||
            !isFiniteNumber(pos.x) ||
            pos.x < 0 ||
            pos.x > 100 ||
            !isFiniteNumber(pos.y) ||
            pos.y < 0 ||
            pos.y > 100
        ) {
            errors.push(`element "${key}": position must be {x, y} with each in [0, 100]`)
        }
    }
    return errors
}

// ---- per-kind validators -----------------------------------------------------------------------
// One function per ElementKind, dispatched from a lookup table (see KIND_VALIDATORS below) rather
// than the `if (kind === 'board') … else if (kind === 'widget') …` chain this replaced. The
// `satisfies Record<ElementKind, KindValidator>` on that table is what makes adding a kind to
// ElementKind (schema.ts) without adding an entry here a COMPILE error — an object type can't be
// exhaustively `switch`ed the way a discriminated union can, so `satisfies` is this shape's
// equivalent of the `const _exhaustive: never` idiom registryIdOf/makeElement (registry.ts) use.

type KindValidatorCtx = {
    key: string
    rawEl: Record<string, unknown>
    elementsRaw: Record<string, unknown> // for cross-element checks (animation `target`)
    stages: Stage[]
}

/** Kind-specific checks only — `z`/`reactions`/`mirrorOf` are shared across every kind and are
 *  validated by the caller (validateConfig) before a KindValidator ever runs. Returns the registry
 *  id the element resolves to, or undefined when its own discriminant (variant/widget/animation) is
 *  invalid — the caller then skips `validatePlacements` and the singleton-group bookkeeping for
 *  this element, exactly as the old chain did by leaving `regId` unset. */
type KindValidator = (ctx: KindValidatorCtx) => { errors: string[]; regId?: RegistryId }

function validateBoardKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const variant = rawEl.variant
    if (typeof variant !== 'string' || !(VALID_BOARD_VARIANTS as readonly string[]).includes(variant)) {
        return { errors: [`element "${key}": invalid board variant ${JSON.stringify(variant)}`] }
    }
    const regId = `board:${variant}` as RegistryId
    return { errors: validatePlacements(key, rawEl.placements, regId, stages), regId }
}

function validateWidgetKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const widget = rawEl.widget
    if (typeof widget !== 'string' || !(VALID_WIDGET_IDS as readonly string[]).includes(widget)) {
        return { errors: [`element "${key}": invalid widget id ${JSON.stringify(widget)}`] }
    }
    const regId = `widget:${widget}` as RegistryId
    return { errors: validatePlacements(key, rawEl.placements, regId, stages), regId }
}

function validateResultsKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'results'
    const errors = validatePlacements(key, rawEl.placements, regId, stages)
    if (
        rawEl.columns !== undefined &&
        (!isFiniteNumber(rawEl.columns) || !Number.isInteger(rawEl.columns) || rawEl.columns < 1)
    ) {
        errors.push(`element "${key}": columns must be an integer >= 1`)
    }
    if (
        rawEl.sort !== undefined &&
        (typeof rawEl.sort !== 'string' || !(VALID_RESULTS_SORTS as readonly string[]).includes(rawEl.sort))
    ) {
        errors.push(`element "${key}": sort must be one of ${VALID_RESULTS_SORTS.join(', ')}`)
    }
    return { errors, regId }
}

// `cards`/`ripbar`/`reserved` share one branch today — a plain, boxed element with no fields of
// its own beyond `placements`. A factory keeps that sharing without losing the per-kind entry the
// `satisfies` check needs to see all three kinds explicitly covered.
function plainKind(regId: RegistryId): KindValidator {
    return ({ key, rawEl, stages }) => ({ errors: validatePlacements(key, rawEl.placements, regId, stages), regId })
}

function validateResultsThinKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'resultsThin'
    return {
        errors: [...validatePlacements(key, rawEl.placements, regId, stages), ...validateResultsThinFields(key, rawEl)],
        regId,
    }
}

function validateFrameKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const errors: string[] = []
    let regId: RegistryId | undefined
    const variant = rawEl.variant
    if (typeof variant !== 'string' || !(VALID_FRAME_VARIANTS as readonly string[]).includes(variant)) {
        errors.push(`element "${key}": invalid frame variant ${JSON.stringify(variant)}`)
    } else {
        regId = `frame:${variant}` as RegistryId
        errors.push(...validatePlacements(key, rawEl.placements, regId, stages))
    }
    errors.push(...validateBorders(key, rawEl.borders, stages))
    errors.push(...validateFrameWidth(key, rawEl.frameWidth))
    return { errors, regId }
}

function validateAnimationKind({
    key,
    rawEl,
    elementsRaw,
    stages,
}: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const errors: string[] = []
    let regId: RegistryId | undefined
    const animation = rawEl.animation
    if (typeof animation !== 'string' || !(VALID_ANIMATION_IDS as readonly string[]).includes(animation)) {
        errors.push(`element "${key}": invalid animation id ${JSON.stringify(animation)}`)
    } else {
        regId = `animation:${animation}` as RegistryId
        errors.push(...validatePlacements(key, rawEl.placements, regId, stages))
    }
    // `target`, if set, must name another existing element (obs-layout-plan.md
    // §1.9) — no self-reference, since an element can't glue itself to its own box.
    if (rawEl.target !== undefined) {
        if (typeof rawEl.target !== 'string') {
            errors.push(`element "${key}": target must be a string`)
        } else if (rawEl.target === key) {
            errors.push(`element "${key}": target cannot reference itself`)
        } else if (!(rawEl.target in elementsRaw)) {
            errors.push(`element "${key}": target "${rawEl.target}" is not an existing element`)
        }
    }
    // board-anchors-plan.md §3.4: present means "a non-empty string" only — deliberately NOT
    // checked against the target's registry `anchors` (see schema.ts's comment on this field for
    // why: a board variant swap must not invalidate the whole config).
    if (rawEl.targetAnchor !== undefined && (typeof rawEl.targetAnchor !== 'string' || rawEl.targetAnchor.length === 0)) {
        errors.push(`element "${key}": targetAnchor must be a non-empty string`)
    }
    if (rawEl.pad !== undefined && !isFiniteNumber(rawEl.pad)) {
        errors.push(`element "${key}": pad must be a finite number`)
    }
    if (rawEl.laneFontSize !== undefined && !isFiniteNumber(rawEl.laneFontSize)) {
        errors.push(`element "${key}": laneFontSize must be a finite number`)
    }
    if (rawEl.bandThickness !== undefined && !isFiniteNumber(rawEl.bandThickness)) {
        errors.push(`element "${key}": bandThickness must be a finite number`)
    }
    if (rawEl.speed !== undefined && !isFiniteNumber(rawEl.speed)) {
        errors.push(`element "${key}": speed must be a finite number`)
    }
    if (rawEl.rate !== undefined && (!isFiniteNumber(rawEl.rate) || rawEl.rate <= 0)) {
        errors.push(`element "${key}": rate must be a finite number > 0`)
    }
    if (rawEl.holdMs !== undefined && !isFiniteNumber(rawEl.holdMs)) {
        errors.push(`element "${key}": holdMs must be a finite number`)
    }
    // `animation:stashOrPassSportStyle` only (Revision 2, R1) — see schema.ts's comment on these
    // two fields. Validated for every animation id regardless, same as the other optional fields
    // above: a stray value on the wrong animation id is harmless (the element ignores it) and not
    // worth a kind-specific branch here.
    if (rawEl.cornerWidth !== undefined && (!isFiniteNumber(rawEl.cornerWidth) || rawEl.cornerWidth < 0)) {
        errors.push(`element "${key}": cornerWidth must be a finite number >= 0`)
    }
    if (
        rawEl.cornerRoundness !== undefined &&
        (!isFiniteNumber(rawEl.cornerRoundness) || rawEl.cornerRoundness < 0 || rawEl.cornerRoundness > 1)
    ) {
        errors.push(`element "${key}": cornerRoundness must be a finite number between 0 and 1`)
    }
    return { errors, regId }
}

function validateTextKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'text'
    return {
        errors: [...validatePlacements(key, rawEl.placements, regId, stages), ...validateTextFields(key, rawEl)],
        regId,
    }
}

function validateImageBoxKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'image-box'
    return {
        errors: [...validatePlacements(key, rawEl.placements, regId, stages), ...validateImageBoxFields(key, rawEl)],
        regId,
    }
}

function validatePriceRangesKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'priceRanges'
    return {
        errors: [...validatePlacements(key, rawEl.placements, regId, stages), ...validatePriceRangesFields(key, rawEl)],
        regId,
    }
}

// `priceSign` field validation (obs-price-sign-plan.md §3). `labelFontSize`/`badgeFontSize` reuse
// `validatePriceRangesFields`'s rule verbatim (copied, not imported — ADDING_AN_ELEMENT.md's copy
// convention); the three new numbers each get their own range check.
function validatePriceSignFields(key: string, rawEl: Record<string, unknown>): string[] {
    const errors = validatePriceRangesFields(key, rawEl)
    if (
        rawEl.boardWidthPct !== undefined &&
        (!isFiniteNumber(rawEl.boardWidthPct) || rawEl.boardWidthPct <= 0)
    ) {
        errors.push(`element "${key}": boardWidthPct must be a finite number > 0`)
    }
    if (
        rawEl.chainLength !== undefined &&
        (!isFiniteNumber(rawEl.chainLength) || rawEl.chainLength < 0 || rawEl.chainLength > 1000)
    ) {
        errors.push(`element "${key}": chainLength must be a finite number in [0, 1000]`)
    }
    if (
        rawEl.windStrength !== undefined &&
        (!isFiniteNumber(rawEl.windStrength) || rawEl.windStrength < 0 || rawEl.windStrength > 2)
    ) {
        errors.push(`element "${key}": windStrength must be a finite number in [0, 2]`)
    }
    return errors
}

function validatePriceSignKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'priceSign'
    return {
        errors: [...validatePlacements(key, rawEl.placements, regId, stages), ...validatePriceSignFields(key, rawEl)],
        regId,
    }
}

// `scene.effects[i]` field validation (obs-scene-element-plan.md §2.2/§5/§6): ranges match the
// plan's table (speed 0..200, opacity/intensity 0..1, y 0..100, ambientIntervalSec null or 1..600,
// birds count 1..12/intervalSec 5..600/yMin,yMax 0..100 with yMin <= yMax). By the time this runs,
// `migrateConfig`'s
// `sanitizeSceneEffects` has already dropped unknown ids and filled a missing `y` with its
// effect's default (see that function's comment) — the `default` branch below is reached only if
// `validateConfig` is ever called on data that skipped migration, and errors rather than silently
// dropping, since dropping-without-rejecting is deliberately migrateConfig's job alone (doing it
// twice, in two different failure modes, is how the two would drift).
function validateSceneEffect(key: string, index: number, raw: unknown): string[] {
    if (!isPlainObject(raw)) {
        return [`element "${key}": effects[${index}] must be an object`]
    }
    const errors: string[] = []
    if (typeof raw.enabled !== 'boolean') {
        errors.push(`element "${key}": effects[${index}].enabled must be a boolean`)
    }
    switch (raw.id) {
        case 'sky':
            if (typeof raw.mood !== 'string' || !(SKY_MOODS as readonly string[]).includes(raw.mood)) {
                errors.push(`element "${key}": effects[${index}] (sky) mood must be one of ${SKY_MOODS.join(', ')}`)
            }
            break
        case 'mountain':
            if (!isFiniteNumber(raw.y) || raw.y < 0 || raw.y > 100) {
                errors.push(`element "${key}": effects[${index}] (mountain) y must be a number in [0, 100]`)
            }
            break
        case 'clouds':
            if (raw.layer !== 'far' && raw.layer !== 'near') {
                errors.push(`element "${key}": effects[${index}] (clouds) layer must be "far" or "near"`)
            }
            if (!isFiniteNumber(raw.speed) || raw.speed < 0 || raw.speed > 200) {
                errors.push(`element "${key}": effects[${index}] (clouds) speed must be a number in [0, 200]`)
            }
            if (!isFiniteNumber(raw.opacity) || raw.opacity < 0 || raw.opacity > 1) {
                errors.push(`element "${key}": effects[${index}] (clouds) opacity must be a number in [0, 1]`)
            }
            if (!isFiniteNumber(raw.y) || raw.y < 0 || raw.y > 100) {
                errors.push(`element "${key}": effects[${index}] (clouds) y must be a number in [0, 100]`)
            }
            break
        case 'rain':
            if (!isFiniteNumber(raw.intensity) || raw.intensity < 0 || raw.intensity > 1) {
                errors.push(`element "${key}": effects[${index}] (rain) intensity must be a number in [0, 1]`)
            }
            break
        case 'lightning':
            if (
                raw.ambientIntervalSec !== null &&
                (!isFiniteNumber(raw.ambientIntervalSec) || raw.ambientIntervalSec < 1 || raw.ambientIntervalSec > 600)
            ) {
                errors.push(
                    `element "${key}": effects[${index}] (lightning) ambientIntervalSec must be null or a number in [1, 600]`
                )
            }
            break
        // obs-scene-element-plan.md §6: countMin/countMax 1..12 (integers, min <= max), intervalSec
        // 5..600, yMin/yMax 0..100 with yMin <= yMax.
        case 'birds':
            for (const field of ['countMin', 'countMax'] as const) {
                const v = raw[field]
                if (!isFiniteNumber(v) || !Number.isInteger(v) || v < 1 || v > 12) {
                    errors.push(`element "${key}": effects[${index}] (birds) ${field} must be an integer in [1, 12]`)
                }
            }
            if (isFiniteNumber(raw.countMin) && isFiniteNumber(raw.countMax) && raw.countMin > raw.countMax) {
                errors.push(`element "${key}": effects[${index}] (birds) countMin must be <= countMax`)
            }
            if (!isFiniteNumber(raw.intervalSec) || raw.intervalSec < 5 || raw.intervalSec > 600) {
                errors.push(`element "${key}": effects[${index}] (birds) intervalSec must be a number in [5, 600]`)
            }
            if (!isFiniteNumber(raw.yMin) || raw.yMin < 0 || raw.yMin > 100) {
                errors.push(`element "${key}": effects[${index}] (birds) yMin must be a number in [0, 100]`)
            }
            if (!isFiniteNumber(raw.yMax) || raw.yMax < 0 || raw.yMax > 100) {
                errors.push(`element "${key}": effects[${index}] (birds) yMax must be a number in [0, 100]`)
            }
            if (isFiniteNumber(raw.yMin) && isFiniteNumber(raw.yMax) && raw.yMin > raw.yMax) {
                errors.push(`element "${key}": effects[${index}] (birds) yMin must be <= yMax`)
            }
            break
        default:
            errors.push(`element "${key}": effects[${index}] has unknown id ${JSON.stringify(raw.id)}`)
    }
    return errors
}

function validateSceneKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'scene'
    const errors = validatePlacements(key, rawEl.placements, regId, stages)

    if (
        rawEl.quality !== undefined &&
        (typeof rawEl.quality !== 'string' || !(SCENE_QUALITIES as readonly string[]).includes(rawEl.quality))
    ) {
        errors.push(`element "${key}": quality must be one of ${SCENE_QUALITIES.join(', ')}`)
    }

    if (!Array.isArray(rawEl.effects)) {
        errors.push(`element "${key}": effects must be an array`)
    } else {
        rawEl.effects.forEach((raw, i) => {
            errors.push(...validateSceneEffect(key, i, raw))
        })
    }

    return { errors, regId }
}

// `ticker.slots[widgetId]` validation (obs-ticker-plan.md §3): `enabled` a boolean, `label` an
// optional string capped at 40 chars (a slot's own override of the default label), `labelColor`/
// `valueColor` optional `#rrggbb` hex colours — the `<input type="color">` in the settings panel
// only ever emits that exact form.
const TICKER_HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const MAX_TICKER_LABEL_LENGTH = 40

function validateTickerSlot(key: string, widgetId: string, raw: unknown): string[] {
    if (!isPlainObject(raw)) {
        return [`element "${key}": slots["${widgetId}"] must be an object`]
    }
    const errors: string[] = []
    if (typeof raw.enabled !== 'boolean') {
        errors.push(`element "${key}": slots["${widgetId}"].enabled must be a boolean`)
    }
    if (raw.label !== undefined && (typeof raw.label !== 'string' || raw.label.length > MAX_TICKER_LABEL_LENGTH)) {
        errors.push(`element "${key}": slots["${widgetId}"].label must be a string of at most ${MAX_TICKER_LABEL_LENGTH} characters`)
    }
    if (raw.labelColor !== undefined && (typeof raw.labelColor !== 'string' || !TICKER_HEX_COLOR_RE.test(raw.labelColor))) {
        errors.push(`element "${key}": slots["${widgetId}"].labelColor must be a "#rrggbb" hex colour`)
    }
    if (raw.valueColor !== undefined && (typeof raw.valueColor !== 'string' || !TICKER_HEX_COLOR_RE.test(raw.valueColor))) {
        errors.push(`element "${key}": slots["${widgetId}"].valueColor must be a "#rrggbb" hex colour`)
    }
    if (raw.slashColor !== undefined) {
        // Only chasersLeft's value can contain a "/" ("3 / 25%"), so the field means nothing elsewhere.
        if (widgetId !== 'chasersLeft') {
            errors.push(`element "${key}": slots["${widgetId}"].slashColor is only allowed on chasersLeft`)
        } else if (typeof raw.slashColor !== 'string' || !TICKER_HEX_COLOR_RE.test(raw.slashColor)) {
            errors.push(`element "${key}": slots["${widgetId}"].slashColor must be a "#rrggbb" hex colour`)
        }
    }
    if (raw.showPctMin !== undefined) {
        if (widgetId !== 'chasersLeft') {
            errors.push(`element "${key}": slots["${widgetId}"].showPctMin is only allowed on chasersLeft`)
        } else if (!Number.isInteger(raw.showPctMin) || (raw.showPctMin as number) < 0 || (raw.showPctMin as number) > 100) {
            errors.push(`element "${key}": slots["${widgetId}"].showPctMin must be an integer 0..100`)
        }
    }
    return errors
}

// `ticker` field validation (obs-ticker-plan.md §3): `slots` must be a plain object keyed by
// EXACTLY the six `WIDGET_IDS` — a missing key is rejected (an old/hand-edited config never
// half-renders with some widgets silently absent) and an unrecognized key is rejected too, same
// "no stray keys" policy as every other kind's fixed shape. `separator` is capped at
// MAX_TEXT_LENGTH like `text.text`; `fontSize`/`speed`/`direction` each get their own range check.
function validateTickerFields(key: string, rawEl: Record<string, unknown>): string[] {
    const errors: string[] = []

    const slotsRaw = rawEl.slots
    if (!isPlainObject(slotsRaw)) {
        errors.push(`element "${key}": slots must be an object`)
    } else {
        const presentKeys = Object.keys(slotsRaw)
        const missing = VALID_WIDGET_IDS.filter((id) => !(id in slotsRaw))
        const unknown = presentKeys.filter((k) => !(VALID_WIDGET_IDS as readonly string[]).includes(k))
        if (missing.length > 0) {
            errors.push(`element "${key}": slots is missing widget id(s) ${missing.join(', ')}`)
        }
        if (unknown.length > 0) {
            errors.push(`element "${key}": slots has unknown key(s) ${unknown.join(', ')}`)
        }
        for (const id of VALID_WIDGET_IDS) {
            if (id in slotsRaw) {
                errors.push(...validateTickerSlot(key, id, slotsRaw[id]))
            }
        }
    }

    if (rawEl.separator !== undefined && (typeof rawEl.separator !== 'string' || rawEl.separator.length > MAX_TEXT_LENGTH)) {
        errors.push(`element "${key}": separator must be a string of at most ${MAX_TEXT_LENGTH} characters`)
    }
    if (rawEl.fontSize !== undefined && (!isFiniteNumber(rawEl.fontSize) || rawEl.fontSize < 8 || rawEl.fontSize > 300)) {
        errors.push(`element "${key}": fontSize must be a finite number in [8, 300]`)
    }
    if (rawEl.speed !== undefined && (!isFiniteNumber(rawEl.speed) || rawEl.speed < 0 || rawEl.speed > 600)) {
        errors.push(`element "${key}": speed must be a finite number in [0, 600]`)
    }
    if (
        rawEl.direction !== undefined &&
        (typeof rawEl.direction !== 'string' || !(TICKER_DIRECTIONS as readonly string[]).includes(rawEl.direction))
    ) {
        errors.push(`element "${key}": direction must be one of ${TICKER_DIRECTIONS.join(', ')}`)
    }

    return errors
}

function validateTickerKind({ key, rawEl, stages }: KindValidatorCtx): { errors: string[]; regId?: RegistryId } {
    const regId: RegistryId = 'ticker'
    return {
        errors: [...validatePlacements(key, rawEl.placements, regId, stages), ...validateTickerFields(key, rawEl)],
        regId,
    }
}

// The enforcement this whole section exists for: a kind added to ElementKind (schema.ts) with no
// entry below fails `tsc` right here — see the section's header comment.
const KIND_VALIDATORS = {
    board: validateBoardKind,
    widget: validateWidgetKind,
    results: validateResultsKind,
    resultsThin: validateResultsThinKind,
    cards: plainKind('cards'),
    ripbar: plainKind('ripbar'),
    reserved: plainKind('reserved'),
    frame: validateFrameKind,
    animation: validateAnimationKind,
    text: validateTextKind,
    imageBox: validateImageBoxKind,
    priceRanges: validatePriceRangesKind,
    priceSign: validatePriceSignKind,
    scene: validateSceneKind,
    ticker: validateTickerKind,
} satisfies Record<ElementKind, KindValidator>

// `config.stages`: non-empty, every entry `{id: non-empty string, label: non-empty string}`,
// unique ids, 'all' reserved (it's the persistent-placement key, not a real stage), and every
// built-in id (BUILT_IN_STAGES) present — order among them is free, since reordering built-ins is
// allowed, only deleting them is refused. Validated BEFORE placements (`validateConfig` calls this
// first) since `validatePlacements`/`validateBorders` check every placement key against the result.
//
// Interpretation: the spec's "each entry {id: string, label: string} with a non-empty id" states
// the id requirement explicitly; a stage with an empty label would be unselectable/unreadable in
// every stage picker, so this also requires a non-empty label. The Stages tab UI never lets an
// operator submit one anyway (the Add button is disabled on an empty label draft).
function validateStages(rawStages: unknown): { errors: string[]; stages: Stage[] } {
    const errors: string[] = []
    const stages: Stage[] = []

    if (!Array.isArray(rawStages) || rawStages.length === 0) {
        errors.push('config.stages must be a non-empty array')
        return { errors, stages: DEFAULT_STAGES.map((s) => ({ ...s })) }
    }

    const seenIds = new Set<string>()
    rawStages.forEach((raw, i) => {
        if (
            !isPlainObject(raw) ||
            typeof raw.id !== 'string' ||
            raw.id.length === 0 ||
            typeof raw.label !== 'string' ||
            raw.label.length === 0
        ) {
            errors.push(`config.stages[${i}] must be {id: non-empty string, label: non-empty string}`)
            return
        }
        if (raw.id === 'all') {
            errors.push(`config.stages[${i}]: id "all" is reserved (it is the persistent-placement key)`)
            return
        }
        if (seenIds.has(raw.id)) {
            errors.push(`config.stages[${i}]: duplicate stage id "${raw.id}"`)
            return
        }
        seenIds.add(raw.id)
        stages.push({ id: raw.id, label: raw.label })
    })

    for (const builtIn of BUILT_IN_STAGES) {
        if (!seenIds.has(builtIn.id)) {
            errors.push(`config.stages is missing built-in stage "${builtIn.id}"`)
        }
    }

    return { errors, stages }
}

export function validateConfig(
    input: unknown
): { ok: true; config: LayoutConfig } | { ok: false; errors: string[] } {
    const errors: string[] = []

    if (!isPlainObject(input)) {
        return { ok: false, errors: ['config must be an object'] }
    }

    if (input.version !== 1) {
        errors.push(`config.version must be 1, got ${JSON.stringify(input.version)}`)
    }

    const canvas = input.canvas
    if (!isPlainObject(canvas) || canvas.w !== 1080 || canvas.h !== 1920) {
        errors.push('config.canvas must be {w:1080,h:1920}')
    }

    // Validated before elements/placements — every placement/border key below is checked against
    // `stages`.
    const stagesResult = validateStages(input.stages)
    errors.push(...stagesResult.errors)
    const stages = stagesResult.stages

    const elements: Record<string, Element> = {}
    const elementsRaw = input.elements
    if (!isPlainObject(elementsRaw)) {
        errors.push('config.elements must be an object')
    } else {
        const singletonGroups = new Map<string, string[]>()

        for (const [key, rawEl] of Object.entries(elementsRaw)) {
            if (!isPlainObject(rawEl)) {
                errors.push(`element "${key}": must be an object`)
                continue
            }

            const elErrors: string[] = [
                ...validateZ(key, rawEl),
                ...validateReactions(key, rawEl),
                // Any kind may carry `mirrorOf`; the allowlist check inside decides whether it may.
                ...validateMirror(key, rawEl, elementsRaw, stages),
            ]
            let regId: RegistryId | undefined

            // Dispatch on `kind` through KIND_VALIDATORS (defined above, near validateStages)
            // rather than an if/else chain — see that table's header comment for why.
            const kind = rawEl.kind
            const validator = (KIND_VALIDATORS as Record<string, KindValidator | undefined>)[String(kind)]
            if (!validator) {
                elErrors.push(`element "${key}": unknown kind ${JSON.stringify(kind)}`)
            } else {
                const kindResult = validator({ key, rawEl, elementsRaw, stages })
                elErrors.push(...kindResult.errors)
                regId = kindResult.regId
            }

            if (elErrors.length > 0) {
                errors.push(...elErrors)
                continue
            }

            // rawEl has passed shape validation for its kind — safe to treat as Element.
            elements[key] = rawEl as Element

            if (regId) {
                const group = REGISTRY[regId].singletonGroup
                if (REGISTRY[regId].singleton) {
                    const existing = singletonGroups.get(group) ?? []
                    existing.push(key)
                    singletonGroups.set(group, existing)
                }
            }
        }

        singletonGroups.forEach((keys, group) => {
            if (keys.length > 1) {
                errors.push(`singleton violation for "${group}": multiple elements (${keys.join(', ')})`)
            }
        })
    }

    const obsBindings = input.obsBindings
    let validatedBindings: LayoutConfig['obsBindings'] = {}
    if (obsBindings !== undefined) {
        if (!isPlainObject(obsBindings)) {
            errors.push('config.obsBindings must be an object')
        } else {
            if (obsBindings.transitionSource !== undefined && typeof obsBindings.transitionSource !== 'string') {
                errors.push('config.obsBindings.transitionSource must be a string')
            }
            if (obsBindings.cameraItem !== undefined && typeof obsBindings.cameraItem !== 'string') {
                errors.push('config.obsBindings.cameraItem must be a string')
            }
            if (obsBindings.useTransition !== undefined && typeof obsBindings.useTransition !== 'boolean') {
                errors.push('config.obsBindings.useTransition must be a boolean')
            }
            if (errors.length === 0) {
                validatedBindings = {
                    transitionSource: obsBindings.transitionSource as string | undefined,
                    cameraItem: obsBindings.cameraItem as string | undefined,
                    useTransition: obsBindings.useTransition as boolean | undefined,
                }
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors }
    }

    return {
        ok: true,
        config: {
            version: 1,
            canvas: { w: 1080, h: 1920 },
            stages,
            elements,
            obsBindings: validatedBindings,
        },
    }
}

// Turns a stored preset (LayoutPreset.config, schema.ts — typed `unknown` on the wire) into the
// LayoutConfig to push, or a list of reasons it can't be. Two rules, both deliberate:
//   (a) FAILS rather than half-applies — a preset saved under an older schema that no longer
//       validates must be reported to the operator, never silently loaded as a partial/broken
//       layout (obs-layout-presets-plan.md P.2).
//   (b) The LIVE config's `obsBindings` win over whatever the preset stored. `obsBindings` names
//       physical OBS scene items (the transition source, the camera item) — not part of "the
//       layout" the way stages/elements are — and a preset from weeks ago silently repointing them
//       out from under the operator is exactly the surprise this guards against.
export type PresetOverrides = Record<string, { visible?: boolean }>

/**
 * What a preset actually stores. A preset is "the layout as it looked", and two of the three things
 * the operator sets per element live in different objects:
 *   - "Persistent" is `placements.all` — part of `elements`, so the config alone already carries it.
 *   - "Visible" is `state.overrides[key].visible` — OverlayState, which a config does not include.
 * Storing the bare config therefore lost every hidden element on load: they came back visible.
 *
 * `version` distinguishes this envelope from the bare `LayoutConfig` presets saved before it. Both
 * are read (see `readPresetBlob`); everything written from now on is an envelope.
 */
export type PresetPayload = {
    version: 2
    config: LayoutConfig
    overrides: PresetOverrides
}

/** The blob to store for a preset: the config plus the visibility half of the live state. */
export function makePresetPayload(config: LayoutConfig, state: OverlayState): PresetPayload {
    const overrides: PresetOverrides = {}
    for (const [key, override] of Object.entries(state.overrides ?? {})) {
        // Only `visible` is kept, and only when it is actually set. `overrides` accumulates keys
        // for elements that have since been deleted, and an entry of `{}` means nothing — copying
        // either into a preset would just be noise that outlives the layout it came from.
        if (typeof override?.visible === 'boolean' && config.elements[key]) {
            overrides[key] = { visible: override.visible }
        }
    }
    return { version: 2, config, overrides }
}

/**
 * Accepts either shape a preset may have been stored in: the v2 envelope, or a bare `LayoutConfig`
 * from before overrides were carried. Detection is on `version`/`config` rather than on the absence
 * of `elements`, so a malformed blob falls through to config validation and is reported there
 * instead of being silently read as "legacy, no overrides".
 */
function readPresetBlob(stored: unknown): { rawConfig: unknown; overrides: PresetOverrides } {
    if (isPlainObject(stored) && stored.version === 2 && 'config' in stored) {
        const raw = stored.overrides
        const overrides: PresetOverrides = {}
        if (isPlainObject(raw)) {
            for (const [key, override] of Object.entries(raw)) {
                // Stored blobs are untrusted: anything that is not a boolean `visible` is dropped
                // rather than passed on to validateState, which would reject the whole load.
                if (isPlainObject(override) && typeof override.visible === 'boolean') {
                    overrides[key] = { visible: override.visible }
                }
            }
        }
        return { rawConfig: stored.config, overrides }
    }
    return { rawConfig: stored, overrides: {} }
}

/** Element count and stage count for a preset row, without running a full validation. */
export function summarizePreset(stored: unknown): { elements: number; stages: number } | null {
    const { rawConfig } = readPresetBlob(stored)
    if (!isPlainObject(rawConfig)) return null
    const { elements, stages } = rawConfig
    if (!isPlainObject(elements) || !Array.isArray(stages)) return null
    return { elements: Object.keys(elements).length, stages: stages.length }
}

export function applyPreset(
    stored: unknown,
    live: LayoutConfig
): { ok: true; config: LayoutConfig; overrides: PresetOverrides } | { ok: false; errors: string[] } {
    const { rawConfig, overrides } = readPresetBlob(stored)
    const validated = validateConfig(migrateConfig(rawConfig))
    if (!validated.ok) return validated
    return { ok: true, config: { ...validated.config, obsBindings: live.obsBindings }, overrides }
}

export function validateState(
    input: unknown
): { ok: true; state: OverlayState } | { ok: false; errors: string[] } {
    const errors: string[] = []

    if (!isPlainObject(input)) {
        return { ok: false, errors: ['state must be an object'] }
    }

    // `state` carries no config, so there is no `stages` list to check `phase` against here — a
    // phase that names a stage which does not (or no longer) exists in the config it is paired
    // with is a cross-object concern, not something one object's own shape validation can catch.
    // Callers that load both together (useControls.loadAll, the obs/layout page's reconcile) check
    // `phase` against `config.stages` themselves and fall back to the config's first stage if it
    // doesn't match. Here we validate only that it is a non-empty string.
    if (typeof input.phase !== 'string' || input.phase.length === 0) {
        errors.push(`state.phase must be a non-empty string, got ${JSON.stringify(input.phase)}`)
    }

    if (input.phaseData !== undefined && !isPlainObject(input.phaseData)) {
        errors.push('state.phaseData must be an object')
    }

    if (input.overrides !== undefined) {
        if (!isPlainObject(input.overrides)) {
            errors.push('state.overrides must be an object')
        } else {
            for (const [key, override] of Object.entries(input.overrides)) {
                if (!isPlainObject(override)) {
                    errors.push(`state.overrides["${key}"] must be an object`)
                    continue
                }
                if (override.visible !== undefined && typeof override.visible !== 'boolean') {
                    errors.push(`state.overrides["${key}"].visible must be a boolean`)
                }
            }
        }
    }

    if (input.active !== undefined) {
        if (!isPlainObject(input.active)) {
            errors.push('state.active must be an object')
        } else {
            for (const [name, on] of Object.entries(input.active)) {
                if (!isSceneEventName(name)) {
                    errors.push(`state.active has unknown scene event "${name}"`)
                    continue
                }
                if (typeof on !== 'boolean') {
                    errors.push(`state.active["${name}"] must be a boolean`)
                }
            }
        }
    }

    if (errors.length > 0) {
        return { ok: false, errors }
    }

    return {
        ok: true,
        state: {
            phase: input.phase as Phase,
            phaseData: input.phaseData as Record<string, unknown> | undefined,
            overrides: input.overrides as OverlayState['overrides'],
            active: input.active as OverlayState['active'],
        },
    }
}

/** Is a latched scene event (see OverlayState.active) currently on? */
export function isEventActive(state: OverlayState, name: SceneEventName): boolean {
    return state.active?.[name] === true
}

export function isVisible(state: OverlayState, key: string): boolean {
    return state.overrides?.[key]?.visible !== false
}

/**
 * Visibility as it should be RENDERED: a mirror follows its source (obs-layout-text-mirror-plan.md
 * "Decisions"), so its own `overrides[key]` — which nothing writes any more, but a preset or an
 * older state row may still carry — is ignored in favour of the source's. Everything else is
 * plain `isVisible`. Same shape as `resolveEffective`: the one place that knows a mirror inherits.
 */
export function isEffectivelyVisible(config: LayoutConfig, state: OverlayState, key: string): boolean {
    const element = config.elements[key]
    const sourceKey = element?.mirrorOf ?? key
    return isVisible(state, sourceKey)
}

// Resolution rule for persistent elements (obs-layout-plan.md §1.7): a phase-specific placement
// always wins; otherwise fall back to the `all` placement. Every element kind carries its own
// `placements` (the old anchor-resolving `effect` kind was removed in §1.9 — see boxless
// elements + `useResolvedBox` in resolvedBoxes.tsx for its replacement).
export function resolveBox(element: Element, phase: Phase): Box | undefined {
    return element.placements[phase] ?? element.placements.all
}

// Same resolution rule as `resolveBox`, for the `frame` element's per-stage border widths
// (obs-layout-plan.md §2.5): a phase-specific entry wins, otherwise fall back to `all`, otherwise
// fall back to `DEFAULT_FRAME_BORDERS` (a freshly-added or malformed frame still renders sane
// widths rather than nothing). Non-frame elements have no borders to resolve, so they get the
// default too rather than the caller needing to guard the kind first.
export function resolveBorders(element: Element, phase: Phase): Sides {
    if (element.kind !== 'frame') return DEFAULT_FRAME_BORDERS
    return element.borders?.[phase] ?? element.borders?.all ?? DEFAULT_FRAME_BORDERS
}

// The gradient frame's thickness. Not per-stage (see the `frame` block in schema.ts), so there is
// no phase to resolve against — just the element's own value or the default.
export function resolveFrameWidth(element: Element): number {
    if (element.kind !== 'frame') return DEFAULT_FRAME_WIDTH
    return element.frameWidth ?? DEFAULT_FRAME_WIDTH
}

// The element as it should be rendered/edited (obs-layout-text-mirror-plan.md M.2): for a plain
// element, its own values untouched. For a mirror (any element with `mirrorOf`), the SOURCE's
// properties/z/reactions with the MIRROR's own placements — so `element.z` is the inherited
// layer and every kind-specific field is the source's — and a box built from the mirror's {x, y}
// and the source's {w, h} in `phase`. Both are guaranteed present together by validateConfig's
// mirror rule 4 (every phase the mirror is placed in, the source is placed in too), so there is no
// "source has no box in this phase" fallback to design for.
//
// This is the ONLY place that merges a mirror with its source. Every consumer that goes through
// it — `elementsForPhase` below (so the layout page, `resolvedBoxes`, wrap-animation targeting),
// the box editor's `others`/snap targets, ElementBlock's box section — gets the merge for free and
// never itself reads `mirrorOf` to compute anything. Controls code may still read `mirrorOf`
// directly, but only for POLICY (is this element a mirror / who mirrors it), never to merge.
export function resolveEffective(
    config: LayoutConfig,
    key: string,
    phase: Phase
): { element: Element; box: Box | undefined } {
    const element = config.elements[key]
    if (!element.mirrorOf) {
        return { element, box: resolveBox(element, phase) }
    }

    const mirrorBox = resolveBox(element, phase)
    const source = config.elements[element.mirrorOf]
    if (!source || !mirrorBox) {
        // Should not happen against a validated config (rule 1 guarantees the source exists and
        // is the same mirrorable kind; rule 4 guarantees a box here implies one on the source
        // too) — fall back to the mirror's own raw element/box rather than throwing.
        return { element, box: mirrorBox }
    }

    const sourceBox = resolveBox(source, phase)
    const effectiveElement: Element = { ...source, placements: element.placements }
    const box: Box | undefined = sourceBox
        ? { x: mirrorBox.x, y: mirrorBox.y, w: sourceBox.w, h: sourceBox.h }
        : undefined
    return { element: effectiveElement, box }
}

export function elementsForPhase(
    config: LayoutConfig,
    phase: Phase
): Array<{ key: string; element: Element; box: Box }> {
    const result: Array<{ key: string; element: Element; box: Box }> = []

    for (const key of Object.keys(config.elements)) {
        const { element, box } = resolveEffective(config, key, phase)
        if (!box) continue
        result.push({ key, element, box })
    }

    // Array.prototype.sort is a stable sort (guaranteed since ES2019), so elements that share a
    // `z` keep their insertion order — matches obs-layout-plan.md §1.7's "sorted by z ascending,
    // stable". `a.element.z`/`b.element.z` is the EFFECTIVE z (resolveEffective inherits it for a
    // mirror), so a mirror sorts alongside its source's layer, not its own (unset) one.
    result.sort((a, b) => (a.element.z ?? 0) - (b.element.z ?? 0))

    return result
}

// Effective reactions for one element instance (obs-layout-plan.md §1.9): the registry's
// `reactsTo` for its type, minus any the element's own `reactions` map explicitly turns off.
// Config can never turn ON a reaction the type doesn't implement.
export function effectiveReactions(element: Element): SceneEventName[] {
    const entry = REGISTRY[registryIdOf(element)]
    const overrides = element.reactions
    return entry.reactsTo.filter((name) => overrides?.[name] !== false)
}

// Validates one `Cue` (schema.ts) — used by bus.ts's `parseBusPayload` for every cue riding a
// BusPayload, whether it came from the real OBS event bus or the ?dev=1 BroadcastChannel shim.
export function validateCue(input: unknown): { ok: true; cue: Cue } | { ok: false; errors: string[] } {
    if (!isPlainObject(input)) {
        return { ok: false, errors: ['cue must be an object'] }
    }

    const kind = input.kind
    if (kind === 'event') {
        if (!isSceneEventName(input.name)) {
            return { ok: false, errors: [`cue.name must be a known scene event, got ${JSON.stringify(input.name)}`] }
        }
        if (input.params !== undefined && !isPlainObject(input.params)) {
            return { ok: false, errors: ['cue.params must be an object'] }
        }
        return {
            ok: true,
            cue: { kind: 'event', name: input.name, params: input.params as Record<string, unknown> | undefined },
        }
    }
    if (kind === 'photos-changed') {
        return { ok: true, cue: { kind: 'photos-changed' } }
    }
    if (kind === 'refetch') {
        if (typeof input.key !== 'string' || input.key.length === 0) {
            return { ok: false, errors: ['cue.key must be a non-empty string'] }
        }
        return { ok: true, cue: { kind: 'refetch', key: input.key } }
    }
    if (kind === 'highlight-photo') {
        // `null` is the "nothing highlighted" value, so it is accepted as-is — but `undefined`
        // (the key simply missing) is not: that is a malformed cue, not a clear.
        if (input.photoId !== null && typeof input.photoId !== 'number') {
            return { ok: false, errors: ['cue.photoId must be a number or null'] }
        }
        return { ok: true, cue: { kind: 'highlight-photo', photoId: input.photoId as number | null } }
    }
    if (kind === 'sport-style-regenerate') {
        if (input.target !== 'turf' && input.target !== 'wear') {
            return { ok: false, errors: ['cue.target must be "turf" or "wear"'] }
        }
        return { ok: true, cue: { kind: 'sport-style-regenerate', target: input.target } }
    }
    return {
        ok: false,
        errors: [
            'cue.kind must be one of event, photos-changed, refetch, highlight-photo, ' +
                `sport-style-regenerate — got ${JSON.stringify(kind)}`,
        ],
    }
}

// Channel-narrowing validators on top of `validateCue`: they enforce which of the two buses
// (schema.ts's DurableCue/TransientCue split) a given cue is actually allowed to ride, so
// `parseBusPayload`/`parseCuePayload` (bus.ts) reject a cue built for the other channel instead of
// letting it through as a plain `Cue`.
//
// Both narrowing functions are written as an EXHAUSTIVE `switch` over `cue.kind` with a `default`
// that assigns to `const _exhaustive: never = cue` (same idiom as registryIdOf/makeElement in
// registry.ts) rather than a string array of "durable kinds"/"transient kinds": an array is data,
// not a type, so it can silently drift from the union as cue kinds are added — exactly the bug
// class (naming/comments as the only enforcement) this whole split exists to close. The `switch`
// instead fails to COMPILE the moment a new cue kind isn't classified into one of the two.

function isDurableCue(cue: Cue): cue is DurableCue {
    switch (cue.kind) {
        case 'event':
        case 'photos-changed':
        case 'refetch':
            return true
        case 'highlight-photo':
        case 'sport-style-regenerate':
            return false
        default: {
            const _exhaustive: never = cue
            throw new Error(`isDurableCue: unhandled cue ${JSON.stringify(_exhaustive)}`)
        }
    }
}

/** Narrows `validateCue`'s result to the DURABLE channel (BusPayload) — used by bus.ts's
 *  `parseBusPayload`. Rejects a well-formed cue that belongs to the TRANSIENT channel instead of
 *  silently letting it ride a BusPayload, which would write a backend state row (and bump `seq`)
 *  for something meant to be fire-and-forget. */
export function validateDurableCue(input: unknown): { ok: true; cue: DurableCue } | { ok: false; errors: string[] } {
    const result = validateCue(input)
    if (!result.ok) return result
    if (!isDurableCue(result.cue)) {
        return {
            ok: false,
            errors: [`cue.kind "${result.cue.kind}" rides the TRANSIENT channel (CuePayload), not the durable BusPayload`],
        }
    }
    return { ok: true, cue: result.cue }
}

/** Narrows `validateCue`'s result to the TRANSIENT channel (CuePayload) — used by bus.ts's
 *  `parseCuePayload`. Rejects a well-formed cue that belongs to the DURABLE channel instead of
 *  silently letting it ride the transient bus, which would skip the backend state write that
 *  makes it survive a browser-source refresh. */
export function validateTransientCue(input: unknown): { ok: true; cue: TransientCue } | { ok: false; errors: string[] } {
    const result = validateCue(input)
    if (!result.ok) return result
    if (isDurableCue(result.cue)) {
        return {
            ok: false,
            errors: [`cue.kind "${result.cue.kind}" rides the DURABLE channel (BusPayload), not the transient CuePayload`],
        }
    }
    return { ok: true, cue: result.cue }
}
