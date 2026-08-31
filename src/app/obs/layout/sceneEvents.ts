// Vocabulary of semantic scene events the host can trigger from the controls page's Actions
// strip (obs-layout-plan.md §1.9: "Scene events — triggering by meaning"). The host presses one
// button per real-life action; element types decide for themselves whether/how they react — see
// `RegistryEntry.reactsTo` in registry.ts, `effectiveReactions()` in config.ts, and the
// `useSceneEvent()` hook in sceneEventBus.tsx. This list is expected to grow over time.

export type SceneEventName = 'stash_or_pass'

export type SceneEventDef = {
    name: SceneEventName
    label: string
    /**
     * A latching event stays ON until the operator presses its button again, so its on/off-ness is
     * kept in `OverlayState.active` and its Actions button renders as a toggle (obs-layout-plan.md
     * §2.2). A momentary event just fires a cue and is over.
     */
    latching?: boolean
}

// `sold` and `pick2` were removed from the vocabulary on request. Anything stored against them —
// an element's `reactions`, a latched `state.active` — is stripped by migrateConfig/migrateState in
// config.ts, because the validators reject unknown event names and a rejected config falls all the
// way back to an empty default.
export const SCENE_EVENTS: SceneEventDef[] = [
    { name: 'stash_or_pass', label: 'Stash or Pass', latching: true },
]

export function isLatchingEvent(name: SceneEventName): boolean {
    return SCENE_EVENTS.find((e) => e.name === name)?.latching === true
}

const SCENE_EVENT_NAMES: readonly string[] = SCENE_EVENTS.map((e) => e.name)

export function isSceneEventName(v: unknown): v is SceneEventName {
    return typeof v === 'string' && SCENE_EVENT_NAMES.includes(v)
}
