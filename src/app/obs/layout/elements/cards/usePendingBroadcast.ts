'use client'

// Publishes the layout's pending-sold-cards set to the controls page (pending-sold-cards-plan.md
// §2.3). This is the return path documented in obs-browser-event-bus.md §8: layout -> controls,
// over a plain BroadcastChannel rather than the obs-websocket `emit_event` bus (which is one-way
// the other direction). Unconditional — not gated on devMode, unlike the two existing
// useBusChannel dev-listener gates elsewhere on this page, which are out of scope here.
//
// Wrapped in try/catch exactly like useControls.ts's `broadcastDev`: a plain Chrome tab (no shared
// OBS Chromium profile with a controls dock) either never delivers these messages or, in an older
// browser, may not have BroadcastChannel at all — either way this must not throw.

import { useEffect, useRef } from 'react'
import { PENDING_CHANNEL_NAME, PendingPayload } from '../../schema'

export function usePendingBroadcast(args: {
    channelId: number
    pendingIds: ReadonlySet<number>
    heartbeatMs: number
}): void {
    const { channelId, pendingIds, heartbeatMs } = args

    const channelRef = useRef<BroadcastChannel | null>(null)
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Open on mount, close on unmount.
    useEffect(() => {
        try {
            channelRef.current = new BroadcastChannel(PENDING_CHANNEL_NAME)
        } catch (e) {
            channelRef.current = null
            console.warn('[usePendingBroadcast] BroadcastChannel unavailable', e)
        }
        return () => {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current)
                heartbeatRef.current = null
            }
            try {
                channelRef.current?.close()
            } catch (e) {
                console.warn('[usePendingBroadcast] failed to close BroadcastChannel', e)
            }
            channelRef.current = null
        }
    }, [])

    // Post (a) whenever `pendingIds` changes, including to empty, and (b) every `heartbeatMs`
    // while non-empty — so a dock opened late catches up and a dead layout page's tint expires on
    // the controls side (PENDING_STALE_MS there).
    useEffect(() => {
        function post() {
            const bc = channelRef.current
            if (!bc) return
            const payload: PendingPayload = {
                kind: 'pending-photos',
                channelId,
                photoIds: Array.from(pendingIds),
                sentAt: Date.now(),
            }
            try {
                bc.postMessage(payload)
            } catch (e) {
                console.warn('[usePendingBroadcast] postMessage failed', e)
            }
        }

        post()

        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current)
            heartbeatRef.current = null
        }
        if (pendingIds.size > 0) {
            heartbeatRef.current = setInterval(post, heartbeatMs)
        }
        return () => {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current)
                heartbeatRef.current = null
            }
        }
    }, [channelId, pendingIds, heartbeatMs])
}
