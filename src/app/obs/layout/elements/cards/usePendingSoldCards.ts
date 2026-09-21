'use client'

// Pure pending-sold-cards logic for the `cards` registry element (pending-sold-cards-plan.md
// §2.1). No I/O — CardsElement.tsx owns the spine reads, the acknowledge-on-zoom-out wiring, and
// the pending -> controls broadcast (usePendingBroadcast.ts). This file only tracks which photo
// ids are "pending removal" and for how long.
//
// The rule this implements: with "show only available teams" on, a team becoming taken would
// otherwise drop its card off the board within one events poll, unattended. Here it instead goes
// PENDING — still shown (CardsElement's filter keeps it via `pendingIds.has(p.id)`) — until the
// operator acknowledges it (hovering it zooms it on the layout; the zoom-out is the acknowledge,
// see CardsElement.tsx) or `timeoutMs` elapses.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Event, NoCustomer, Photo } from '@/app/entity/entities'

export function normalizeTeam(team: string): string {
    return team.trim().toLowerCase()
}

/** Normalised teams with a committed (non-giveaway, non-empty-customer) event. */
function takenTeams(events: Event[]): Set<string> {
    const teams = new Set<string>()
    for (const e of events) {
        if (e.is_giveaway) continue
        if (e.customer === '' || e.customer === NoCustomer) continue
        teams.add(normalizeTeam(e.team))
    }
    return teams
}

