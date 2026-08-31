'use client'

// Settings for the widget:name element — the series name that widget displays. Ported from the
// "Series: Name" card in src/app/channel/[id]/widgets/page.tsx, keyed by series_id (from the
// active break) like BoxesPerBreakSettings rather than by channel_id.
//
// `series_update` is a FULL replace, not a patch: the original save sends used_cards, total_cards
// and default_price back alongside the new name. So this loads the series first and echoes those
// fields unchanged — sending only {id, name} would blank the card counts and the price range.
//
// Save pushes a `series` spine refetch cue via useSettingWrite.ts so OBS (the `name` widget reads
// the `series` source) sees the new name immediately rather than waiting for the next break/series
// change to re-derive it.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {SeriesWithCount} from '@/app/entity/entities'
import type {Cue} from '@/app/obs/layout/schema'
import {useSettingWrite} from './useSettingWrite'

export default function NameSettings({seriesId, onFireCue}: {
    seriesId?: number | null
    onFireCue?: (cue: Cue) => void
}) {
    const [series, setSeries] = useState<SeriesWithCount | null>(null)
    const [name, setName] = useState('')
    const {save: writeSetting, saving, status, reset} = useSettingWrite(onFireCue)

    useEffect(() => {
        if (!seriesId) {
            setSeries(null)
            setName('')
            return
        }
        post(getEndpoints().series_get, {id: seriesId})
            .then((d: SeriesWithCount) => {
                if (!d || 'error' in d) return
                setSeries(d)
                setName(d.name ?? '')
            })
    }, [seriesId])

    async function save() {
        if (!seriesId || !series || !name.trim()) return
        const trimmed = name.trim()
        const result = await writeSetting('series', () => post(getEndpoints().series_update, {
            id: seriesId,
            name: trimmed,
            used_cards: series.used_cards,
            total_cards: series.total_cards,
            default_price: series.default_price,
        }))
        if (result.ok) {
            setSeries((prev) => (prev ? {...prev, name: trimmed} : prev))
        }
    }

    if (!seriesId) {
        return <div className="text-secondary small">No active series on the current break.</div>
    }

    return (
        <div className="d-flex align-items-center gap-2">
            <label className="form-label mb-0 text-nowrap">Name</label>
            <input
                type="text"
                className="form-control form-control-sm"
                style={{width: '160px'}}
                value={name}
                disabled={!series}
                onChange={(e) => { setName(e.target.value); reset() }}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
            />
            <button className="btn btn-sm btn-primary" onClick={save} disabled={!series || saving || !name.trim()}>
                {saving ? 'Saving…' : 'Save'}
            </button>
            {status === 'ok' && <span className="text-success small">Saved</span>}
            {status === 'error' && <span className="text-danger small">Error</span>}
        </div>
    )
}
