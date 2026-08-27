'use client'

// ?dev=1 debug overlay — rendered outside the scaled <Stage> canvas so it stays legible
// regardless of window size. Nothing here touches the backend: the phase buttons are a
// local-only override (obs-layout-plan.md §1.4).

import {useEffect, useState} from 'react'
import {PHASES} from '../schema'
import type {Phase} from '../schema'
import {useLayoutData} from '../useLayoutData'
import {useCueBus} from '../cueBus'
import {SCENE_EVENTS} from '../sceneEvents'

function agoLabel(now: number | null, at: number | undefined): string {
    if (now === null) return '-'
    if (at === undefined) return 'never'
    const seconds = Math.max(0, Math.round((now - at) / 1000))
    return `${seconds}s ago`
}

export function DevPanel({
    phase,
    seq,
    lastBusEventAt,
    onSetPhase,
}: {
    phase: Phase
    seq: number
    lastBusEventAt: number | null
    onSetPhase: (phase: Phase) => void
}) {
    const {lastFetched} = useLayoutData()
    const cueBus = useCueBus()

    // Date.now()/localStorage must not run during render (SSR has neither) — seed both in
    // effects so the first client render still matches the server's markup.
    const [now, setNow] = useState<number | null>(null)

    useEffect(() => {
        setNow(Date.now())
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [])

    return (
        <div className="lay-dev-panel">
            <div className="lay-dev-row">
                <span className="lay-dev-label">phase</span>
                <div className="lay-dev-phase-buttons">
                    {PHASES.map((p) => (
                        <button
                            key={p}
                            type="button"
                            className={`lay-dev-phase-btn${p === phase ? ' lay-dev-phase-btn--active' : ''}`}
                            onClick={() => onSetPhase(p)}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>
            <div className="lay-dev-row">
                <span className="lay-dev-label">seq</span>
                <span>{seq}</span>
            </div>
            <div className="lay-dev-row">
                <span className="lay-dev-label">last bus event</span>
                <span>{agoLabel(now, lastBusEventAt ?? undefined)}</span>
            </div>
            <div className="lay-dev-row">
                <span className="lay-dev-label">events</span>
                <div className="lay-dev-event-buttons">
                    {SCENE_EVENTS.map((ev) => (
                        <button
                            key={ev.name}
                            type="button"
                            className="lay-dev-event-btn"
                            title={`Emit "${ev.name}" locally, same path as a bus cue`}
                            onClick={() => cueBus.emit({kind: 'event', name: ev.name})}
                        >
                            {ev.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="lay-dev-sources">
                {Object.entries(lastFetched)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, at]) => (
                        <div key={key} className="lay-dev-row">
                            <span className="lay-dev-label">{key}</span>
                            <span>{agoLabel(now, at)}</span>
                        </div>
                    ))}
            </div>
        </div>
    )
}
