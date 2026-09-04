// Validation and derivation helpers for LayoutConfig / OverlayState.
// Backend does not validate JSON shape (obs-layout-plan.md §1.1) — the frontend owns the schema,
// so everything that touches a config/state coming off the network must go through `migrateConfig`
// / `migrateState` and then `validateConfig` / `validateState` before it is trusted.

import type { Box, Cue, DurableCue, Element, LayoutConfig, OverlayState, Phase, PlacementKey, Sides, Stage, TransientCue } from './schema'
import {
    ANIMATION_IDS,
    BOARD_VARIANTS,
    BUILT_IN_STAGES,
    CANVAS,
    DEFAULT_FRAME_BORDERS,
    DEFAULT_FRAME_WIDTH,
    DEFAULT_STAGES,
    FRAME_VARIANTS,
    MAX_TEXT_LENGTH,
    RESULTS_SORTS,
    WIDGET_IDS,
} from './schema'
import type { RegistryId } from './registry'
import { REGISTRY, registryIdOf } from './registry'
import type { SceneEventName } from './sceneEvents'
import { isSceneEventName } from './sceneEvents'

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

            const elErrors: string[] = [...validateZ(key, rawEl), ...validateReactions(key, rawEl)]
            let regId: RegistryId | undefined

            const kind = rawEl.kind
            if (kind === 'board') {
                const variant = rawEl.variant
                if (typeof variant !== 'string' || !(VALID_BOARD_VARIANTS as readonly string[]).includes(variant)) {
                    elErrors.push(`element "${key}": invalid board variant ${JSON.stringify(variant)}`)
                } else {
                    regId = `board:${variant}` as RegistryId
                    elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                }
            } else if (kind === 'widget') {
                const widget = rawEl.widget
                if (typeof widget !== 'string' || !(VALID_WIDGET_IDS as readonly string[]).includes(widget)) {
                    elErrors.push(`element "${key}": invalid widget id ${JSON.stringify(widget)}`)
                } else {
                    regId = `widget:${widget}` as RegistryId
                    elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                }
            } else if (kind === 'results') {
                regId = 'results'
                elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                if (
                    rawEl.columns !== undefined &&
                    (!isFiniteNumber(rawEl.columns) || !Number.isInteger(rawEl.columns) || rawEl.columns < 1)
                ) {
                    elErrors.push(`element "${key}": columns must be an integer >= 1`)
                }
                if (
                    rawEl.sort !== undefined &&
                    (typeof rawEl.sort !== 'string' ||
                        !(VALID_RESULTS_SORTS as readonly string[]).includes(rawEl.sort))
                ) {
                    elErrors.push(`element "${key}": sort must be one of ${VALID_RESULTS_SORTS.join(', ')}`)
                }
            } else if (kind === 'cards' || kind === 'ripbar' || kind === 'reserved') {
                regId = kind as RegistryId
                elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
            } else if (kind === 'resultsThin') {
                regId = 'resultsThin'
                elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                elErrors.push(...validateResultsThinFields(key, rawEl))
            } else if (kind === 'frame') {
                const variant = rawEl.variant
                if (typeof variant !== 'string' || !(VALID_FRAME_VARIANTS as readonly string[]).includes(variant)) {
                    elErrors.push(`element "${key}": invalid frame variant ${JSON.stringify(variant)}`)
                } else {
                    regId = `frame:${variant}` as RegistryId
                    elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                }
                elErrors.push(...validateBorders(key, rawEl.borders, stages))
                elErrors.push(...validateFrameWidth(key, rawEl.frameWidth))
            } else if (kind === 'animation') {
                const animation = rawEl.animation
                if (typeof animation !== 'string' || !(VALID_ANIMATION_IDS as readonly string[]).includes(animation)) {
                    elErrors.push(`element "${key}": invalid animation id ${JSON.stringify(animation)}`)
                } else {
                    regId = `animation:${animation}` as RegistryId
                    elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                }
                // `target`, if set, must name another existing element (obs-layout-plan.md
                // §1.9) — no self-reference, since an element can't glue itself to its own box.
                if (rawEl.target !== undefined) {
                    if (typeof rawEl.target !== 'string') {
                        elErrors.push(`element "${key}": target must be a string`)
                    } else if (rawEl.target === key) {
                        elErrors.push(`element "${key}": target cannot reference itself`)
                    } else if (!(rawEl.target in elementsRaw)) {
                        elErrors.push(`element "${key}": target "${rawEl.target}" is not an existing element`)
                    }
                }
                if (rawEl.pad !== undefined && !isFiniteNumber(rawEl.pad)) {
                    elErrors.push(`element "${key}": pad must be a finite number`)
                }
                if (rawEl.laneFontSize !== undefined && !isFiniteNumber(rawEl.laneFontSize)) {
                    elErrors.push(`element "${key}": laneFontSize must be a finite number`)
                }
                if (rawEl.bandThickness !== undefined && !isFiniteNumber(rawEl.bandThickness)) {
                    elErrors.push(`element "${key}": bandThickness must be a finite number`)
                }
                if (rawEl.speed !== undefined && !isFiniteNumber(rawEl.speed)) {
                    elErrors.push(`element "${key}": speed must be a finite number`)
                }
                if (
                    rawEl.rate !== undefined &&
                    (!isFiniteNumber(rawEl.rate) || rawEl.rate <= 0)
                ) {
                    elErrors.push(`element "${key}": rate must be a finite number > 0`)
                }
                if (rawEl.holdMs !== undefined && !isFiniteNumber(rawEl.holdMs)) {
                    elErrors.push(`element "${key}": holdMs must be a finite number`)
                }
            } else if (kind === 'text') {
                regId = 'text'
                elErrors.push(...validatePlacements(key, rawEl.placements, regId, stages))
                elErrors.push(...validateTextFields(key, rawEl))
            } else {
                elErrors.push(`element "${key}": unknown kind ${JSON.stringify(kind)}`)
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

export function elementsForPhase(
    config: LayoutConfig,
    phase: Phase
): Array<{ key: string; element: Element; box: Box }> {
    const result: Array<{ key: string; element: Element; box: Box }> = []

    for (const [key, element] of Object.entries(config.elements)) {
        const box = resolveBox(element, phase)
        if (!box) continue
        result.push({ key, element, box })
    }

    // Array.prototype.sort is a stable sort (guaranteed since ES2019), so elements that share a
    // `z` keep their insertion order — matches obs-layout-plan.md §1.7's "sorted by z ascending,
    // stable".
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
    return {
        ok: false,
        errors: [
            'cue.kind must be one of event, photos-changed, refetch, highlight-photo — ' +
                `got ${JSON.stringify(kind)}`,
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
