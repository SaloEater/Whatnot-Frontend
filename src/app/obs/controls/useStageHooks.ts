'use client'

// The stage-hooks RUNNER (obs-camera-shelf-plan.md §5.2) — mounts/tears down every registry
// entry's `mount` function (registry.ts's `RegistryEntry.mount`, stageHooks.ts's contract) as
// `config.elements` changes identity, and emits `stageOut`/`stageIn` events to them around a stage
// change. Lives on the controls page only — see stageHooks.ts's header comment for why.

import { useCallback, useEffect, useRef } from 'react'
import type { LayoutConfig, OverlayState, Phase } from '@/app/obs/layout/schema'
import { isEffectivelyVisible, resolveBox } from '@/app/obs/layout/config'
import { REGISTRY } from '@/app/obs/layout/registry'
import { registryIdOf } from '@/app/obs/layout/elementId'
import type { MountContext, StageHookBus, StageHookEvent } from '@/app/obs/layout/stageHooks'
import type { MyOBSWebsocket } from '@/app/entity/my_obs_websocket'

type Listener = (e: StageHookEvent) => void | Promise<void>

type MountedEntry = {
    listeners: Record<StageHookEvent['type'], Listener[]>
    teardown: (() => void) | void
}

/** A fresh, per-element bus (each mounted element gets its own — see the header comment) plus the
 *  raw listener lists the runner reads directly to build/emit events, without going back through
 *  `bus.on` itself. */
function makeBus(): { bus: StageHookBus; listeners: MountedEntry['listeners'] } {
    const listeners: MountedEntry['listeners'] = { stageOut: [], stageIn: [] }
    const bus: StageHookBus = {
        on(type, handler) {
            listeners[type].push(handler)
            return () => {
                listeners[type] = listeners[type].filter((h) => h !== handler)
            }
        },
    }
    return { bus, listeners }
}

// obs-camera-shelf-plan.md §5.2: "each awaited inside its own try/catch with a 5s timeout".
const HANDLER_TIMEOUT_MS = 5000

function withTimeout(result: void | Promise<void>, ms: number): Promise<void> {
    if (!(result instanceof Promise)) return Promise.resolve()
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
        result.then(
            (v) => {
                clearTimeout(timer)
                resolve(v)
            },
            (e) => {
                clearTimeout(timer)
                reject(e)
            }
        )
    })
}

/** Presence at `(key, phase)`, computed against a `{...state, phase}` copy so a mount whose
 *  visibility logic ever cared about the applied phase would see the phase it is ABOUT to be
 *  applied under, not whatever the hook happened to render with (obs-camera-shelf-plan.md §5.2).
 *  `isEffectivelyVisible` itself does not key off phase today, but computing it this way keeps the
 *  call site matching the spec's stated intent rather than relying on that incidental fact. */
function presentAt(config: LayoutConfig, state: OverlayState, key: string, phase: Phase | null): boolean {
    if (phase === null) return false
    const element = config.elements[key]
    if (!element) return false
    if (resolveBox(element, phase) === undefined) return false
    return isEffectivelyVisible(config, { ...state, phase }, key)
}

export type StageHooksApi = {
    emitOut: (from: Phase | null, to: Phase) => Promise<void>
    emitIn: (from: Phase | null, to: Phase) => Promise<void>
}

export function useStageHooks({
    config,
    state,
    obs,
    isConnected,
    log,
}: {
    config: LayoutConfig
    state: OverlayState
    obs: MyOBSWebsocket | null
    isConnected: boolean
    log: (line: string) => void
}): StageHooksApi {
    // Getters, not values (stageHooks.ts's MountContext) — a mount function closes over these once
    // and must still see the LATEST connection/log without being re-mounted for it.
    const obsRef = useRef(obs)
    const isConnectedRef = useRef(isConnected)
    const logRef = useRef(log)
    obsRef.current = obs
    isConnectedRef.current = isConnected
    logRef.current = log

    // Insertion order = mount order (a plain Map preserves it), read by `emit` below so handlers
    // fire in mount order as obs-camera-shelf-plan.md §5.2 specifies.
    const mountedRef = useRef<Map<string, MountedEntry>>(new Map())

    // Mount/teardown whenever `config.elements` changes IDENTITY (obs-camera-shelf-plan.md §5.2).
    // Config pushes happen on every settings keystroke, so this must stay cheap and side-effect
    // free — mounting fires no events, it only builds closures (see mountObsToggle,
    // obs-visibility-toggle-plan.md).
    useEffect(() => {
        const next = new Map<string, MountedEntry>()
        for (const [key, element] of Object.entries(config.elements)) {
            const mountFn = REGISTRY[registryIdOf(element)].mount
            if (!mountFn) continue
            const { bus, listeners } = makeBus()
            const ctx: MountContext = {
                elementKey: key,
                element,
                bus,
                obs: () => obsRef.current,
                isConnected: () => isConnectedRef.current,
                log: (line: string) => logRef.current(line),
            }
            const teardown = mountFn(ctx)
            next.set(key, { listeners, teardown })
        }
        mountedRef.current = next

        return () => {
            next.forEach((entry) => {
                try {
                    entry.teardown?.()
                } catch (e) {
                    logRef.current(`[hooks] teardown failed: ${e instanceof Error ? e.message : String(e)}`)
                }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config.elements])

    const emit = useCallback(
        async (type: StageHookEvent['type'], from: Phase | null, to: Phase) => {
            // `Array.from(...entries())` rather than iterating the Map directly: this repo's `tsc`
            // target doesn't have native Map iteration on without `--downlevelIteration`, and an
            // array preserves the same insertion (= mount) order a Map guarantees.
            for (const [key, entry] of Array.from(mountedRef.current.entries())) {
                const handlers = entry.listeners[type]
                if (handlers.length === 0) continue
                const event: StageHookEvent = {
                    type,
                    from,
                    to,
                    presentInFrom: presentAt(config, state, key, from),
                    presentInTo: presentAt(config, state, key, to),
                }
                for (const handler of handlers) {
                    try {
                        await withTimeout(handler(event), HANDLER_TIMEOUT_MS)
                    } catch (e) {
                        logRef.current(`[hooks] ${key} ${type}: ${e instanceof Error ? e.message : String(e)}`)
                    }
                }
            }
        },
        [config, state]
    )

    const emitOut = useCallback((from: Phase | null, to: Phase) => emit('stageOut', from, to), [emit])
    const emitIn = useCallback((from: Phase | null, to: Phase) => emit('stageIn', from, to), [emit])

    return { emitOut, emitIn }
}
