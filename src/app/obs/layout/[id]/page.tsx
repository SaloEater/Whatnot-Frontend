'use client'

// The single OBS browser source for a channel (obs-layout-plan.md §1.4). Placeholders render for
// now — Phase 2 swaps them into real components one registry entry at a time.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {getEndpoints, isBackendFailure, post} from '@/app/lib/backend'
import {BUS_CUE_EVENT_NAME, BUS_EVENT_NAME, CANVAS, DEV_CHANNEL_NAME, DEV_CUE_CHANNEL_NAME} from '../schema'
import type {Box, BusPayload, CuePayload, LayoutConfig, OverlayState, Phase} from '../schema'
import {
    defaultConfig,
    defaultState,
    elementsForPhase,
    isEffectivelyVisible,
    migrateState,
    reconcileConfigResponse,
    validateState,
} from '../config'
import {REGISTRY, registryIdOf} from '../registry'
import {makeSeqGuard, parseBusPayload, parseCuePayload} from '../bus'
import {useBusChannel} from '../useBusChannel'
import {CueBusProvider, useCueBus} from '../cueBus'
import {LayoutDataProvider} from '../useLayoutData'
import {ResolvedBoxesProvider} from '../resolvedBoxes'
import {AnchorsProvider} from '../anchors'
import {EventActiveProvider} from '../eventActive'
import {Stage} from './Stage'
import {ElementFrame} from './ElementFrame'
import {ElementErrorBoundary} from './ElementErrorBoundary'
import {DevPanel} from './DevPanel'
import './layout.css'

const RECONCILE_MS = 60000

// Boxless elements (registry `hasBox: false`, obs-layout-plan.md §1.9) are mounted full-canvas,
// non-clipping, regardless of whatever box their placement happens to store — they position their
// own content (typically via useResolvedBox(), see resolvedBoxes.tsx).
const FULL_CANVAS_BOX: Box = {x: 0, y: 0, w: CANVAS.w, h: CANVAS.h}

function preloadUrl(url: string) {
    // Registry `preload` lists hold URLs. Fonts are fetched into the HTTP cache so the element's
    // own @font-face resolves instantly when it first mounts (document.fonts.load() takes a font
    // family, not a URL, so it is not usable here); images go through an Image() so the decoder
    // cache is warm too.
    if (/\.(woff2?|ttf|otf)(\?.*)?$/i.test(url)) {
        fetch(url, {mode: 'same-origin', cache: 'force-cache'}).catch(() => {
            // best-effort only
        })
    } else {
        const img = new Image()
        img.src = url
    }
}

function LayoutStageContent({config, state}: {config: LayoutConfig; state: OverlayState}) {
    // Already sorted ascending by `z` (stable) by elementsForPhase — rendered in that order AND
    // given an explicit z-index below, so a negative z really does sit under everything else
    // regardless of stacking-context quirks.
    const elements = elementsForPhase(config, state.phase)

    // Boxless elements (§1.9) are excluded — nothing should anchor to a box that isn't real.
    // `elements` is a fresh array every render; `config`/`state.phase` are its real, stable
    // dependencies, so the memo is keyed on those instead.
    const resolvedBoxes = useMemo(() => {
        const map = new Map<string, Box>()
        for (const {key, element, box} of elements) {
            if (REGISTRY[registryIdOf(element)].hasBox) {
                map.set(key, box)
            }
        }
        return map
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, state.phase])

    return (
        <EventActiveProvider active={state.active}>
            <ResolvedBoxesProvider boxes={resolvedBoxes}>
                {/* Innermost of the two providers — obviously a layout-page-only concern, never
                    mounted by the controls page (anchors.tsx's own header explains why that's safe). */}
                <AnchorsProvider>
                    <Stage>
                        {elements.map(({key, element, box}) => {
                            if (!isEffectivelyVisible(config, state, key)) return null
                            const entry = REGISTRY[registryIdOf(element)]
                            const Component = entry.component
                            const effectiveBox = entry.hasBox ? box : FULL_CANVAS_BOX
                            // Per-element boundary (obs-layout-disappearing-elements-findings.md fix
                            // #3, see ElementErrorBoundary.tsx for why it's per-element and why the
                            // fallback is nothing): `resetKey={element}` so a config push that changes
                            // THIS element — including one that fixes whatever was throwing — clears a
                            // stuck error on the next render, without needing a page reload.
                            return (
                                <ElementErrorBoundary key={key} elementKey={key} resetKey={element}>
                                    <ElementFrame box={effectiveBox} z={element.z ?? 0} clip={entry.hasBox}>
                                        <Component elementKey={key} element={element} box={effectiveBox} phase={state.phase} />
                                    </ElementFrame>
                                </ElementErrorBoundary>
                            )
                        })}
                    </Stage>
                </AnchorsProvider>
            </ResolvedBoxesProvider>
        </EventActiveProvider>
    )
}

