'use client'

// Bridges the Stream Deck plugin to this page (elgato-plugin-plan.md §E3.2/§E3.5).
//
// The plugin holds no logic: it broadcasts a command, and this hook calls the SAME handlers the
// on-screen stage block and Actions strip call, so a key press and a click are indistinguishable
// downstream. In return the page broadcasts its state on every change and on a heartbeat, which is
// the only way the deck can tell a live page from a closed one — the transport has no delivery
// acknowledgement.

import {useCallback, useEffect, useMemo, useRef, useState} from 'react'
import type {MyOBSWebsocket} from '@/app/entity/my_obs_websocket'
import type {Phase, Stage} from '@/app/obs/layout/schema'
import {SCENE_EVENTS, isSceneEventName} from '@/app/obs/layout/sceneEvents'
import type {SceneEventName} from '@/app/obs/layout/sceneEvents'
import {isDeckMessage, MOB, newSrc, PROTOCOL_VERSION, vocabRev} from '@/app/obs/controls/deckProtocol'
import type {DeckCommand, DeckVocab, HeadState, VocabItem} from '@/app/obs/controls/deckProtocol'

// A FALLBACK, not the primary liveness signal. Chrome clamps timers in a hidden tab to ~once a
// minute, and this page is normally hidden, so this beat cannot be relied on to prove the page is
// alive. The deck pings when it has not heard from us; see `ping` in deckProtocol.ts. This still
// earns its keep when the tab is visible, and for any listener that does not ping.
const HEARTBEAT_MS = 2000
// Enough ids to cover any plausible burst; the transport may deliver a message twice.
const SEEN_IDS_MAX = 50

export type DeckBridgeHandlers = {
    setPhase: (phase: Phase) => void | Promise<void>
    skipTransition: () => void | Promise<void>
    fireSceneEvent: (name: SceneEventName) => void | Promise<void>
}

export type DeckBridgeStatus = {
    seq: number
    phase: Phase
    /** This channel's configured stages (obs/layout/schema.ts's `Stage[]`) — the deck vocabulary
     * and the next_stage/prev_stage wrap-around are both derived from this instead of a fixed
     * PHASES constant, since stages are now per-channel config. */
    stages: Stage[]
    transitioning: boolean
    isConnected: boolean
    /** Latching scene events that are currently on. Reference-stable between applies. */
    active?: Partial<Record<SceneEventName, boolean>>
}

// `latching` is spread in only when true: an explicit `false` on every momentary event would
// change vocabRev for no reason and force a pointless re-sync on every plugin.
const EVENT_VOCAB: VocabItem[] = SCENE_EVENTS.map((e) => ({
    name: e.name,
    label: e.label,
    ...(e.latching ? {latching: true} : {}),
}))

