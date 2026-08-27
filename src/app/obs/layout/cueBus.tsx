'use client'

// Small in-page pub/sub so a `cue` riding a validated BusPayload (see bus.ts / schema.ts) can
// reach subscribers other than the layout page itself — today that's just the data spine
// (useLayoutData.tsx maps `photos-changed` / `refetch` cues to `refetch(key)`), but it's a
// generic subscribe/emit pair so Phase 2 elements can listen for their own cue kinds too.
//
// Deliberately separate from LayoutDataProvider: the layout page's bus listener (which knows
// about `parseBusPayload`/the seq guard) is the only thing that should call `emit`, while
// anything downstream (starting with the data spine) only ever needs `subscribe`.

import {createContext, ReactNode, useCallback, useContext, useMemo, useRef} from 'react'
import type {BusPayload} from './schema'

export type Cue = NonNullable<BusPayload['cue']>
export type CueListener = (cue: Cue) => void

export type CueBusApi = {
    subscribe: (fn: CueListener) => () => void
    emit: (cue: Cue) => void
}

const CueBusContext = createContext<CueBusApi | null>(null)

export function CueBusProvider({children}: {children: ReactNode}) {
    const listenersRef = useRef<Set<CueListener>>(new Set())

    const subscribe = useCallback((fn: CueListener) => {
        listenersRef.current.add(fn)
        return () => {
            listenersRef.current.delete(fn)
        }
    }, [])

    const emit = useCallback((cue: Cue) => {
        listenersRef.current.forEach((fn) => fn(cue))
    }, [])

    const api = useMemo<CueBusApi>(() => ({subscribe, emit}), [subscribe, emit])

    return <CueBusContext.Provider value={api}>{children}</CueBusContext.Provider>
}

export function useCueBus(): CueBusApi {
    const ctx = useContext(CueBusContext)
    if (!ctx) {
        throw new Error('useCueBus() must be used within a <CueBusProvider>')
    }
    return ctx
}
