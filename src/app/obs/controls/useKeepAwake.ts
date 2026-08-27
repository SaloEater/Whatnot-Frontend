'use client'

// Keeps the controls tab responsive for the Stream Deck (elgato-plugin-plan.md §E3.4).
//
// The deck's commands arrive over this tab's obs-websocket connection, so the tab has to stay
// alive all stream. Chrome can throttle a hidden tab's timers to 1/min after 5 minutes, freeze it
// under Energy Saver (hidden + silent > 5 min, CPU-intensive), or discard it under memory
// pressure. Holding a WebSocket open is NOT on Chrome's exemption list — holding a Web Lock is,
// and so is updating the tab title.
//
// The strongest mitigation is not code: keep this page VISIBLE in its own window. A visible tab is
// never frozen, discarded, or timer-throttled. What follows is insurance for when it isn't.

import {useEffect} from 'react'

export function useKeepAwake(stageLabel: string, onResume?: () => void) {
    // A Web Lock held for the page's lifetime is an explicitly documented exemption from Energy
    // Saver freezing. The promise never settles, so the lock is never released.
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.locks) return

        const controller = new AbortController()
        navigator.locks
            .request('mob-controls-awake', {signal: controller.signal}, () => new Promise<never>(() => {}))
            .catch(() => {
                // Aborted on unmount, or locks unavailable — neither is worth surfacing.
            })

        return () => controller.abort()
    }, [])

    // Updating the title is a documented signal that prevents freezing and discarding, and it puts
    // the current stage in the tab strip, which is useful anyway.
    useEffect(() => {
        document.title = `${stageLabel} — OBS Controls`
    }, [stageLabel])

    // If it was frozen or discarded anyway, the page's view of the world is stale on the way back.
    useEffect(() => {
        function onResumed() {
            console.warn('[keepAwake] tab resumed from frozen state — re-syncing')
            onResume?.()
        }

        document.addEventListener('resume', onResumed)
        if ((document as Document & {wasDiscarded?: boolean}).wasDiscarded) {
            console.warn('[keepAwake] tab had been discarded and was reloaded')
        }

        return () => document.removeEventListener('resume', onResumed)
    }, [onResume])
}