function LayoutPageInner({channelId, devMode}: {channelId: number; devMode: boolean}) {
    const [config, setConfig] = useState<LayoutConfig>(() => defaultConfig())
    // Mirrors `config` for the reconcile poll below: that closure is only re-created on
    // `channelId` changing, so without a ref it would keep "current config" pinned to whatever
    // `config` was at mount — exactly wrong for reconcileConfigResponse's failure/invalid fallback,
    // which must return the config as it stands NOW, not as it stood 60s (or several polls) ago.
    const configRef = useRef(config)
    configRef.current = config
    const [state, setState] = useState<OverlayState>(() => defaultState())
    const [seq, setSeq] = useState(0)
    const [lastBusEventAt, setLastBusEventAt] = useState<number | null>(null)
    // Local-only override from the dev phase switcher — never sent to the backend, never rides
    // the bus. Takes priority over the fetched/pushed state's phase while set.
    const [devPhaseOverride, setDevPhaseOverride] = useState<Phase | null>(null)

    const guardRef = useRef(makeSeqGuard())
    const cueBus = useCueBus()

    const applyBusPayload = useCallback(
        (payload: BusPayload) => {
            if (!guardRef.current.accept(payload.seq)) return
            setSeq(payload.seq)
            // Payloads carry whole state, never deltas (obs-browser-event-bus.md §6.5) — always
            // replace outright, including phaseData, rather than merging with what's there.
            setState(payload.state)
            setConfig(payload.config)
            setDevPhaseOverride(null)
            setLastBusEventAt(Date.now())
            if (payload.cue) {
                cueBus.emit(payload.cue)
            }
        },
        [cueBus]
    )

    // Durable channel. Both its listeners — the real obs-browser window event and the dev
    // BroadcastChannel mirror — live in useBusChannel.ts, which documents them.
    useBusChannel(BUS_EVENT_NAME, DEV_CHANNEL_NAME, devMode, parseBusPayload, applyBusPayload)

    // Transient cue channel (schema.ts's BUS_CUE_EVENT_NAME): a cue on its own, carrying no state
    // and no config, so it never touches `state`/`config`/`seq` — it is forwarded straight to the
    // in-page cue bus for elements to pick up. Its own ordering guard, because `n` is a different
    // counter from `seq` and the two must not interfere.
    const cueGuardRef = useRef(makeSeqGuard())
    const applyCuePayload = useCallback(
        (payload: CuePayload) => {
            if (!cueGuardRef.current.accept(payload.n)) return
            cueBus.emit(payload.cue)
        },
        [cueBus]
    )

    useBusChannel(BUS_CUE_EVENT_NAME, DEV_CUE_CHANNEL_NAME, devMode, parseCuePayload, applyCuePayload)

    // Mount fetch + 60s reconcile poll. Config has no version number, so it's always applied
    // fresh from the poll; state carries `seq` and goes through the same guard as bus payloads,
    // so a stale poll response can never stomp a state that arrived more recently over the bus.
    useEffect(() => {
        let cancelled = false

        async function reconcile() {
            const [configResp, stateResp] = await Promise.all([
                post(getEndpoints().layout_config_get, {channel_id: channelId}),
                post(getEndpoints().layout_state_get, {channel_id: channelId}),
            ])
            if (cancelled) return

            // A FAILED config response (backend 500, network drop, non-JSON body — see
            // isBackendFailure in lib/backend.ts) must never be treated as "no config row yet":
            // that conflation used to fall back to defaultConfig() on a mere backend hiccup,
            // wiping every element on screen (obs-layout-disappearing-elements-findings.md fix
            // #1). reconcileConfigResponse (config.ts) is the pure decision; 'failed' and
            // 'invalid' both hand back `configRef.current` unchanged.
            const configResult = reconcileConfigResponse(configResp, configRef.current)
            if (configResult.reason === 'failed') {
                console.warn('[obs/layout] config poll failed, keeping current config', configResp)
            }
            const nextConfig = configResult.config

            // A FRACTIONAL last-accepted seq means an uncommitted draft from the controls page is
            // live on this canvas (useControls.emitDraft — a box being dragged). The DB config is
            // then known to be behind it, and applying it here would snap the dragged element
            // back until the next draft emit. Skip config from the poll while that holds; the
            // state half below is seq-guarded and drops the poll's integer seq on its own.
            // -Infinity (nothing accepted yet) is not a draft: the mount fetch must apply.
            const lastSeen = guardRef.current.last()
            const draftLive = Number.isFinite(lastSeen) && !Number.isInteger(lastSeen)
            // A failed poll skips setConfig outright rather than relying on `nextConfig` being
            // reference-equal to the current config (it always is, for 'failed'/'invalid') — the
            // point is that a failed poll is a no-op, not merely a harmless one.
            if (configResult.reason !== 'failed' && !draftLive) setConfig(nextConfig)

            // A FAILED state response gets the same explicit skip, rather than the previous
            // behaviour of feeding a fake `seq: 0` into the guard and relying on the guard's
            // <=-last-accepted check to drop it — that happened to work, but only by accident (a
            // channel whose last accepted seq is negative, e.g. right after a draft reset, would
            // have accepted the fake 0 and reset the visible state to defaultState()).
            if (isBackendFailure(stateResp)) {
                console.warn('[obs/layout] state poll failed, keeping current state', stateResp)
                return
            }

            const incomingSeq = typeof stateResp?.seq === 'number' ? stateResp.seq : 0
            if (guardRef.current.accept(incomingSeq)) {
                const rawState = stateResp?.state ?? null
                let nextState: OverlayState
                if (rawState === null) {
                    nextState = defaultState()
                } else {
                    const result = validateState(migrateState(rawState))
                    if (result.ok) {
                        nextState = result.state
                    } else {
                        console.error('[obs/layout] invalid state from backend, using default', result.errors)
                        nextState = defaultState()
                    }
                }
                // Same reconciliation useControls.loadAll does on the controls page: `state` was
                // validated with no `stages` in scope (config.ts's validateState), so a phase that
                // no longer names a stage in THIS config (the stage was deleted, or the config was
                // swapped) is only caught here, once both are in hand. Falls back to the config's
                // first stage rather than rendering a blank canvas until the next 60s reconcile.
                if (!nextConfig.stages.some((s) => s.id === nextState.phase)) {
                    console.error(
                        `[obs/layout] state.phase "${nextState.phase}" is not a stage in this config, falling back to "${nextConfig.stages[0].id}"`
                    )
                    nextState = {...nextState, phase: nextConfig.stages[0].id}
                }
                setState(nextState)
                setSeq(incomingSeq)
                setDevPhaseOverride(null)
            }
        }

        reconcile()
        const id = setInterval(reconcile, RECONCILE_MS)
        return () => {
            cancelled = true
            clearInterval(id)
        }
    }, [channelId])

    // Preload every registry entry's declared URLs whenever the config's element set changes.
    // (The `frame` kind used to also preload an element-level `image` URL — obs-layout-plan.md
    // §2.5 replaced that field with code-drawn `borders`, so there is nothing element-level left
    // to preload there.) `imageBox` URLs are per element rather than a registry-level asset, so
    // they can't live in `preload` — walk the config directly instead, so a stage switch to an
    // imageBox that hasn't been shown yet doesn't pop in (obs-image-box-plan.md §3.4).
    useEffect(() => {
        const urls = new Set<string>()
        for (const element of Object.values(config.elements)) {
            REGISTRY[registryIdOf(element)].preload.forEach((url) => urls.add(url))
            if (element.kind === 'imageBox' && element.url) urls.add(element.url)
        }
        urls.forEach(preloadUrl)
    }, [config])

    const effectiveState = useMemo<OverlayState>(
        () => (devPhaseOverride ? {...state, phase: devPhaseOverride, phaseData: undefined} : state),
        [state, devPhaseOverride]
    )

    return (
        <LayoutDataProvider channelId={channelId} config={config}>
            <LayoutStageContent config={config} state={effectiveState} />
            {devMode && (
                <DevPanel
                    phase={effectiveState.phase}
                    stages={config.stages}
                    seq={seq}
                    lastBusEventAt={lastBusEventAt}
                    onSetPhase={setDevPhaseOverride}
                />
            )}
        </LayoutDataProvider>
    )
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const searchParams = useSearchParams()
    const devMode = searchParams?.get('dev') === '1'

    return (
        <CueBusProvider>
            <LayoutPageInner channelId={channelId} devMode={devMode} />
        </CueBusProvider>
    )
}