export function usePendingSoldCards(args: {
    enabled: boolean // show_only_available_teams && !!activeBreakId
    activeBreakId: number | null
    events: Event[] // spine `events`
    photos: Photo[] // spine `photos` (unsold, not deleted — the board's input list)
    timeoutMs: number // PENDING_TIMEOUT_MS; <= 0 disables the timeout
}): {
    pendingIds: ReadonlySet<number>
    acknowledge: (photoId: number) => void
} {
    const { enabled, activeBreakId, events, photos, timeoutMs } = args

    // Map<photoId, since> — `since` isn't read outside this hook today, but keeping it (rather
    // than a bare Set) is what makes rule 3's "already-pending ids keep their original since"
    // cheap to honour instead of re-derived.
    const [pending, setPending] = useState<Map<number, number>>(() => new Map())
    const prevTakenRef = useRef<Set<string> | null>(null)
    const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

    const clearEntryTimer = useCallback((id: number) => {
        const t = timersRef.current.get(id)
        if (t !== undefined) {
            clearTimeout(t)
            timersRef.current.delete(id)
        }
    }, [])

    const removeIds = useCallback((ids: number[]) => {
        if (ids.length === 0) return
        ids.forEach(clearEntryTimer)
        setPending((prev) => {
            let changed = false
            const next = new Map(prev)
            for (const id of ids) {
                if (next.delete(id)) changed = true
            }
            return changed ? next : prev
        })
    }, [clearEntryTimer])

    // Rule 6: acknowledge(id) removes that id if present; no-op otherwise (removeIds already only
    // marks `changed` when the id was actually there).
    const acknowledge = useCallback((photoId: number) => {
        removeIds([photoId])
    }, [removeIds])

    // Rule 5: a timeout per entry. `timeoutMs <= 0` disables it entirely.
    const armTimer = useCallback((id: number) => {
        if (timeoutMs <= 0) return
        clearEntryTimer(id)
        const t = setTimeout(() => {
            timersRef.current.delete(id)
            removeIds([id])
        }, timeoutMs)
        timersRef.current.set(id, t)
    }, [timeoutMs, clearEntryTimer, removeIds])

    // Rule 7: `activeBreakId` change or `enabled` becoming false clears pending and re-arms the
    // baseline (rule 2, via prevTakenRef = null). Declared BEFORE the baseline/signal effect below
    // so it runs first on the same render (effects run in declaration order) — the baseline effect
    // then sees a freshly-nulled prevTakenRef and treats the current events as the new baseline,
    // not a signal.
    useEffect(() => {
        timersRef.current.forEach((t) => clearTimeout(t))
        timersRef.current.clear()
        setPending(new Map())
        prevTakenRef.current = null
        // Deliberately only [activeBreakId, enabled]: this must re-arm on identity changes of
        // those two, not on every `events`/`photos` poll tick or `timeoutMs` prop identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeBreakId, enabled])

    // Rules 2, 3, 4: baseline on first sight, then signal (newly taken -> pending) and reversal
    // (un-taken -> drop from pending, the card just stays on the board through the normal filter)
    // on every subsequent `events` change.
    useEffect(() => {
        if (!enabled) return
        // Only a response that is actually FOR the active break counts. The spine's `events` is
        // stale at exactly the moments rule 2 cares about: `[]` right after mount (the first fetch
        // hasn't resolved when the stream — and so `enabled` — arrives), and the PREVIOUS break's
        // list right after a break change. Taking either as the baseline would make the first real
        // response look like every already-sold team just sold. A break always has slot rows, so
        // `[]` is never a legitimate baseline either.
        if (events.length === 0 || events[0].break_id !== activeBreakId) return
        const now = takenTeams(events)
        if (prevTakenRef.current === null) {
            // Baseline, not signal (rule 2): teams already taken are hidden by CardsElement's
            // existing filter, as today.
            prevTakenRef.current = now
            return
        }
        const prevTeams = prevTakenRef.current
        prevTakenRef.current = now

        const newlyTakenSet = new Set<string>()
        now.forEach((t) => {
            if (!prevTeams.has(t)) newlyTakenSet.add(t)
        })
        const reversedSet = new Set<string>()
        prevTeams.forEach((t) => {
            if (!now.has(t)) reversedSet.add(t)
        })
        if (newlyTakenSet.size === 0 && reversedSet.size === 0) return

        const alreadyPendingIds = pending // read at fire time, see the eslint-disable note below

        const toAdd = photos.filter(
            (p) => !p.is_sold && !p.is_deleted && newlyTakenSet.has(normalizeTeam(p.team))
        )
        const toRemoveIds = photos
            .filter((p) => reversedSet.has(normalizeTeam(p.team)))
            .map((p) => p.id)

        toRemoveIds.forEach(clearEntryTimer)
        const since = Date.now()
        toAdd.forEach((p) => {
            // Already-pending ids keep their original `since` (rule 3) and must NOT have their
            // timeout reset by a later, unrelated signal.
            if (!alreadyPendingIds.has(p.id)) armTimer(p.id)
        })

        setPending((prevPending) => {
            const next = new Map(prevPending)
            let changed = false
            for (const id of toRemoveIds) {
                if (next.delete(id)) changed = true
            }
            for (const p of toAdd) {
                if (!next.has(p.id)) {
                    next.set(p.id, since)
                    changed = true
                }
            }
            return changed ? next : prevPending
        })
        // `photos`, `pending`, and the timer helpers are read at fire time, not tracked as deps:
        // this must run exactly once per `events` change (the "signal"), not whenever the photo
        // list happens to repoll with no events change, and not loop on its own `setPending` call.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, events, activeBreakId])

    // Rule 8: a pending id no longer present in `photos` (marked sold / deleted from controls) is
    // dropped. Runs on every `photos` change, independent of the events-driven signal above.
    useEffect(() => {
        setPending((prevPending) => {
            if (prevPending.size === 0) return prevPending
            const photoIds = new Set(photos.map((p) => p.id))
            let changed = false
            const next = new Map(prevPending)
            prevPending.forEach((_since, id) => {
                if (!photoIds.has(id)) {
                    next.delete(id)
                    clearEntryTimer(id)
                    changed = true
                }
            })
            return changed ? next : prevPending
        })
    }, [photos, clearEntryTimer])

    // Unmount: don't leak timers.
    useEffect(() => {
        const timers = timersRef.current
        return () => {
            timers.forEach((t) => clearTimeout(t))
            timers.clear()
        }
    }, [])

    const pendingIds = useMemo(() => new Set(pending.keys()), [pending])

    return { pendingIds, acknowledge }
}
