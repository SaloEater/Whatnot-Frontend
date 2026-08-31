'use client'

// Settings for the widget:chasersLeft element — the whole "Series: Count Widget" section pulled
// across from src/app/channel/[id]/widgets/page.tsx, not just its show-percentage toggle:
//
//   - Show percentage — channel-wide display toggle for this widget.
//   - Used Cards — the live +/- and Set editor. This is operator-facing DURING a break (used cards
//     climbs as boxes are ripped) and it drives everything the chasers widget shows, so it belongs
//     next to the widget rather than on a separate admin page.
//   - Readouts — Available, Side Cards, Chaser Cards, Chance to hit. All derived from the same
//     series counts; kept because they are how the operator sanity-checks what the overlay is
//     about to display.
//
// Request/response handling is ported verbatim. `series_update` is a FULL replace, so every save
// echoes name/total_cards/default_price back unchanged — sending only the changed field would
// blank the rest.
//
// Two independent writes here push two different spine sources via useSettingWrite.ts: show
// percentage is channel-wide state (`countSettings`); the used-cards bump/Set editor changes the
// series' card counts (`seriesCount`, the same source the chasersLeft widget itself reads).

import {useCallback, useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {SeriesWithCount} from '@/app/entity/entities'
import type {Cue} from '@/app/obs/layout/schema'
import {useSettingWrite} from './useSettingWrite'

const DELTAS = [1, 2, 3, 4]

export default function CountSettings({
    channelId,
    elementKey,
    seriesId,
    onFireCue,
}: {
    channelId: number
    elementKey: string
    seriesId?: number | null
    onFireCue?: (cue: Cue) => void
}) {
    const [showPct, setShowPct] = useState(false)
    const [loaded, setLoaded] = useState(false)
    const [count, setCount] = useState<SeriesWithCount | null>(null)
    const [customInput, setCustomInput] = useState('')
    const {save: writeSetting, saving} = useSettingWrite(onFireCue)

    useEffect(() => {
        post(getEndpoints().widget_channel_count_settings_get, {channel_id: channelId})
            .then((d: { show_percentage: boolean }) => {
                if (d != null) setShowPct(d.show_percentage)
                setLoaded(true)
            })
    }, [channelId])

    const loadCount = useCallback(() => {
        if (!seriesId) {
            setCount(null)
            return
        }
        post(getEndpoints().series_get_with_count, {id: seriesId})
            .then((d: SeriesWithCount) => { if (d && !('error' in d)) setCount(d) })
    }, [seriesId])

    useEffect(() => { loadCount() }, [loadCount])

    async function saveShowPct(val: boolean) {
        setShowPct(val)
        await writeSetting('countSettings', () => post(getEndpoints().widget_channel_count_settings_update, {channel_id: channelId, show_percentage: val}))
    }

    async function setUsedCards(value: number) {
        if (!count || !seriesId) return
        await writeSetting('seriesCount', () => post(getEndpoints().series_update, {
            id: seriesId,
            name: count.name,
            used_cards: value,
            total_cards: count.total_cards,
            default_price: count.default_price,
        }))
        loadCount()
    }

    function bump(delta: number) {
        if (count) setUsedCards(count.used_cards + delta)
    }

    function handleSet() {
        const v = parseInt(customInput, 10)
        if (!Number.isNaN(v)) {
            setUsedCards(v)
            setCustomInput('')
        }
    }

    const inputId = `ctl-showPctCheck-${elementKey}`
    const available = count ? count.total_cards - count.used_cards : 0
    const sideCards = count ? available - count.unsold_count : 0
    const unsoldPct = count && available > 0 ? Math.round((count.unsold_count / available) * 100) : 0

    return (
        <div className="d-flex flex-column gap-2">
            <div className="form-check">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id={inputId}
                    checked={showPct}
                    disabled={!loaded}
                    onChange={(e) => saveShowPct(e.target.checked)}
                />
                <label className="form-check-label" htmlFor={inputId}>Show percentage</label>
            </div>

            {!seriesId && <div className="text-secondary small">Active break has no series assigned.</div>}

            {seriesId && count && (
                <>
                    <div>
                        <div className="text-secondary small">Used cards</div>
                        <div className="fs-5 fw-bold">{count.used_cards}</div>
                        <div className="d-flex flex-wrap gap-1 mt-1">
                            {DELTAS.map((d) => (
                                <button
                                    key={`+${d}`}
                                    className="btn btn-sm btn-outline-success"
                                    disabled={saving}
                                    onClick={() => bump(d)}
                                >
                                    +{d}
                                </button>
                            ))}
                            {DELTAS.map((d) => (
                                <button
                                    key={`-${d}`}
                                    className="btn btn-sm btn-outline-danger"
                                    disabled={saving}
                                    onClick={() => bump(-d)}
                                >
                                    -{d}
                                </button>
                            ))}
                        </div>
                        <div className="d-flex gap-2 align-items-center mt-1">
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '90px'}}
                                placeholder="custom"
                                value={customInput}
                                onChange={(e) => setCustomInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSet() }}
                            />
                            <button
                                className="btn btn-sm btn-primary"
                                disabled={saving || customInput === ''}
                                onClick={handleSet}
                            >
                                Set
                            </button>
                        </div>
                    </div>

                    <div className="d-flex flex-wrap gap-3">
                        <div>
                            <div className="text-secondary ctl-count-readout">Available</div>
                            <div className="fw-bold ctl-count-readout">{available}</div>
                            <div className="text-secondary small">total {count.total_cards} − used {count.used_cards}</div>
                        </div>
                        <div>
                            <div className="text-secondary ctl-count-readout">Side cards</div>
                            <div className="fw-bold ctl-count-readout">{sideCards}</div>
                            <div className="text-secondary small">available − chasers {count.unsold_count}</div>
                        </div>
                        <div>
                            <div className="text-secondary ctl-count-readout">Chasers</div>
                            <div className="fw-bold ctl-count-readout">{count.unsold_count}</div>
                        </div>
                        <div>
                            <div className="text-secondary ctl-count-readout">Chance to hit</div>
                            <div className="fw-bold ctl-count-readout">{unsoldPct}%</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
