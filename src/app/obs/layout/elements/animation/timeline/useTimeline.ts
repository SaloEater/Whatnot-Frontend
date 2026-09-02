'use client'

// WAAPI runner for the timeline (stash-or-pass-timeline-plan.md §3). Turns a BuiltTimeline plus a
// set of DOM nodes into one controllable playback. Shared by the stash-or-pass experiments only —
// see the scope note in timeline.ts.
//
// WHY WAAPI RATHER THAN setTimeout + CSS CLASSES (what the original element does):
//   - `playbackRate` replaces the original's committed `TIME_SCALE = 5` / `--sopw-ts: 5` debug
//     hack — the same knob, live, from the tuner, with nothing left in the source.
//   - `reverse()` replaces the original's entire hand-written second machine (`ExitBeat`,
//     EXIT_GATHER/MERGE/COLLAPSE_MS, `sopw-copy-release`). The exit is now DERIVED, so it can
//     never drift from the entrance (spec §7.4's worry).
//   - `fill: 'forwards'` removes the "a transition never fires on a value an element is born
//     with" hazard that forced four rules in the original CSS to be `animation … forwards` with
//     their beat lengths duplicated out of the .tsx.
//
// There is no GroupEffect in any browser, so "one timeline" is really N Animations that share a
// time origin (each track's start is baked into its own `delay`). One playbackRate / currentTime
// value is therefore correct for all of them, and fanning a call across the array is exactly
// equivalent to driving a group.

import { useCallback, useEffect, useRef } from 'react'
import type { BuiltTimeline } from './timeline'

/** Animatable nodes may be SVG (the ring build's lane) as well as HTML. */
type AnyEl = HTMLElement | SVGElement

export type NodeStore<E extends string = string> = {
    /** Stable ref callback for one node, e.g. `ref={nodes.ref('copy', 2)}`. */
    ref: (el: E, index?: number) => (node: AnyEl | null) => void
    get: (el: E, index?: number) => AnyEl | undefined
}

/**
 * Ref-callback registry. The callbacks are cached per `el:index`, so a re-render does not hand
 * React a new function identity and make it detach/reattach every node.
 */
export function useNodes<E extends string = string>(): NodeStore<E> {
    const store = useRef(new Map<string, AnyEl>())
    const cbs = useRef(new Map<string, (node: AnyEl | null) => void>())

    const ref = useCallback((el: E, index = 0) => {
        const key = `${el}:${index}`
        let cb = cbs.current.get(key)
        if (!cb) {
            cb = (node: AnyEl | null) => {
                if (node) store.current.set(key, node)
                else store.current.delete(key)
            }
            cbs.current.set(key, cb)
        }
        return cb
    }, [])

    const get = useCallback((el: E, index = 0) => store.current.get(`${el}:${index}`), [])

    // Stable object, for the same reason the Controller below is one: consumers hold onto it
    // across renders, and both members already read through refs.
    const api = useRef<NodeStore<E>>()
    if (!api.current) api.current = { ref, get }
    return api.current
}

export type Controller = {
    /** Build fresh animations from the current nodes and play forward from 0. */
    play: () => void
    /**
     * Run the timeline backwards. From a live forward play this reverses IN PLACE, from wherever
     * it had got to (toggling the event off mid-entrance rewinds what actually happened rather
     * than cutting to a canned exit). With nothing playing — the normal case, coming out of the
     * steady-state orbit — it rebuilds at the end of the timeline and runs back from there.
     */
    reverse: (rate?: number) => void
    cancel: () => void
    pause: () => void
    resume: () => void
    setRate: (rate: number) => void
    seek: (ms: number) => void
    /** Current position on the shared clock, or null when nothing is attached. */
    time: () => number | null
    running: () => boolean
}

type Opts = {
    /** Forward playback rate. 1 = the choreography's real timings; 0.2 = the 1/5 debug pace. */
    rate: number
    /** Fires once a whole pass completes, with the direction it completed in. */
    onDone?: (direction: 'forward' | 'reverse') => void
}

