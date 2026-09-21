'use client'

// Tiny intra-scene pub/sub (obs-scene-element-plan.md §2.4) — copies the SHAPE of ../../cueBus.tsx
// but is deliberately a separate channel, not a reuse of it: cueBus.tsx carries operator cues from
// the layout page's own bus listeners down to every element; this one carries signals from one
// scene EFFECT to another (lightning lighting the mountain, iteration 2 — obs-scene-element-plan.md
// §5) and never leaves the `scene` element's own subtree. Effects never read each other's React
// state directly (§1.3); this is the one channel that lets them coordinate anyway.
//
// Iteration 1 creates the shape with one message so `effectRegistry.ts`'s `EffectProps.cue` has
// something real to type against and every effect component already receives a working `cue` prop;
// iteration 2 is the first real publisher (LightningEffect) and subscriber (MountainEffect).

import { createContext, ReactNode, useCallback, useContext, useMemo, useRef } from 'react'

export type SceneCue =
    | { kind: 'flash'; strength: number } // lightning -> mountain lit variant (iteration 2)
    // `thunder` scene event -> lightning effect (obs-scene-element-plan.md §5): SceneElement.tsx's
    // `useSceneEvent(elementKey, 'thunder', …)` emits this on the SAME scene-cue channel rather
    // than an imperative ref (the plan's own note on why: it keeps EFFECT_REGISTRY uniform — every
    // effect component has the same `{box, effect, quality, cue}` props, no opt-in imperative
    // handle). The lightning effect subscribes and calls its own `flash()`, which in turn emits the
    // `flash` cue above for the mountain.
    | { kind: 'strike' }

export type SceneCueListener = (cue: SceneCue) => void

export type SceneCueApi = {
    subscribe: (fn: SceneCueListener) => () => void
    emit: (cue: SceneCue) => void
}

const SceneCueContext = createContext<SceneCueApi | null>(null)

export function SceneCueProvider({ children }: { children: ReactNode }) {
    const listenersRef = useRef<Set<SceneCueListener>>(new Set())

    const subscribe = useCallback((fn: SceneCueListener) => {
        listenersRef.current.add(fn)
        return () => {
            listenersRef.current.delete(fn)
        }
    }, [])

    const emit = useCallback((cue: SceneCue) => {
        listenersRef.current.forEach((fn) => fn(cue))
    }, [])

    const api = useMemo<SceneCueApi>(() => ({ subscribe, emit }), [subscribe, emit])

    return <SceneCueContext.Provider value={api}>{children}</SceneCueContext.Provider>
}

export function useSceneCue(): SceneCueApi {
    const ctx = useContext(SceneCueContext)
    if (!ctx) {
        throw new Error('useSceneCue() must be used within a <SceneCueProvider>')
    }
    return ctx
}
