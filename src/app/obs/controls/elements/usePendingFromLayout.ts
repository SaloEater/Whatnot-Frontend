'use client'

// Receives the layout's pending-sold-cards broadcast (pending-sold-cards-plan.md §3), the return
// path documented in obs-browser-event-bus.md §8. Controls gets no events poll and no tracker of
// its own here — the layout (`usePendingBroadcast.ts`) is the single source of truth; this hook
// only listens and lets the set go stale if the layout stops heartbeating.

import { useEffect, useRef, useState } from 'react'
import { PENDING_CHANNEL_NAME, PendingPayload } from '@/app/obs/layout/schema'

// Three missed heartbeats (PENDING_HEARTBEAT_MS = 3_000 in CardsElement.tsx) — long enough that
// one dropped message doesn't blink the tint off, short enough that a reloaded layout page or a
// closed OBS source clears the tint within the acceptance checklist's ~10s budget.
const PENDING_STALE_MS = 10_000

export function usePendingFromLayout(channelId: number): {
    pending: ReadonlySet<number>
    // cards-auto-show-pending-plan.md §4: which pending card, if any, the layout is currently
    // auto-zooming on stream. `undefined`/missing on the wire (an older layout page's payload,
    // sent before this field existed) is treated the same as "none" — see PendingPayload's comment.
    autoShowingId: number | null
} {
    const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set())
    const [autoShowingId, setAutoShowingId] = useState<number | null>(null)
    const lastAtRef = useRef(0)

    // Open on mount, close on unmount.
    useEffect(() => {
        let bc: BroadcastChannel | null = null
        try {
            bc = new BroadcastChannel(PENDING_CHANNEL_NAME)
        } catch (e) {
            console.warn('[usePendingFromLayout] BroadcastChannel unavailable', e)
            return
        }

        bc.onmessage = (e: MessageEvent) => {
            const data = e.data as Partial<PendingPayload> | undefined
            if (
                !data ||
                data.kind !== 'pending-photos' ||
                data.channelId !== channelId ||
                !Array.isArray(data.photoIds)
            ) {
                return
            }
            lastAtRef.current = Date.now()
            const ids: number[] = data.photoIds
            // Heartbeats repeat the same list every few seconds; keep the previous Set when nothing
            // changed so the card grid isn't re-rendered on every one.
            setPending((prev) =>
                prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids)
            )
            const nextAutoShowingId = data.autoShowingId ?? null
            setAutoShowingId((prev) => (prev === nextAutoShowingId ? prev : nextAutoShowingId))
        }

        const channel = bc
        return () => {
            channel.close()
        }
    }, [channelId])

    // A 1s tick clears both when the last message is older than PENDING_STALE_MS.
    useEffect(() => {
        const id = setInterval(() => {
            if (lastAtRef.current !== 0 && Date.now() - lastAtRef.current > PENDING_STALE_MS) {
                lastAtRef.current = 0
                setPending((prev) => (prev.size === 0 ? prev : new Set()))
                setAutoShowingId((prev) => (prev === null ? prev : null))
            }
        }, 1000)
        return () => clearInterval(id)
    }, [])

    return { pending, autoShowingId }
}