export function useTimeline<E extends string>(
    built: BuiltTimeline<E> | null,
    nodes: NodeStore<E>,
    opts: Opts
): Controller {
    const anims = useRef<Animation[]>([])
    const timers = useRef<ReturnType<typeof setTimeout>[]>([])
    // Same cancellation idiom the original element used for its timer chain: a pass that has been
    // superseded (a re-cue, an unmount) must not fire its completion handler.
    const gen = useRef(0)
    const builtRef = useRef(built)
    builtRef.current = built
    const optsRef = useRef(opts)
    optsRef.current = opts

    const clearTimers = useCallback(() => {
        timers.current.forEach(clearTimeout)
        timers.current = []
    }, [])

    const cancel = useCallback(() => {
        gen.current++
        clearTimers()
        anims.current.forEach((a) => a.cancel())
        anims.current = []
    }, [clearTimers])

    /**
     * Attach one Animation per resolved track, in clock order (see buildTimeline's sort note).
     *
     * The sequencing here is deliberate and every step of it is load-bearing:
     *
     *   `pause()` FIRST. `Element.animate()` returns an animation that is already playing at
     *   currentTime 0. Setting a negative playbackRate on that instantly satisfies the reverse
     *   finished condition (currentTime <= 0), which RESOLVES the animation's `finished` promise.
     *   Seeking afterwards is supposed to replace that promise, but the replacement happens during
     *   the next animation-frame update, not synchronously — so a `finished` read in the same task
     *   still hands back the already-resolved one, and the whole pass "completes" a microtask
     *   later. That is what made the exit end in a single frame.
     *
     *   `persist()`. Chrome automatically REMOVES an animation that is finished, filling, and
     *   fully covered by a later one on the same property. That describes every track in a chain
     *   once the pass has run forward — so playing backwards afterwards found only the LAST track
     *   of each element still applying. On the ring that left the lane (a single `lane forms`
     *   track) as the only thing that could still animate, which is precisely the "it just fades
     *   out and nothing else happens" symptom. Persisting opts out of the removal.
     *
     *   Seek BEFORE setting the rate, and only then `play()`, so the animation never sits at a
     *   boundary in the direction it is about to travel.
     */
    const attach = useCallback(
        (rate: number, startAt: number): Animation[] => {
            const b = builtRef.current
            if (!b) return []
            const out: Animation[] = []
            for (const { track, start, duration } of b.resolved) {
                const node = nodes.get(track.el, track.index ?? 0)
                if (!node) continue // the rig is not mounted for this pass — skip, do not throw
                const anim = node.animate(track.keys, {
                    delay: start,
                    duration,
                    easing: track.easing ?? 'linear',
                    fill: 'forwards',
                })
                anim.pause()
                anim.persist?.()
                anim.currentTime = startAt
                anim.playbackRate = rate
                anim.play()
                out.push(anim)
            }
            return out
        },
        [nodes]
    )

    /**
     * Schedule the completion callback.
     *
     * Deliberately a timer over the pass's KNOWN duration rather than `Promise.all(a.finished)`.
     * The timeline says exactly how long a pass takes — `distance / rate` — so there is nothing to
     * discover, and a timer cannot resolve early the way a stale finished promise can (see
     * `attach`). The generation counter is what makes it safe: a superseded pass never fires.
     */
    const settle = useCallback((distanceMs: number, rate: number, myGen: number, direction: 'forward' | 'reverse') => {
        const ms = Math.max(0, distanceMs / Math.max(0.0001, Math.abs(rate)))
        const id = setTimeout(() => {
            if (gen.current !== myGen) return
            optsRef.current.onDone?.(direction)
        }, ms)
        timers.current.push(id)
    }, [])

    const play = useCallback(() => {
        const b = builtRef.current
        if (!b) return
        cancel()
        const myGen = gen.current
        const rate = optsRef.current.rate
        anims.current = attach(rate, 0)
        settle(b.total, rate, myGen, 'forward')
    }, [attach, cancel, settle])

    const reverse = useCallback(
        (rate?: number) => {
            const b = builtRef.current
            if (!b) return
            const r = Math.abs(rate ?? optsRef.current.rate)
            const live = anims.current.length > 0 && anims.current.some((a) => a.playState === 'running')

            if (live) {
                // Reverse in place, from wherever the forward pass actually got to — so toggling
                // off mid-entrance rewinds what happened rather than cutting to a canned exit.
                const from = Number(anims.current[0].currentTime ?? b.total)
                gen.current++
                clearTimers()
                const myGen = gen.current
                anims.current.forEach((a) => {
                    a.playbackRate = -r
                    a.play()
                })
                settle(from, r, myGen, 'reverse')
                return
            }

            cancel()
            const myGen = gen.current
            // Park at the end of the timeline: with `fill: 'forwards'` that holds every track's
            // final value, which is exactly the state the orbit is in.
            anims.current = attach(-r, b.total)
            settle(b.total, r, myGen, 'reverse')
        },
        [attach, cancel, clearTimers, settle]
    )

    /**
     * Re-arm the completion timer from wherever the pass actually is now. Needed by everything
     * that changes the clock or the rate mid-pass — otherwise the timer, which was sized once when
     * the pass started, fires at the wrong moment. Bumping the generation is what retires the old
     * one.
     */
    const reschedule = useCallback(() => {
        const b = builtRef.current
        const a = anims.current[0]
        if (!b || !a) return
        const backwards = a.playbackRate < 0
        const now = Number(a.currentTime ?? 0)
        gen.current++
        clearTimers()
        settle(backwards ? now : b.total - now, a.playbackRate, gen.current, backwards ? 'reverse' : 'forward')
    }, [clearTimers, settle])

    const setRate = useCallback(
        (rate: number) => {
            anims.current.forEach((a) => {
                // Preserve direction — the tuner's slider is a magnitude, not a sign.
                a.playbackRate = a.playbackRate < 0 ? -Math.abs(rate) : Math.abs(rate)
            })
            reschedule()
        },
        [reschedule]
    )

    const seek = useCallback(
        (ms: number) => {
            anims.current.forEach((a) => {
                a.currentTime = ms
            })
            reschedule()
        },
        [reschedule]
    )

    // Pausing must also disarm the completion timer, or a paused pass still "finishes" on schedule.
    const pause = useCallback(() => {
        clearTimers()
        anims.current.forEach((a) => a.pause())
    }, [clearTimers])
    const resume = useCallback(() => {
        anims.current.forEach((a) => a.play())
        reschedule()
    }, [reschedule])
    const time = useCallback(() => {
        const a = anims.current[0]
        return a && a.currentTime !== null ? Number(a.currentTime) : null
    }, [])
    const running = useCallback(() => anims.current.some((a) => a.playState === 'running'), [])

    // Unmount: drop every animation, same contract as the original element's timer cleanup.
    useEffect(() => cancel, [cancel])

    // One stable object for the life of the component. Every method is a useCallback that already
    // reads its inputs through refs, so a fresh object each render would only churn the identity
    // and restart consumers' effects (the tuner's rAF loop, for one) on every state change.
    const ctl = useRef<Controller>()
    if (!ctl.current) {
        ctl.current = { play, reverse, cancel, pause, resume, setRate, seek, time, running }
    }
    return ctl.current
}
