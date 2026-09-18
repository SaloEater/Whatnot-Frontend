'use client'

// Shared data/emit hook for the OBS layout controls page (1.5) and the layout builder tab (1.6).
// See obs-layout-plan.md §1.5/§1.6 and obs-browser-event-bus.md §4-§6 for the design this
// implements.

import {useCallback, useEffect, useRef, useState} from 'react'
import {getEndpoints, isBackendFailure, post} from '@/app/lib/backend'
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

// Step between consecutive draft seqs (see `emitDraft`): 10⁻⁴ leaves 9,999 drafts per commit.
const DRAFT_SEQ_STEP = 0.0001

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
    // `loaded` is distinct from `loading`: `loading` is just "a loadAll() call is in flight" and
    // always ends up false once the request settles, success or failure. `loaded` tracks whether
    // the in-memory config/state actually reflect a real backend response — it starts false and
    // only becomes true once BOTH halves of a loadAll() succeed (a fresh channel's real
    // `{config: null}` counts; a failed fetch does not). apply/pushConfig/resendCurrent/emitDraft
    // all refuse while it's false, because those are exactly the paths that can push whatever is
    // in memory to OBS or the DB — see obs-layout-disappearing-elements-findings.md fix #2.
    const [loaded, setLoaded] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
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
    const loadedRef = useRef(loaded)
    configRef.current = config
    stateRef.current = state
    seqRef.current = seq
    loadedRef.current = loaded

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
        let configFailed = false
        let configInvalid = false
        let stateFailed = false
        try {
            const [configResp, stateResp] = await Promise.all([
                post(getEndpoints().layout_config_get, {channel_id: channelId}) as Promise<LayoutConfigGetResponse | unknown>,
                post(getEndpoints().layout_state_get, {channel_id: channelId}) as Promise<LayoutStateGetResponse | unknown>,
            ])

            // A FAILED fetch (isBackendFailure) must never be treated as "no row yet" — that
            // conflation is exactly what used to wipe a healthy in-memory config/state down to
            // defaultConfig()/defaultState() on a mere backend hiccup, which resendCurrent()/
            // apply()/pushConfig() could then push straight to OBS or persist to the DB (see
            // obs-layout-disappearing-elements-findings.md). On failure, keep whatever is already
            // in memory (configRef/stateRef.current — this render's `config`/`state` closed over
            // by the callback would be stale by the time a later loadAll() runs, refs are current)
            // and leave `loaded` false below instead.
            let nextConfig: LayoutConfig = configRef.current
            if (!isBackendFailure(configResp)) {
                const raw = (configResp as LayoutConfigGetResponse).config
                if (raw) {
                    const validated = validateConfig(migrateConfig(raw))
                    if (validated.ok) {
                        nextConfig = validated.config
                    } else {
                        // An INVALID stored config is treated exactly like a failed fetch, not
                        // like "no row": substituting defaultConfig() here would mark the hook
                        // loaded with an EMPTY config in memory, and the next OBS reconnect's
                        // resendCurrent() would blank the stream — or an element edit would
                        // pushConfig() that emptiness over the real row. Keep what we have and
                        // refuse to push until the row is fixed (fix #2 of the findings doc).
                        console.warn('[useControls] config from backend failed validation, keeping current config', validated.errors)
                        nextConfig = configRef.current
                        configFailed = true
                        configInvalid = true
                    }
                } else {
                    // A genuinely successful {config: null} — a fresh channel with no row yet —
                    // is real data, not a failure, so this DOES count as loaded below.
                    nextConfig = defaultConfig()
                }
            } else {
                configFailed = true
                console.warn('[useControls] failed to load config, keeping current in-memory config', configResp)
            }

            let nextState: OverlayState = stateRef.current
            let nextSeq = seqRef.current
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
                stateFailed = true
                console.warn('[useControls] failed to load state, keeping current in-memory state', stateResp)
            }

            // `state` and `config` are validated independently (validateState has no `stages` in
            // scope to check `phase` against — see config.ts) — reconcile the two here instead: a
            // stored phase that isn't one of THIS config's stages (the stage was deleted, or the
            // whole config was swapped) falls back to the config's first stage. Surfaced via
            // console.warn rather than silently: cheap, and matches every other correction above.
            // Runs regardless of which half (if any) failed: `nextConfig`/`nextState` are always
            // each individually valid at this point (freshly validated, or the prior in-memory
            // value which was already validated when it was set), so checking them against each
            // other is safe either way.
            if (!nextConfig.stages.some((s) => s.id === nextState.phase)) {
                console.warn(
                    `[useControls] state.phase "${nextState.phase}" is not a stage in this config, falling back to "${nextConfig.stages[0].id}"`
                )
                nextState = {...nextState, phase: nextConfig.stages[0].id}
            }

            setConfig(nextConfig)
            setState(nextState)
            setSeq(nextSeq)
            configRef.current = nextConfig
            stateRef.current = nextState
            seqRef.current = nextSeq

            if (configFailed || stateFailed) {
                setLoaded(false)
                loadedRef.current = false
                setLoadError(
                    configInvalid
                        ? 'Layout config stored for this channel is invalid — nothing will be pushed to OBS until it is fixed'
                        : configFailed && stateFailed
                            ? 'Failed to load layout config and state'
                            : configFailed
                                ? 'Failed to load layout config'
                                : 'Failed to load layout state'
                )
            } else {
                setLoaded(true)
                loadedRef.current = true
                setLoadError(null)
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
        // Refuse while the initial (or a retried) load hasn't actually succeeded — `state`/
        // `config` in memory may still be the useState() defaults, and writing those to the
        // backend would persist the emptiness (obs-layout-disappearing-elements-findings.md
        // fix #2). `loadedRef`, not `loading`: this must also block AFTER a failed reload of an
        // already-loaded page, not just before the first one finishes.
        if (!loadedRef.current) {
            return {ok: false, error: 'Layout not loaded — retry'}
        }
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

    /**
     * Emit an UNCOMMITTED config on the durable channel — nothing written, no server seq.
     *
     * Integer seqs are committed and come from the backend (`apply`/`pushConfig`). A draft rides
     * between them: `seq = N + k·10⁻⁴`, where N is the last committed seq this page knows and k
     * counts up, so the layout's `seq > last` guard accepts drafts in order and still accepts the
     * next real commit (N+1) after them — no change to the guard or the payload shape. This is
     * what makes a drag in the box editor live on OBS without a backend row per move: only the
     * release goes through `pushConfig`. The layout treats a fractional last-seen seq as "a draft
     * is live, the DB is behind" (its reconcile poll skips config while that holds).
     *
     * Deliberately does NOT touch `undelivered`/`lastEmitAt`: that banner says "changes saved,
     * layout not notified", which is false for a draft — nothing was saved. Not validated either;
     * the layout validates every payload on receipt, and a draft only ever changes a box.
     */
    const draftSeqRef = useRef(0)
    const emitDraft = useCallback((draftConfig: LayoutConfig): void => {
        // Same refusal as apply()/pushConfig()/resendCurrent() — a draft built from an unloaded
        // page's placeholder config is exactly as dangerous to put on the durable bus as a
        // committed one.
        if (!loadedRef.current) return
        const base = Math.floor(seqRef.current)
        // Continue counting within the current commit's range, or restart if a commit landed
        // since the last draft. Clamped below base+1 so a draft can never sort after the commit
        // that follows it (unreachable in practice: ~55 min of continuous dragging).
        const next = Math.min(Math.max(draftSeqRef.current, base) + DRAFT_SEQ_STEP, base + 0.9999)
        draftSeqRef.current = next
        const payload: BusPayload = {seq: next, state: stateRef.current, config: draftConfig}
        broadcastDev(DEV_CHANNEL_NAME, payload)
        if (!obs || !isConnected) return
        obs.emitBrowserEvent(BUS_EVENT_NAME, payload).catch((e) => {
            console.warn('[useControls] draft emit failed', e)
        })
    }, [obs, isConnected, broadcastDev])

    const pushConfig = useCallback(async (nextConfig: LayoutConfig): Promise<ApplyResult & { errors?: string[] }> => {
        if (!loadedRef.current) {
            return {ok: false, error: 'Layout not loaded — retry'}
        }
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
        // This is the automatic path — it fires on every OBS reconnect with no operator action —
        // so it is the one this guard matters most for: a never-loaded (or failed-reload) page
        // would otherwise emit its useState() placeholder config/state the moment OBS comes back.
        if (!loadedRef.current) {
            return {ok: false, error: 'Layout not loaded — retry'}
        }
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
        loaded,
        loadError,
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
        emitDraft,
        pushConfig,
        resendCurrent,
        reload,
    }
}
