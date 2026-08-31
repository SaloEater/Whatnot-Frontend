'use client'

// WAAPI runner for the local timeline (stash-or-pass-timeline-plan.md §3). Turns a BuiltTimeline
// plus a set of DOM nodes into one controllable playback.
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
import type { BuiltTimeline, ElId } from './timeline'

export type NodeStore = {
    /** Stable ref callback for one node, e.g. `ref={nodes.ref('copy', 2)}`. */
    ref: (el: ElId, index?: number) => (node: HTMLElement | null) => void
    get: (el: ElId, index?: number) => HTMLElement | undefined
}

/**
 * Ref-callback registry. The callbacks are cached per `el:index`, so a re-render does not hand
 * React a new function identity and make it detach/reattach every node.
 */
export function useNodes(): NodeStore {
    const store = useRef(new Map<string, HTMLElement>())
    const cbs = useRef(new Map<string, (node: HTMLElement | null) => void>())

    const ref = useCallback((el: ElId, index = 0) => {
        const key = `${el}:${index}`
        let cb = cbs.current.get(key)
        if (!cb) {
            cb = (node: HTMLElement | null) => {
                if (node) store.current.set(key, node)
                else store.current.delete(key)
            }
            cbs.current.set(key, cb)
        }
        return cb
    }, [])

    const get = useCallback((el: ElId, index = 0) => store.current.get(`${el}:${index}`), [])

    // Stable object, for the same reason the Controller below is one: consumers hold onto it
    // across renders, and both members already read through refs.
    const api = useRef<NodeStore>()
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

export function useTimeline(built: BuiltTimeline | null, nodes: NodeStore, opts: Opts): Controller {
    const anims = useRef<Animation[]>([])
    // Same cancellation idiom the original element used for its timer chain: a pass that has been
    // superseded (a re-cue, an unmount) must not fire its completion handler.
    const gen = useRef(0)
    const builtRef = useRef(built)
    builtRef.current = built
    const optsRef = useRef(opts)
    optsRef.current = opts

    const cancel = useCallback(() => {
        gen.current++
        anims.current.forEach((a) => a.cancel())
        anims.current = []
    }, [])

    /** Attach one Animation per resolved track, in clock order (see buildTimeline's sort note). */
    const attach = useCallback(
        (rate: number): Animation[] => {
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
                anim.playbackRate = rate
                out.push(anim)
            }
            return out
        },
        [nodes]
    )

    const settle = useCallback((list: Animation[], myGen: number, direction: 'forward' | 'reverse') => {
        if (list.length === 0) {
            optsRef.current.onDone?.(direction)
            return
        }
        Promise.all(list.map((a) => a.finished))
            .then(() => {
                if (gen.current !== myGen) return
                optsRef.current.onDone?.(direction)
            })
            .catch(() => {
                /* cancelled — a newer pass took over, nothing to do */
            })
    }, [])

    const play = useCallback(() => {
        cancel()
        const myGen = gen.current
        const list = attach(optsRef.current.rate)
        anims.current = list
        settle(list, myGen, 'forward')
    }, [attach, cancel, settle])

    const reverse = useCallback(
        (rate?: number) => {
            const b = builtRef.current
            if (!b) return
            const r = Math.abs(rate ?? optsRef.current.rate)
            const live = anims.current.length > 0 && anims.current.some((a) => a.playState === 'running')

            if (live) {
                // Reverse in place. `finished` is replaced whenever an animation leaves the
                // finished state, so it is read AFTER the direction flip, below.
                gen.current++
                const myGen = gen.current
                anims.current.forEach((a) => {
                    a.playbackRate = -r
                    a.play()
                })
                settle(anims.current, myGen, 'reverse')
                return
            }

            cancel()
            const myGen = gen.current
            const list = attach(-r)
            // Park every animation past the end of the timeline first: with `fill: 'forwards'`
            // that holds each track's final value, which is exactly the state the orbit is in.
            list.forEach((a) => {
                a.currentTime = b.total
                a.play()
            })
            anims.current = list
            settle(list, myGen, 'reverse')
        },
        [attach, cancel, settle]
    )

    const setRate = useCallback((rate: number) => {
        anims.current.forEach((a) => {
            // Preserve direction — the tuner's slider is a magnitude, not a sign.
            a.playbackRate = a.playbackRate < 0 ? -Math.abs(rate) : Math.abs(rate)
        })
    }, [])

    const seek = useCallback((ms: number) => {
        anims.current.forEach((a) => {
            a.currentTime = ms
        })
    }, [])

    const pause = useCallback(() => anims.current.forEach((a) => a.pause()), [])
    const resume = useCallback(() => anims.current.forEach((a) => a.play()), [])
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
