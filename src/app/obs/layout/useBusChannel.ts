// Shared listener plumbing for the two OBS bus transports (obs-browser-event-bus.md §3/§6): the
// durable channel (BusPayload over BUS_EVENT_NAME) and the transient cue channel (CuePayload over
// BUS_CUE_EVENT_NAME). Both wire up the same pair of listeners — a real window CustomEvent and a
// dev-only BroadcastChannel mirror — differing only in event name, dev-channel name, parsing and
// what happens with the parsed payload. This hook is only that plumbing: seq guards and the
// per-channel apply callbacks stay with their callers.

import {useEffect} from 'react'

export function useBusChannel<T>(
    eventName: string,
    devChannelName: string,
    devMode: boolean,
    parse: (detail: unknown) => T | null,
    apply: (payload: T) => void,
): void {
    // Real OBS browser-source bus: window CustomEvent dispatched by the obs-browser plugin.
    useEffect(() => {
        function onTrigger(e: Event) {
            const payload = parse((e as CustomEvent).detail)
            if (payload) apply(payload)
        }
        window.addEventListener(eventName, onTrigger)
        return () => window.removeEventListener(eventName, onTrigger)
    }, [eventName, parse, apply])

    // Dev shim: outside OBS there is no obs-browser plugin, so mirror the same payloads over a
    // BroadcastChannel instead (obs-browser-event-bus.md §3.3).
    useEffect(() => {
        if (!devMode || typeof BroadcastChannel === 'undefined') return
        const channel = new BroadcastChannel(devChannelName)
        channel.onmessage = (e: MessageEvent) => {
            const payload = parse(e.data)
            if (payload) apply(payload)
        }
        return () => channel.close()
    }, [devMode, devChannelName, parse, apply])
}
