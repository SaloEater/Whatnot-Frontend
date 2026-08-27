'use client'

// Exposes `OverlayState.active` (obs-layout-plan.md §2.2 / schema.ts) to registry components so
// an element can tell whether a *latching* scene event (sceneEvents.ts `isLatchingEvent()`) is
// currently ON — e.g. `stash_or_pass`, which stays up until the operator toggles it off and can
// outlive a browser-source reload. Mirrors the resolvedBoxes.tsx / sceneEventBus.tsx pattern:
// a small context, populated once per render by `LayoutStageContent` ([id]/page.tsx) from the
// same `state` it already has, and a single hook for components to read it.
//
// Deliberately NOT the whole `OverlayState` (obs-layout-plan.md §2.2 spec explicitly calls this
// out) — components should not get a back door into `phase`/`phaseData`/`overrides`, all of
// which they already receive through their own props or useLayoutData().

import { createContext, ReactNode, useContext, useMemo } from 'react'
import type { OverlayState } from './schema'
import type { SceneEventName } from './sceneEvents'

// Wrapped in an object (rather than storing `OverlayState['active']` directly) so `undefined`
// active (no latching event ever toggled on) is distinguishable from "no provider" — same trick
// resolvedBoxes.tsx uses a Map for.
type EventActiveCtx = { active: OverlayState['active'] }

const EventActiveContext = createContext<EventActiveCtx | null>(null)

export function EventActiveProvider({
    active,
    children,
}: {
    active: OverlayState['active']
    children: ReactNode
}) {
    const value = useMemo<EventActiveCtx>(() => ({ active }), [active])
    return <EventActiveContext.Provider value={value}>{children}</EventActiveContext.Provider>
}

export function useEventActive(name: SceneEventName): boolean {
    const ctx = useContext(EventActiveContext)
    if (!ctx) {
        throw new Error('useEventActive() must be used within an <EventActiveProvider>')
    }
    return ctx.active?.[name] === true
}