export function useDeckBridge(
    obs: MyOBSWebsocket | null,
    status: DeckBridgeStatus,
    handlers: DeckBridgeHandlers,
    onCommand?: () => void,
) {
    // Stable for the page's lifetime; lets us ignore our own echo (a broadcast reaches the sender).
    const [src] = useState(newSrc)
    // Refs so the bus subscription never needs re-creating (which would drop messages) and never
    // closes over a stale render.
    const handlersRef = useRef(handlers)
    handlersRef.current = handlers
    const statusRef = useRef(status)
    statusRef.current = status
    const onCommandRef = useRef(onCommand)
    onCommandRef.current = onCommand

    // Derived from `status.stages` (per-channel config, not a fixed constant any more) — recomputed
    // whenever the config's stage list changes, and read from a ref so `sendVocab` (a `describe`
    // reply can arrive at any time, from a stale closure otherwise) always sends the CURRENT vocab.
    const stageVocab = useMemo<VocabItem[]>(
        () => status.stages.map((s) => ({name: s.id, label: s.label})),
        [status.stages]
    )
    const vocabRevValue = useMemo(() => vocabRev(stageVocab, EVENT_VOCAB), [stageVocab])
    const stageVocabRef = useRef(stageVocab)
    stageVocabRef.current = stageVocab
    const vocabRevRef = useRef(vocabRevValue)
    vocabRevRef.current = vocabRevValue

    const seenIds = useRef<string[]>([])

    const broadcast = useCallback((payload: HeadState | DeckVocab) => {
        if (!obs || !obs.isConnected()) return
        try {
            // guardIsConnected() throws SYNCHRONOUSLY, so .catch() alone would not hold if the
            // connection drops between the check above and the call.
            obs.broadcastCustomEvent(payload).catch(() => {})
        } catch {
            // Fire-and-forget by design; a failed send is corrected by the next heartbeat.
        }
    }, [obs])

    const sendVocab = useCallback(() => {
        broadcast({
            mob: MOB,
            kind: 'vocab',
            src,
            protocol: PROTOCOL_VERSION,
            rev: vocabRevRef.current,
            stages: stageVocabRef.current,
            sceneEvents: EVENT_VOCAB,
        })
    }, [broadcast, src])

    const sendState = useCallback(() => {
        const s = statusRef.current
        broadcast({
            mob: MOB,
            kind: 'state',
            src,
            protocol: PROTOCOL_VERSION,
            seq: s.seq,
            phase: s.phase,
            transitioning: s.transitioning,
            obsConnected: s.isConnected,
            active: s.active,
        })
    }, [broadcast, src])

    // --- inbound -----------------------------------------------------------------------------
    useEffect(() => {
        if (!obs) return

        const unsubscribe = obs.onCustomEvent((data) => {
            if (!isDeckMessage(data) || data.src === src) return   // not ours, or our own echo
            if (data.kind !== 'cmd') return                        // state/vocab from another head

            const cmd = data as DeckCommand

            // Answered BEFORE the de-dupe, deliberately. A ping has no effect beyond re-sending
            // state, so a duplicate is harmless — and pushing pings through the seen-id ring would
            // evict real command ids every couple of seconds. It also bypasses `onCommand`: a
            // liveness check is not an operator action and must not flash the UI.
            if (cmd.cmd === 'ping') {
                sendState()
                return
            }

            const key = `${cmd.src}:${cmd.id}`
            if (seenIds.current.includes(key)) return              // duplicate delivery
            seenIds.current = [...seenIds.current, key].slice(-SEEN_IDS_MAX)

            void runCommand(cmd)
        })

        return unsubscribe

        async function runCommand(cmd: DeckCommand) {
            const h = handlersRef.current
            const s = statusRef.current

            switch (cmd.cmd) {
                case 'describe':
                    sendVocab()
                    return

                case 'next_stage':
                case 'prev_stage': {
                    // A stage command arriving mid-transition skips it, matching the page's own
                    // Skip button — there is no Skip key on the deck.
                    if (s.transitioning) {
                        await h.skipTransition()
                        break
                    }
                    const step = cmd.cmd === 'next_stage' ? 1 : -1
                    const stages = s.stages
                    const at = stages.findIndex((stage) => stage.id === s.phase)
                    if (at < 0 || stages.length === 0) return
                    await h.setPhase(stages[(at + step + stages.length) % stages.length].id)
                    break
                }

                case 'scene_event': {
                    if (!isSceneEventName(cmd.name)) return        // unknown/removed event
                    await h.fireSceneEvent(cmd.name)
                    break
                }

                default:
                    return                                          // unknown command: ignore
            }

            onCommandRef.current?.()
        }
    }, [obs, src, sendVocab, sendState])

    // --- outbound ----------------------------------------------------------------------------
    // On every state change, and on connect (the deck may have started after this page).
    useEffect(() => {
        sendState()
        // `active` is part of OverlayState, so its reference only changes when an apply happens —
    // safe as a dependency. seq bumps on every apply too, so this is belt-and-braces against a
    // future path that mutates the latch without advancing seq.
}, [sendState, status.seq, status.phase, status.transitioning, status.isConnected, status.active])

    // On connect, AND whenever the vocab itself changes (an operator adding/removing/reordering a
    // stage while the deck is connected) — `vocabRevValue` only moves when `stageVocab` or
    // `EVENT_VOCAB` actually differs, so this doesn't fire on every unrelated status change.
    useEffect(() => {
        if (!status.isConnected) return
        sendVocab()
    }, [sendVocab, status.isConnected, vocabRevValue])

    useEffect(() => {
        const id = setInterval(sendState, HEARTBEAT_MS)
        return () => clearInterval(id)
    }, [sendState])
}
