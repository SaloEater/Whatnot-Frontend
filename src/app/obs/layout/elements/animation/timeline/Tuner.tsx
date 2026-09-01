'use client'

// ?dev=1 tuner for the timeline builds (stash-or-pass-timeline-plan.md §7). Deliberately NOT a row
// added to the shared [id]/DevPanel.tsx — the timeline is local to these elements by decision, and
// so is the surface for tuning it. Nothing here touches the cue bus, OverlayState or the backend;
// Replay re-runs the entrance without changing whether the event is "on".
//
// Portalled out of the stage into a fixed dock (see `dock()` below) because .lay-canvas carries a
// transform, which makes `position: fixed` resolve against that element instead of the viewport —
// the tuner would otherwise be scaled and clipped along with the 1080x1920 canvas.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { BuiltTimeline } from './timeline'
import type { Controller } from './useTimeline'
import './Tuner.css'

const RATE_KEY = 'antl.tuner.rate'

export function Tuner({
    built,
    ctl,
    rate,
    onRate,
    onReplay,
    phase,
    title,
}: {
    built: BuiltTimeline<string> | null
    ctl: Controller
    rate: number
    onRate: (rate: number) => void
    onReplay: () => void
    phase: string
    /** Names which build this tuner belongs to — two can be on screen at once. */
    title: string
}) {
    // Mount-gated on the client only: reading location during render would differ from the SSR
    // markup. Same reason DevPanel seeds Date.now() in an effect.
    const [enabled, setEnabled] = useState(false)
    const [playhead, setPlayhead] = useState<number | null>(null)
    const [scrubbing, setScrubbing] = useState(false)
    const rafRef = useRef<number | null>(null)

    useEffect(() => {
        if (typeof window === 'undefined') return
        if (new URLSearchParams(window.location.search).get('dev') !== '1') return
        setEnabled(true)
        const saved = Number(window.localStorage.getItem(RATE_KEY))
        if (saved > 0 && saved !== 1) onRate(saved)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Poll the shared clock for the playhead. Only while something is actually running, so an
    // idle overlay costs nothing.
    useEffect(() => {
        if (!enabled) return
        const tick = () => {
            setPlayhead(ctl.time())
            rafRef.current = requestAnimationFrame(tick)
        }
        rafRef.current = requestAnimationFrame(tick)
        return () => {
            if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
        }
    }, [enabled, ctl])

    if (!enabled || typeof document === 'undefined') return null

    const total = built?.total ?? 0
    const pos = playhead === null ? 0 : Math.max(0, Math.min(total, playhead))

    return createPortal(
        <div className="antl-tuner">
            <h6>{title}</h6>

            <div className="antl-tuner-row">
                <label htmlFor="soptl-rate">rate</label>
                <input
                    id="soptl-rate"
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={rate}
                    onChange={(e) => {
                        const r = Number(e.target.value)
                        onRate(r)
                        window.localStorage.setItem(RATE_KEY, String(r))
                    }}
                />
                <span className="antl-tuner-val">{rate.toFixed(2)}×</span>
            </div>

            <div className="antl-tuner-row">
                <label htmlFor="soptl-scrub">time</label>
                <input
                    id="soptl-scrub"
                    type="range"
                    min={0}
                    max={Math.max(1, total)}
                    step={1}
                    value={Math.round(pos)}
                    onChange={(e) => {
                        if (!scrubbing) {
                            ctl.pause()
                            setScrubbing(true)
                        }
                        ctl.seek(Number(e.target.value))
                    }}
                />
                <span className="antl-tuner-val">
                    {Math.round(pos)}/{total}
                </span>
            </div>

            <div className="antl-tuner-buttons">
                <button
                    onClick={() => {
                        setScrubbing(false)
                        onReplay()
                    }}
                >
                    replay
                </button>
                <button
                    onClick={() => {
                        setScrubbing(false)
                        ctl.resume()
                    }}
                >
                    resume
                </button>
                <button onClick={() => ctl.pause()}>pause</button>
                <button onClick={() => ctl.reverse(rate)}>reverse</button>
            </div>

            {/* Stage ruler — strips proportional to each stage's duration, so a retiming shows up
                as a width change and a warm-up's start is visible as a playhead position inside
                the PREVIOUS stage. */}
            <div className="antl-tuner-ruler">
                {built?.ruler.map((s) => (
                    <div
                        key={s.id}
                        className="antl-tuner-stage"
                        style={{ width: `${total > 0 ? (s.dur / total) * 100 : 0}%` }}
                        title={`${s.id}: ${s.start}–${s.start + s.dur}ms`}
                    >
                        {s.id}
                    </div>
                ))}
                <div
                    className="antl-tuner-playhead"
                    style={{ left: `${total > 0 ? (pos / total) * 100 : 0}%` }}
                />
            </div>

            <div className="antl-tuner-tracks">
                <div>
                    <b>phase</b>
                    <span>{phase}</span>
                </div>
                {built?.resolved.map(({ track, start, duration }, i) => (
                    <div key={`${track.el}-${track.index ?? 0}-${i}`}>
                        <b>{track.label ?? `${track.el}${track.index ?? ''}`}</b>
                        <span>
                            {start}–{start + duration}ms
                        </span>
                    </div>
                ))}
            </div>
        </div>,
        dock()
    )
}

/**
 * Find-or-create the fixed column every tuner portals into. A dock rather than each panel being
 * `position: fixed` itself, because more than one build can be placed on the canvas at once and
 * they must not stack on top of each other. Portalled out of the stage because .lay-canvas carries
 * a transform, which makes `position: fixed` resolve against that element instead of the viewport.
 */
function dock(): HTMLElement {
    const id = 'antl-tuner-dock'
    let el = document.getElementById(id)
    if (!el) {
        el = document.createElement('div')
        el.id = id
        document.body.appendChild(el)
    }
    return el
}
