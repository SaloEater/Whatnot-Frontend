'use client'

// The single OBS browser source for a channel (obs-layout-plan.md §1.4). Placeholders render for
// now — Phase 2 swaps them into real components one registry entry at a time.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import {useSearchParams} from 'next/navigation'
import {getEndpoints, post} from '@/app/lib/backend'
import {BUS_EVENT_NAME, CANVAS, DEV_CHANNEL_NAME} from '../schema'
import type {Box, BusPayload, LayoutConfig, OverlayState, Phase} from '../schema'
import {
    defaultConfig,
    defaultState,
    elementsForPhase,
    isVisible,
    migrateConfig,
    migrateState,
    validateConfig,
    validateState,
} from '../config'
import {REGISTRY, registryIdOf} from '../registry'
import {makeSeqGuard, parseBusPayload} from '../bus'
import {CueBusProvider, useCueBus} from '../cueBus'
import {LayoutDataProvider} from '../useLayoutData'
import {ResolvedBoxesProvider} from '../resolvedBoxes'
import {EventActiveProvider} from '../eventActive'
import {Stage} from './Stage'
import {ElementFrame} from './ElementFrame'
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
                <Stage>
                    {elements.map(({key, element, box}) => {
                        if (!isVisible(state, key)) return null
                        const entry = REGISTRY[registryIdOf(element)]
                        const Component = entry.component
                        const effectiveBox = entry.hasBox ? box : FULL_CANVAS_BOX
                        return (
                            <ElementFrame key={key} box={effectiveBox} z={element.z ?? 0} clip={entry.hasBox}>
                                <Component elementKey={key} element={element} box={effectiveBox} phase={state.phase} />
                            </ElementFrame>
                        )
                    })}
                </Stage>
            </ResolvedBoxesProvider>
        </EventActiveProvider>
    )
}

function LayoutPageInner({channelId, devMode}: {channelId: number; devMode: boolean}) {
    const [config, setConfig] = useState<LayoutConfig>(() => defaultConfig())
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

    // Real OBS browser-source bus: window CustomEvent dispatched by the obs-browser plugin.
    useEffect(() => {
        function onTrigger(e: Event) {
            const payload = parseBusPayload((e as CustomEvent).detail)
            if (payload) applyBusPayload(payload)
        }
        window.addEventListener(BUS_EVENT_NAME, onTrigger)
        return () => window.removeEventListener(BUS_EVENT_NAME, onTrigger)
    }, [applyBusPayload])

    // Dev shim: outside OBS there is no obs-browser plugin, so mirror the same payloads over a
    // BroadcastChannel instead (obs-browser-event-bus.md §3.3).
    useEffect(() => {
        if (!devMode || typeof BroadcastChannel === 'undefined') return
        const channel = new BroadcastChannel(DEV_CHANNEL_NAME)
        channel.onmessage = (e: MessageEvent) => {
            const payload = parseBusPayload(e.data)
            if (payload) applyBusPayload(payload)
        }
        return () => channel.close()
    }, [devMode, applyBusPayload])

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

            const rawConfig = configResp?.config ?? null
            if (rawConfig === null) {
                setConfig(defaultConfig())
            } else {
                const result = validateConfig(migrateConfig(rawConfig))
                if (result.ok) {
                    setConfig(result.config)
                } else {
                    console.error('[obs/layout] invalid config from backend, using default', result.errors)
                    setConfig(defaultConfig())
                }
            }

            const incomingSeq = typeof stateResp?.seq === 'number' ? stateResp.seq : 0
            if (guardRef.current.accept(incomingSeq)) {
                const rawState = stateResp?.state ?? null
                if (rawState === null) {
                    setState(defaultState())
                } else {
                    const result = validateState(migrateState(rawState))
                    if (result.ok) {
                        setState(result.state)
                    } else {
                        console.error('[obs/layout] invalid state from backend, using default', result.errors)
                        setState(defaultState())
                    }
                }
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

    // Preload every registry entry's declared URLs, plus any element-level image (today: the
    // `frame` kind's `image`), whenever the config's element set changes.
    useEffect(() => {
        const urls = new Set<string>()
        for (const element of Object.values(config.elements)) {
            REGISTRY[registryIdOf(element)].preload.forEach((url) => urls.add(url))
            if ('image' in element && typeof element.image === 'string' && element.image) {
                urls.add(element.image)
            }
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
