'use client'

// `useSceneEvent()` (obs-layout-plan.md §1.9): lets a registry component react to a semantic
// scene event (sceneEvents.ts) fired from the controls page's Actions strip (or the ?dev=1 dev
// panel — see [id]/DevPanel.tsx), filtered by that element's effective reactions
// (config.ts `effectiveReactions()`, registry.ts `reactsTo`).
//
// Built on cueBus.tsx's generic subscribe/emit rather than a separate dispatch path: the layout
// page already calls `cueBus.emit(payload.cue)` for every cue it accepts off the bus (including
// `event` ones), and the dev panel's event buttons emit through that exact same `cueBus.emit` —
// so "fired from OBS" and "fired from the dev panel" are indistinguishable to a subscriber here.

import { useEffect, useRef } from 'react'
import { useCueBus } from './cueBus'
import { useLayoutData } from './useLayoutData'
import { effectiveReactions } from './config'
import type { SceneEventName } from './sceneEvents'

export function useSceneEvent(
    elementKey: string,
    name: SceneEventName,
    handler: (params?: Record<string, unknown>) => void
) {
    const cueBus = useCueBus()
    const { config } = useLayoutData()

    // Ref so a handler re-created every render (the common case — an inline arrow function) never
    // forces a resubscribe; only a change to elementKey/name/config identity does.
    const handlerRef = useRef(handler)
    handlerRef.current = handler

    useEffect(() => {
        return cueBus.subscribe((cue) => {
            if (cue.kind !== 'event' || cue.name !== name) return
            const element = config.elements[elementKey]
            if (!element) return
            if (!effectiveReactions(element).includes(name)) return
            handlerRef.current(cue.params)
        })
    }, [cueBus, config, elementKey, name])
}
