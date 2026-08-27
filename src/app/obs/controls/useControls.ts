'use client'

// Shared data/emit hook for the OBS layout controls page (1.5) and the layout builder tab (1.6).
// See obs-layout-plan.md §1.5/§1.6 and obs-browser-event-bus.md §4-§6 for the design this
// implements.

import {useCallback, useEffect, useRef, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {MyOBSWebsocket} from '@/app/entity/my_obs_websocket'
import type {BusPayload, LayoutConfig, OverlayState} from '@/app/obs/layout/schema'
import {BUS_EVENT_NAME, DEV_CHANNEL_NAME} from '@/app/obs/layout/schema'
import {defaultConfig, defaultState, migrateConfig, migrateState, validateConfig, validateState} from '@/app/obs/layout/config'

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected'

export type ApplyResult = { ok: boolean; warning?: string; error?: string }

interface LayoutConfigGetResponse {
    config: LayoutConfig | null
}

interface LayoutStateGetResponse {
    seq: number
    state: OverlayState | null
}

interface LayoutStateUpdateResponse {
    seq: number
    state: OverlayState
}

function isBackendFailure(resp: unknown): boolean {
    // post()/get() swallow network errors into {error: ...}; a well-formed backend reply never
    // carries a top-level `error` key (that lives one level up, in the envelope post() already
    // unwrapped). Anything that isn't a plain object at all is also a failure.
    if (resp === null || typeof resp !== 'object') return true
    return 'error' in (resp as Record<string, unknown>) && Object.keys(resp as object).length === 1
}

function describeError(e: unknown): string {
    if (e instanceof Error) return e.message
    try {
        return JSON.stringify(e)
    } catch {
        return String(e)
    }
}

function broadcastDev(payload: BusPayload) {
    try {
        const bc = new BroadcastChannel(DEV_CHANNEL_NAME)
        bc.postMessage(payload)
        bc.close()
    } catch (e) {
        console.warn('[useControls] BroadcastChannel unavailable', e)
    }
}

export function useControls(channelId: number, obs: MyOBSWebsocket | null, isConnected: boolean) {
    const [config, setConfig] = useState<LayoutConfig>(() => defaultConfig())
    const [state, setState] = useState<OverlayState>(() => defaultState())
    const [seq, setSeq] = useState(0)
    const [loading, setLoading] = useState(true)
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
    const [lastEmitAt, setLastEmitAt] = useState<Date | null>(null)

    // Refs so apply()/pushConfig() always see the latest value without re-creating the callback
    // (and without a stale closure over `config`/`state` from the render that defined them).
    const configRef = useRef(config)
    const stateRef = useRef(state)
    configRef.current = config
    stateRef.current = state

    const loadAll = useCallback(async () => {
        setLoading(true)
        try {
            const [configResp, stateResp] = await Promise.all([
                post(getEndpoints().layout_config_get, {channel_id: channelId}) as Promise<LayoutConfigGetResponse | unknown>,
                post(getEndpoints().layout_state_get, {channel_id: channelId}) as Promise<LayoutStateGetResponse | unknown>,
            ])

            if (!isBackendFailure(configResp)) {
                const raw = (configResp as LayoutConfigGetResponse).config
                if (raw) {
                    const validated = validateConfig(migrateConfig(raw))
                    setConfig(validated.ok ? validated.config : defaultConfig())
                    if (!validated.ok) {
                        console.warn('[useControls] config from backend failed validation, using default', validated.errors)
                    }
                } else {
                    setConfig(defaultConfig())
                }
            } else {
                console.warn('[useControls] failed to load config, using default', configResp)
                setConfig(defaultConfig())
            }

            if (!isBackendFailure(stateResp)) {
                const resp = stateResp as LayoutStateGetResponse
                if (resp.state) {
                    const validated = validateState(migrateState(resp.state))
                    setState(validated.ok ? validated.state : defaultState())
                    if (!validated.ok) {
                        console.warn('[useControls] state from backend failed validation, using default', validated.errors)
                    }
                } else {
                    setState(defaultState())
                }
                setSeq(typeof resp.seq === 'number' ? resp.seq : 0)
            } else {
                console.warn('[useControls] failed to load state, using default', stateResp)
                setState(defaultState())
                setSeq(0)
            }
        } finally {
            setLoading(false)
        }
    }, [channelId])

    useEffect(() => {
        loadAll()
    }, [loadAll])

    // Emits the current (post-update) state+config over the bus, per obs-browser-event-bus.md §4:
    // always post to the dev BroadcastChannel, and additionally go over obs-websocket when
    // connected. Never the sole source of truth on the layout side — it always also polls.
    const emit = useCallback(async (payload: BusPayload): Promise<ApplyResult> => {
        broadcastDev(payload)
        setLastEmitAt(new Date())

        if (!obs || !isConnected) {
            return {ok: true, warning: 'OBS not connected — state saved, layout not notified'}
        }

        try {
            await obs.emitBrowserEvent(BUS_EVENT_NAME, payload)
            return {ok: true}
        } catch (e) {
            return {ok: true, warning: `OBS not connected — state saved, layout not notified (${describeError(e)})`}
        }
    }, [obs, isConnected])

    const apply = useCallback(async (nextState: OverlayState, cue?: BusPayload['cue']): Promise<ApplyResult> => {
        const validated = validateState(nextState)
        if (!validated.ok) {
            return {ok: false, error: `Invalid state: ${validated.errors.join('; ')}`}
        }

        let resp: unknown
        try {
            resp = await post(getEndpoints().layout_state_update, {channel_id: channelId, state: validated.state})
        } catch (e) {
            return {ok: false, error: `Failed to save state: ${describeError(e)}`}
        }

        if (isBackendFailure(resp) || typeof (resp as LayoutStateUpdateResponse)?.seq !== 'number') {
            return {ok: false, error: 'Failed to save state: backend error'}
        }

        const {seq: newSeq, state: savedState} = resp as LayoutStateUpdateResponse
        const nextEffectiveState = savedState ?? validated.state
        setState(nextEffectiveState)
        stateRef.current = nextEffectiveState
        setSeq(newSeq)

        const payload: BusPayload = {seq: newSeq, state: nextEffectiveState, config: configRef.current, cue}
        return emit(payload)
    }, [channelId, emit])

    const pushConfig = useCallback(async (nextConfig: LayoutConfig): Promise<ApplyResult & { errors?: string[] }> => {
        const validated = validateConfig(nextConfig)
        if (!validated.ok) {
            return {ok: false, error: `Invalid config: ${validated.errors.join('; ')}`, errors: validated.errors}
        }

        let resp: unknown
        try {
            resp = await post(getEndpoints().layout_config_update, {channel_id: channelId, config: validated.config})
        } catch (e) {
            return {ok: false, error: `Failed to save config: ${describeError(e)}`}
        }

        if (isBackendFailure(resp)) {
            return {ok: false, error: 'Failed to save config: backend error'}
        }

        setConfig(validated.config)
        configRef.current = validated.config

        // A config push needs a fresh seq to be noticed as "new" by the layout's seq guard, so
        // re-post the (unchanged) current state through the same path as apply() — this is the
        // mechanism obs-layout-plan.md §1.6 calls out explicitly.
        return apply(stateRef.current)
    }, [channelId, apply])

    const setConfigLocal = useCallback((nextConfig: LayoutConfig) => {
        setConfig(nextConfig)
        configRef.current = nextConfig
    }, [])

    const reload = useCallback(() => loadAll(), [loadAll])

    // Reconnect: obs-websocket-js's OBSWebSocket is an EventEmitter, so this listener coexists
    // fine with MyOBSWebsocket's own internal ConnectionClosed handler.
    useEffect(() => {
        if (isConnected) {
            setConnectionStatus('connected')
        }
    }, [isConnected])

    useEffect(() => {
        if (!obs) return
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | null = null

        function scheduleRetry() {
            if (stopped) return
            timer = setTimeout(() => {
                if (stopped || !obs) return
                obs.connect().finally(() => {
                    if (stopped) return
                    if (!obs.isConnected()) scheduleRetry()
                })
            }, 5000)
        }

        function onClosed() {
            if (stopped) return
            setConnectionStatus('reconnecting')
            scheduleRetry()
        }

        obs.webSocket.on('ConnectionClosed', onClosed)

        return () => {
            stopped = true
            if (timer) clearTimeout(timer)
            obs.webSocket.off('ConnectionClosed', onClosed)
        }
    }, [obs])

    return {
        config,
        state,
        seq,
        loading,
        connectionStatus,
        lastEmitAt,
        setConfigLocal,
        apply,
        pushConfig,
        reload,
    }
}
