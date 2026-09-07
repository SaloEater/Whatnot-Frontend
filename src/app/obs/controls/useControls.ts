'use client'

// Shared data/emit hook for the OBS layout controls page (1.5) and the layout builder tab (1.6).
// See obs-layout-plan.md §1.5/§1.6 and obs-browser-event-bus.md §4-§6 for the design this
// implements.

import {useCallback, useEffect, useRef, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {MyOBSWebsocket} from '@/app/entity/my_obs_websocket'
import type {BusPayload, CuePayload, DurableCue, LayoutConfig, OverlayState, TransientCue} from '@/app/obs/layout/schema'
import {BUS_CUE_EVENT_NAME, BUS_EVENT_NAME, DEV_CHANNEL_NAME, DEV_CUE_CHANNEL_NAME} from '@/app/obs/layout/schema'
import {defaultConfig, defaultState, migrateConfig, migrateState, validateConfig, validateState} from '@/app/obs/layout/config'

// 'connecting'  — an attempt is in flight right now
// 'reconnecting' — not connected, waiting out RETRY_MS before the next attempt (`nextRetryAt`)
// 'disconnected' — not connected and NOT trying, i.e. the operator pressed Stop trying (or the URL
//                  has not been restored from localStorage yet, which lasts one render)
export type ConnectionStatus = 'connected' | 'connecting' | 'reconnecting' | 'disconnected'

// Fixed, deliberately — not exponential backoff. The dominant case is "operator opens the controls
// page, then starts OBS", and backing off would leave them staring at a page that has given up on
// something they are looking straight at. A short constant interval plus a visible countdown is
// both cheaper to reason about and more honest than a growing delay nobody can predict.
const RETRY_MS = 5000

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

/**
 * @param canConnect gate for the auto-connect loop. The controls page passes `false` until the
 *   saved OBS URL has been read out of localStorage: `url` starts at its hardcoded default and is
 *   replaced in an effect, so connecting immediately would dial the default, then build a SECOND
 *   socket when the real URL arrives.
 */
export function useControls(
    channelId: number,
    obs: MyOBSWebsocket | null,
    isConnected: boolean,
    canConnect: boolean = true
) {
    const [config, setConfig] = useState<LayoutConfig>(() => defaultConfig())
    const [state, setState] = useState<OverlayState>(() => defaultState())
    const [seq, setSeq] = useState(0)
    const [loading, setLoading] = useState(true)
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')
    // When the next automatic attempt fires (epoch ms), so the UI can count down to it; null while
    // connected, while an attempt is in flight, or while retrying is switched off.
    const [nextRetryAt, setNextRetryAt] = useState<number | null>(null)
    // Consecutive failures since the last success — shown so a long amber spell reads as "still
    // trying, 40 times now" rather than "possibly wedged".
    const [attempts, setAttempts] = useState(0)
    const [lastConnectError, setLastConnectError] = useState<string | null>(null)
    // The operator's manual off switch. Nothing sets this back to true except them.
    const [retryEnabled, setRetryEnabled] = useState(true)
    // Bumped by retryNow() to make the connect effect re-run and attempt immediately.
    const [retryNonce, setRetryNonce] = useState(0)
    const [lastEmitAt, setLastEmitAt] = useState<Date | null>(null)

    // Refs so apply()/pushConfig() always see the latest value without re-creating the callback
    // (and without a stale closure over `config`/`state` from the render that defined them).
    const [undelivered, setUndelivered] = useState<string | null>(null)

    const configRef = useRef(config)
    const stateRef = useRef(state)
    const seqRef = useRef(seq)
    configRef.current = config
    stateRef.current = state
    seqRef.current = seq

    // Dev BroadcastChannels, keyed by channel name and lazily opened on first use: the transient
    // cue channel fires on a 1Hz heartbeat for as long as a card highlight is held (CardsSettings'
    // HIGHLIGHT_HEARTBEAT_MS), so opening/closing a channel per emit would churn one every second.
    // Closed on unmount below — a channel never delivers a sender's own messages back to itself,
    // and nothing here attaches an onmessage handler, so holding one open in the meantime is safe.
    const channelsRef = useRef<Map<string, BroadcastChannel>>(new Map())

    const broadcastDev = useCallback((channelName: string, payload: BusPayload | CuePayload) => {
        try {
            let bc = channelsRef.current.get(channelName)
            if (!bc) {
                bc = new BroadcastChannel(channelName)
                channelsRef.current.set(channelName, bc)
            }
            bc.postMessage(payload)
        } catch (e) {
            console.warn('[useControls] BroadcastChannel unavailable', e)
        }
    }, [])

    useEffect(() => {
        const channels = channelsRef.current
        return () => {
            channels.forEach((bc) => bc.close())
            channels.clear()
        }
    }, [])

    const loadAll = useCallback(async () => {
        setLoading(true)
        try {
            const [configResp, stateResp] = await Promise.all([
                post(getEndpoints().layout_config_get, {channel_id: channelId}) as Promise<LayoutConfigGetResponse | unknown>,
                post(getEndpoints().layout_state_get, {channel_id: channelId}) as Promise<LayoutStateGetResponse | unknown>,
            ])

            let nextConfig: LayoutConfig
            if (!isBackendFailure(configResp)) {
                const raw = (configResp as LayoutConfigGetResponse).config
                if (raw) {
                    const validated = validateConfig(migrateConfig(raw))
                    nextConfig = validated.ok ? validated.config : defaultConfig()
                    if (!validated.ok) {
                        console.warn('[useControls] config from backend failed validation, using default', validated.errors)
                    }
                } else {
                    nextConfig = defaultConfig()
                }
            } else {
                console.warn('[useControls] failed to load config, using default', configResp)
                nextConfig = defaultConfig()
            }

            let nextState: OverlayState
            let nextSeq = 0
            if (!isBackendFailure(stateResp)) {
                const resp = stateResp as LayoutStateGetResponse
                if (resp.state) {
                    const validated = validateState(migrateState(resp.state))
                    nextState = validated.ok ? validated.state : defaultState()
                    if (!validated.ok) {
                        console.warn('[useControls] state from backend failed validation, using default', validated.errors)
                    }
                } else {
                    nextState = defaultState()
                }
                nextSeq = typeof resp.seq === 'number' ? resp.seq : 0
            } else {
                console.warn('[useControls] failed to load state, using default', stateResp)
                nextState = defaultState()
                nextSeq = 0
            }

            // `state` and `config` are validated independently (validateState has no `stages` in
            // scope to check `phase` against — see config.ts) — reconcile the two here instead: a
            // stored phase that isn't one of THIS config's stages (the stage was deleted, or the
            // whole config was swapped) falls back to the config's first stage. Surfaced via
            // console.warn rather than silently: cheap, and matches every other correction above.
            if (!nextConfig.stages.some((s) => s.id === nextState.phase)) {
                console.warn(
                    `[useControls] state.phase "${nextState.phase}" is not a stage in this config, falling back to "${nextConfig.stages[0].id}"`
                )
                nextState = {...nextState, phase: nextConfig.stages[0].id}
            }

            setConfig(nextConfig)
            setState(nextState)
            setSeq(nextSeq)
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
        broadcastDev(DEV_CHANNEL_NAME, payload)
        setLastEmitAt(new Date())

        // `undelivered` is sticky: it is raised by any emit that does not reach OBS and cleared by
        // the next one that does. That means it survives across however many changes are made
        // while the socket is down, and clears itself on the reconnect resend without anyone
        // having to dismiss it.
        if (!obs || !isConnected) {
            const warning = 'OBS not connected — changes saved, layout not notified'
            setUndelivered(warning)
            return {ok: true, warning}
        }

        try {
            await obs.emitBrowserEvent(BUS_EVENT_NAME, payload)
            setUndelivered(null)
            return {ok: true}
        } catch (e) {
            const warning = `OBS not reachable — changes saved, layout not notified (${describeError(e)})`
            setUndelivered(warning)
            return {ok: true, warning}
        }
    }, [obs, isConnected, broadcastDev])

    const apply = useCallback(async (nextState: OverlayState, cue?: DurableCue): Promise<ApplyResult> => {
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

    /**
     * Re-send the current state+config without touching the backend. Used when obs-websocket comes
     * up: anything changed while it was down was saved but never emitted, so the layout is behind
     * until its own 60s reconcile poll catches it.
     *
     * Deliberately reuses the CURRENT seq rather than bumping it through apply(). If the layout
     * already has this seq — it reloaded and read the state itself — its guard drops the payload,
     * which is exactly right: it is already up to date. If it is behind, its last seq is lower and
     * the payload lands. Bumping the seq would work too but would write to the backend on every
     * reconnect for nothing.
     */
    const resendCurrent = useCallback(async (): Promise<ApplyResult> => {
        return emit({seq: seqRef.current, state: stateRef.current, config: configRef.current})
    }, [emit])

    /**
     * Fire-and-forget cue on the TRANSIENT channel (schema.ts's BUS_CUE_EVENT_NAME): no backend
     * write, no `seq` bump, no state or config in the payload. For signals that are meaningless a
     * moment later — today the card-hover highlight (obs-layout-plan.md §2.8) — where routing
     * through `apply()` would mean a database row per mouse move.
     *
     * Deliberately does NOT touch `lastEmitAt` or `undelivered`. Those describe whether the
     * layout's durable state is in sync; a hover that missed OBS is not a change anyone needs to
     * be warned about, and raising the sticky banner for one would make it meaningless.
     */
    const cueSeqRef = useRef<number | null>(null)
    const emitCue = useCallback((cue: TransientCue): void => {
        // Seeded from the clock on first use, not at module scope: it must not run during SSR, and
        // it has to sit above whatever a previous life of this page sent (see schema.ts).
        if (cueSeqRef.current === null) cueSeqRef.current = Date.now()
        const payload: CuePayload = {n: ++cueSeqRef.current, cue}

        broadcastDev(DEV_CUE_CHANNEL_NAME, payload)
        if (!obs || !isConnected) return
        obs.emitBrowserEvent(BUS_CUE_EVENT_NAME, payload).catch((e) => {
            console.warn('[useControls] cue emit failed', e)
        })
    }, [obs, isConnected, broadcastDev])

    const setConfigLocal = useCallback((nextConfig: LayoutConfig) => {
        setConfig(nextConfig)
        configRef.current = nextConfig
    }, [])

    const reload = useCallback(() => loadAll(), [loadAll])

    // Reconnect: obs-websocket-js's OBSWebSocket is an EventEmitter, so this listener coexists
    // fine with MyOBSWebsocket's own internal ConnectionClosed handler.
    const wasConnectedRef = useRef(isConnected)
    useEffect(() => {
        if (isConnected) {
            setConnectionStatus('connected')
            setNextRetryAt(null)
            setAttempts(0)
            setLastConnectError(null)
        }
        // Rising edge only: catch the layout up on everything applied while the socket was down.
        // Not on every render, and not while still disconnected (emit would no-op anyway).
        const wasConnected = wasConnectedRef.current
        wasConnectedRef.current = isConnected
        if (isConnected && !wasConnected && !loading) {
            void resendCurrent()
        }
    }, [isConnected, loading, resendCurrent])

    /**
     * Keep the socket connected, without anyone having to press anything.
     *
     * This used to be two mechanisms: a Connect button for the first connection, and a retry loop
     * armed by `ConnectionClosed` for later drops. That left a hole — `ConnectionClosed` only fires
     * for a connection that once existed, so if OBS was not running when the page opened, the click
     * failed silently and NOTHING retried. The operator had to keep pressing Connect until it took.
     *
     * One loop now covers both: attempt -> connected? stop : wait RETRY_MS -> attempt, armed on
     * mount and re-armed by `ConnectionClosed`. `connect()` resolves either way (it swallows its
     * own errors), so success is read from `isConnected()` afterwards rather than from the promise.
     */
    useEffect(() => {
        if (!obs || !canConnect || !retryEnabled) return
        let stopped = false
        let timer: ReturnType<typeof setTimeout> | null = null

        // Exactly one attempt in flight and at most one timer pending, always. Both invariants are
        // load-bearing: a single FAILED attempt triggers scheduleRetry() twice — once from the
        // finally below, and once from `ConnectionClosed`, which obs-websocket emits for a failed
        // connection attempt and not only for an established one dropping. Without the guards each
        // failure left two pending timers instead of one, so attempts doubled every RETRY_MS: the
        // countdown never landed and the failure counter ran to six figures within a couple of
        // minutes.
        let inFlight = false

        function clearTimer() {
            if (timer) {
                clearTimeout(timer)
                timer = null
            }
        }

        function attempt() {
            if (stopped || !obs || inFlight) return
            clearTimer()
            if (obs.isConnected()) return
            inFlight = true
            setConnectionStatus('connecting')
            setNextRetryAt(null)
            obs.connect().finally(() => {
                inFlight = false
                if (stopped || !obs) return
                if (obs.isConnected()) return // the isConnected effect above owns the happy path
                setAttempts((n) => n + 1)
                setLastConnectError(obs.lastError)
                scheduleRetry()
            })
        }

        function scheduleRetry() {
            // While an attempt is in flight its own finally() will schedule the next wait; a
            // ConnectionClosed arriving mid-attempt must not add a second one.
            if (stopped || inFlight) return
            clearTimer()
            setConnectionStatus('reconnecting')
            setNextRetryAt(Date.now() + RETRY_MS)
            timer = setTimeout(attempt, RETRY_MS)
        }

        function onClosed() {
            if (stopped) return
            scheduleRetry()
        }

        obs.webSocket.on('ConnectionClosed', onClosed)
        // Don't dial a socket that is already up: this effect also re-runs on retryNow().
        if (!obs.isConnected()) attempt()

        return () => {
            stopped = true
            clearTimer()
            obs.webSocket.off('ConnectionClosed', onClosed)
        }
    }, [obs, canConnect, retryEnabled, retryNonce])

    /** Skip the remaining wait and attempt right now. */
    const retryNow = useCallback(() => {
        setRetryEnabled(true)
        setRetryNonce((n) => n + 1)
    }, [])

    /** Stop the automatic loop until the operator asks for it again (retryNow re-enables it). */
    const stopRetrying = useCallback(() => {
        setRetryEnabled(false)
        setNextRetryAt(null)
        setConnectionStatus((prev) => (prev === 'connected' ? prev : 'disconnected'))
    }, [])

    return {
        config,
        state,
        seq,
        loading,
        connectionStatus,
        nextRetryAt,
        attempts,
        lastConnectError,
        retryEnabled,
        retryNow,
        stopRetrying,
        lastEmitAt,
        undelivered,
        setConfigLocal,
        apply,
        emitCue,
        pushConfig,
        resendCurrent,
        reload,
    }
}
