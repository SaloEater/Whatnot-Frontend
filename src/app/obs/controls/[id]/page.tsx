'use client'

import React, {useEffect, useRef, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {WNBreak} from '@/app/entity/entities'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {useOSBWebhook} from '@/app/component/useOSBWebhook'
import {ComponentLogger} from '@/app/entity/logger'
import {WebSocketUrlComponent} from '@/app/obs/manage/[id]/web_socket_url_component'
import {ConnectedComponent} from '@/app/obs/manage/[id]/connected_component'
import {ApplyResult, useControls} from '@/app/obs/controls/useControls'
import type {BusPayload, OverlayState, Phase} from '@/app/obs/layout/schema'
import {PHASE_LABELS, PHASES} from '@/app/obs/layout/schema'
import {isEventActive} from '@/app/obs/layout/config'
import {useDeckBridge} from '@/app/obs/controls/useDeckBridge'
import {useKeepAwake} from '@/app/obs/controls/useKeepAwake'
import {SCENE_EVENTS, isLatchingEvent} from '@/app/obs/layout/sceneEvents'
import type {SceneEventName} from '@/app/obs/layout/sceneEvents'
import {TabsComponent} from '@/app/component/tabsComponent'
import ElementsPanel from '@/app/obs/controls/elements/ElementsPanel'
import '../controls.css'

// How long the "Sent!" flash lasts on an Actions strip button after it fires (obs-layout-plan.md
// §1.9: "Brief visual feedback (button flashes / 'sent' for ~1 s)").
const ACTION_FEEDBACK_MS = 1000

const OBS_WS_URL = 'OBS_WS_URL'

type TransitionPending = { phase: Phase }

export default function Page({params}: { params: { id: string } }) {
    const channelId = parseInt(params.id)
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)
    const [breakObj, setBreakObj] = useState<WNBreak | null>(null)

    const [url, setUrl] = useState('ws://localhost:4455')
    const [logger] = useState(() => new ComponentLogger())
    const [isConnected, setIsConnected] = useState(false)
    const obs = useOSBWebhook(url, logger, setIsConnected)

    const controls = useControls(channelId, obs, isConnected)
    const [notice, setNotice] = useState<{ type: 'warning' | 'danger'; message: string } | null>(null)

    const [transitionDraft, setTransitionDraft] = useState('')
    const [cameraDraft, setCameraDraft] = useState('')

    // Transition-as-action state (obs-layout-plan.md §1.7): a stage switch that plays a
    // transition source applies the new phase when OBS reports MediaInputPlaybackEnded for it.
    const [transitionPending, setTransitionPending] = useState<TransitionPending | null>(null)
    // Unsubscribes the playback-ended listener AND clears the safety timeout of the pending wait.
    const transitionCancelRef = useRef<(() => void) | null>(null)
    // If OBS never reports the end (source hidden, event lost), apply anyway after this long.
    const TRANSITION_SAFETY_MS = 60000

    useEffect(() => {
        setUrl((old) => localStorage.getItem(OBS_WS_URL) ?? old)
    }, [])

    useEffect(() => {
        localStorage.setItem(OBS_WS_URL, url)
    }, [url])

    useEffect(() => {
        setTransitionDraft(controls.config.obsBindings.transitionSource ?? '')
    }, [controls.config.obsBindings.transitionSource])

    useEffect(() => {
        setCameraDraft(controls.config.obsBindings.cameraItem ?? '')
    }, [controls.config.obsBindings.cameraItem])

    // Drop any pending transition wait on unmount.
    useEffect(() => {
        return () => { transitionCancelRef.current?.() }
    }, [])

    useEffect(() => {
        if (!stream?.active_break_id) {
            setBreakObj(null)
            return
        }
        const breakId = stream.active_break_id
        function fetchBreak() {
            post(getEndpoints().break_get, {id: breakId}).then((b: WNBreak) => setBreakObj(b))
        }
        fetchBreak()
        const id = setInterval(fetchBreak, 30000)
        return () => clearInterval(id)
    }, [stream?.active_break_id])

    useEffect(() => {
        function handler(e: BeforeUnloadEvent) {
            if (isConnected) {
                e.preventDefault()
                e.returnValue = ''
            }
        }
        window.addEventListener('beforeunload', handler)
        return () => window.removeEventListener('beforeunload', handler)
    }, [isConnected])

    function connect() {
        obs.connect()
    }

    async function runApply(next: OverlayState, cue?: BusPayload['cue']): Promise<ApplyResult> {
        const result = await controls.apply(next, cue)
        // Undelivered-to-OBS is NOT a notice: it is a standing condition, shown (and cleared) in
        // the OBS tab via controls.undelivered. Only real failures interrupt here.
        setNotice(result.error ? {type: 'danger', message: result.error} : null)
        return result
    }

    // Actions strip (obs-layout-plan.md §1.9): one semantic scene event per button, state
    // unchanged, cue attached — element types decide for themselves whether/how they react.
    const [firedEvent, setFiredEvent] = useState<SceneEventName | null>(null)
    async function fireSceneEvent(name: SceneEventName) {
        if (isLatchingEvent(name)) {
            // Latching events (stash-or-pass) live in state so a browser-source reload resumes them
            // — see OverlayState.active. Turning ON also sends the cue, which is what plays the
            // entrance animation; turning OFF just clears the flag and the element exits.
            const turningOn = !isEventActive(controls.state, name)
            const next: OverlayState = {
                ...controls.state,
                active: {...controls.state.active, [name]: turningOn},
            }
            await runApply(next, turningOn ? {kind: 'event', name} : undefined)
            return
        }
        await runApply(controls.state, {kind: 'event', name})
        setFiredEvent(name)
        setTimeout(() => setFiredEvent((current) => (current === name ? null : current)), ACTION_FEEDBACK_MS)
    }

    // Border of the stage dropdown: green = stage changes reach OBS (connected and the last send
    // succeeded), red = they don't (disconnected, or the last send was not delivered).
    const [lastSendFailed, setLastSendFailed] = useState(false)
    const stageDelivery: 'ok' | 'bad' = isConnected && !lastSendFailed ? 'ok' : 'bad'

    async function applyPhaseNow(phase: Phase) {
        const result = await runApply({...controls.state, phase, phaseData: undefined})
        setLastSendFailed(!result.ok || !!result.warning)
    }

    function cancelPendingTransition() {
        transitionCancelRef.current?.()
        transitionCancelRef.current = null
        setTransitionPending(null)
    }

    async function setPhase(phase: Phase) {
        // Changing stage again during a pending transition cancels the previous wait outright —
        // the new call below starts its own (or applies immediately).
        cancelPendingTransition()

        const {useTransition, transitionSource} = controls.config.obsBindings

        if (useTransition && transitionSource && isConnected) {
            // Subscribe BEFORE restarting the media so a very short clip can't end unheard.
            const finish = () => {
                cancelPendingTransition()
                applyPhaseNow(phase)
            }
            const unsubscribe = obs.onMediaPlaybackEnded(transitionSource, finish)
            const safety = setTimeout(finish, TRANSITION_SAFETY_MS)
            transitionCancelRef.current = () => { unsubscribe(); clearTimeout(safety) }
            setTransitionPending({phase})

            try {
                await obs.playMedia(transitionSource)
            } catch (e) {
                setNotice({
                    type: 'warning',
                    message: `Failed to play transition source "${transitionSource}": ${e instanceof Error ? e.message : String(e)}`,
                })
                finish()
            }
            return
        }

        await applyPhaseNow(phase)
    }

    async function skipTransition() {
        if (!transitionPending) return
        const phase = transitionPending.phase
        cancelPendingTransition()
        await applyPhaseNow(phase)
    }

    // Stream Deck bridge (elgato-plugin-plan.md §E3.3): deck keys call the very same handlers as
    // the on-screen controls, so a key press and a click are one code path.
    const [lastDeckCommandAt, setLastDeckCommandAt] = useState<Date | null>(null)
    useDeckBridge(
        obs,
        {
            seq: controls.seq,
            phase: controls.state.phase,
            transitioning: transitionPending !== null,
            isConnected,
            active: controls.state.active,
        },
        {setPhase, skipTransition, fireSceneEvent},
        () => setLastDeckCommandAt(new Date()),
    )

    // Keep this tab responsive for the deck even when it sits hidden all stream (§E3.4).
    useKeepAwake(PHASE_LABELS[controls.state.phase], controls.reload)

    // Media inputs available in OBS, for the transition-source dropdown (refreshed on connect).
    const [mediaInputs, setMediaInputs] = useState<string[]>([])
    useEffect(() => {
        if (!isConnected) { setMediaInputs([]); return }
        obs.getMediaInputNames().then(setMediaInputs).catch(() => setMediaInputs([]))
    }, [isConnected, obs])

    // Real save failures raise the notice; "saved but not delivered to OBS" is a standing
    // condition rather than an event, so it lives in the OBS tab instead (controls.undelivered).
    function reportPush(result: {error?: string; warning?: string}) {
        if (result.error) setNotice({type: 'danger', message: result.error})
    }

    async function saveBinding(field: 'transitionSource' | 'cameraItem', value: string) {
        const trimmed = value.trim()
        const next = {
            ...controls.config,
            obsBindings: {...controls.config.obsBindings, [field]: trimmed || undefined},
        }
        reportPush(await controls.pushConfig(next))
    }

    async function saveUseTransition(value: boolean) {
        const next = {
            ...controls.config,
            obsBindings: {...controls.config.obsBindings, useTransition: value},
        }
        reportPush(await controls.pushConfig(next))
    }

    const phaseIndex = PHASES.indexOf(controls.state.phase)
    // The phases form a cycle (ripping -> selling starts the next break), so prev/next wrap.
    const prevPhase: Phase = PHASES[(phaseIndex - 1 + PHASES.length) % PHASES.length]
    const nextPhase: Phase = PHASES[(phaseIndex + 1) % PHASES.length]

    const sideTabs = [
        {
            name: 'OBS',
            node: (
                <div className="ctl-obs-tab">
                    <div className="ctl-conn-block">
                        <WebSocketUrlComponent url={url} setUrl={setUrl}/>
                        <ConnectedComponent isConnected={isConnected} connect={connect}/>
                        <div className={`ctl-conn-status ${controls.connectionStatus}`}>
                            status: {controls.connectionStatus}
                        </div>
                        <button className="btn btn-sm btn-outline-secondary" disabled title="wired in 2.8">
                            Re-sync OBS
                        </button>
                    </div>

                    {/* Standing condition, not an event: raised by any change that could not be
                        delivered to OBS and cleared by the first one that is — including the
                        automatic resend on reconnect. */}
                    {controls.undelivered && (
                        <div className="alert alert-warning py-2 px-2 small mb-0 mt-2" role="alert">
                            {controls.undelivered}
                        </div>
                    )}

                    <hr/>

                    <div className="ctl-obs-bindings">
                        <div className="form-check mb-2">
                            <input
                                type="checkbox"
                                className="form-check-input"
                                id="ctl-useTransition"
                                checked={!!controls.config.obsBindings.useTransition}
                                onChange={(e) => saveUseTransition(e.target.checked)}
                            />
                            <label className="form-check-label small" htmlFor="ctl-useTransition">
                                Use transition video
                            </label>
                        </div>
                        <div className="mb-2">
                            <label className="form-label mb-0 small">Transition source</label>
                            {mediaInputs.length > 0 ? (
                                <div className="dropdown">
                                    <button
                                        className="btn btn-secondary dropdown-toggle btn-sm ctl-source-dropdown"
                                        type="button"
                                        data-bs-toggle="dropdown"
                                        data-bs-auto-close="true"
                                        aria-expanded="false"
                                    >
                                        {transitionDraft || 'Select source'}
                                    </button>
                                    <ul className="dropdown-menu cursor-pointer">
                                        {transitionDraft && !mediaInputs.includes(transitionDraft) && (
                                            <li className="dropdown-item active text-warning" title="Not found in OBS">
                                                {transitionDraft} (missing)
                                            </li>
                                        )}
                                        {mediaInputs.map(name => (
                                            <li
                                                key={name}
                                                className={`dropdown-item ${transitionDraft === name ? 'active' : ''}`}
                                                onClick={() => { setTransitionDraft(name); saveBinding('transitionSource', name) }}
                                            >
                                                {name}
                                            </li>
                                        ))}
                                        <li className="dropdown-item text-secondary" onClick={() => { setTransitionDraft(''); saveBinding('transitionSource', '') }}>
                                            (none)
                                        </li>
                                    </ul>
                                </div>
                            ) : (
                                <div className="small text-secondary">
                                    {isConnected ? 'No media sources found in OBS' : `Connect to OBS to choose${transitionDraft ? ` (current: ${transitionDraft})` : ''}`}
                                </div>
                            )}
                        </div>
                        {transitionPending && (
                            <div className="ctl-transition-pending d-flex align-items-center gap-2 mb-2">
                                <span className="small">
                                    Transition playing… → {PHASE_LABELS[transitionPending.phase]} (switches when the video ends)
                                </span>
                                <button className="btn btn-sm btn-outline-warning" onClick={skipTransition}>
                                    Skip
                                </button>
                            </div>
                        )}
                        <div>
                            <label className="form-label mb-0 small">OBS camera item</label>
                            <input
                                type="text"
                                className="form-control form-control-sm"
                                value={cameraDraft}
                                onChange={(e) => setCameraDraft(e.target.value)}
                                onBlur={(e) => saveBinding('cameraItem', e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            />
                        </div>
                    </div>

                    <hr/>

                    <div className="small text-secondary mb-2">
                        Stream Deck:{' '}
                        {lastDeckCommandAt
                            ? `last command ${lastDeckCommandAt.toLocaleTimeString()}`
                            : 'no commands yet'}
                    </div>

                    <details>
                        <summary>State (seq {controls.seq})</summary>
                        <div className="small text-secondary mb-1">
                            last emit: {controls.lastEmitAt ? controls.lastEmitAt.toLocaleTimeString() : 'never'}
                        </div>
                        <pre className="ctl-state-pre">
                            {JSON.stringify({seq: controls.seq, state: controls.state}, null, 2)}
                        </pre>
                    </details>
                </div>
            ),
        },
    ]

    return (
        <main className="ctl-page">
            <div className="d-flex justify-content-between ctl-columns">
                <div className="w-75p ctl-main-col">
                    <div className="ctl-header">
                        <div className="ctl-header-titles">
                            <h4>{channel?.name ?? `Channel #${channelId}`}</h4>
                            <div className="ctl-subtitle">
                                {stream?.active_break_id
                                    ? (breakObj ? `Break: ${breakObj.name}` : 'Loading break…')
                                    : 'No active break'}
                            </div>
                        </div>

                        <div className="ctl-stage-block">
                            <button
                                className="btn btn-outline-secondary"
                                onClick={() => setPhase(prevPhase)}
                            >
                                ← {PHASE_LABELS[prevPhase]}
                            </button>
                            <select
                                className={`form-select ctl-stage-select ctl-stage-${stageDelivery}`}
                                title={stageDelivery === 'ok' ? 'Stage changes are sent to OBS' : 'Stage changes are NOT reaching OBS'}
                                value={controls.state.phase}
                                onChange={(e) => setPhase(e.target.value as Phase)}
                            >
                                {PHASES.map((p) => (
                                    <option key={p} value={p}>{PHASE_LABELS[p]}</option>
                                ))}
                            </select>
                            <button
                                className="btn btn-outline-secondary"
                                onClick={() => setPhase(nextPhase)}
                            >
                                {PHASE_LABELS[nextPhase]} →
                            </button>
                        </div>
                    </div>

                    <div className="ctl-actions-strip d-flex flex-wrap gap-2">
                        {SCENE_EVENTS.map((ev) => {
                            const lit = ev.latching && isEventActive(controls.state, ev.name)
                            return (
                                <button
                                    key={ev.name}
                                    type="button"
                                    className={`btn ${lit ? 'btn-warning' : 'btn-primary'}${firedEvent === ev.name ? ' ctl-action-sent' : ''}`}
                                    onClick={() => fireSceneEvent(ev.name)}
                                    title={ev.latching ? 'Stays on until pressed again' : undefined}
                                >
                                    {firedEvent === ev.name ? 'Sent!' : lit ? `${ev.label} ■` : ev.label}
                                </button>
                            )
                        })}
                    </div>

                    {notice && (
                        <div className={`ctl-notice alert alert-${notice.type} alert-dismissible`} role="alert">
                            {notice.message}
                            <button type="button" className="btn-close" onClick={() => setNotice(null)}/>
                        </div>
                    )}

                    {controls.loading && (
                        <div className="alert alert-secondary">Loading layout config/state…</div>
                    )}

                    <ElementsPanel
                        controls={controls}
                        channelId={channelId}
                        seriesId={breakObj?.series_id}
                        onPushResult={reportPush}
                    />
                </div>

                <div className="w-15p ctl-side-panel">
                    <TabsComponent tabs={sideTabs}/>
                </div>
            </div>
        </main>
    )
}
