'use client'

// Settings for the `cards` element, ported verbatim (request/response handling, endpoints, and
// the orientation option value/label mapping) from src/app/channel/[id]/widgets/page.tsx.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'

export default function CardsSettings({channelId, elementKey}: { channelId: number; elementKey: string }) {
    const [orientation, setOrientation] = useState<string | null>(null)
    const [showHorizontalRow, setShowHorizontalRow] = useState(false)
    const [showOnlyAvailableTeams, setShowOnlyAvailableTeams] = useState(false)
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle')

    useEffect(() => {
        post(getEndpoints().widget_cards_board_get, {channel_id: channelId})
            .then((d: { orientation: string, show_horizontal_row: boolean, show_only_available_teams: boolean }) => {
                setOrientation(d?.orientation ?? 'list')
                setShowHorizontalRow(d?.show_horizontal_row ?? false)
                setShowOnlyAvailableTeams(d?.show_only_available_teams ?? false)
            })
    }, [channelId])

    async function save() {
        if (orientation === null) return
        setSaving(true)
        setStatus('idle')
        try {
            await post(getEndpoints().widget_cards_board_update, {
                channel_id: channelId,
                orientation,
                show_horizontal_row: showHorizontalRow,
                show_only_available_teams: showOnlyAvailableTeams,
            })
            setStatus('ok')
        } catch {
            setStatus('error')
        } finally {
            setSaving(false)
        }
    }

    const horizontalId = `ctl-showHorizontalRowCheck-${elementKey}`
    const onlyAvailableId = `ctl-showOnlyAvailableTeamsCheck-${elementKey}`

    return (
        <div>
            <div className="d-flex align-items-center gap-2">
                <label className="form-label mb-0 text-nowrap">Orientation</label>
                <select
                    className="form-select form-select-sm"
                    style={{width: '140px'}}
                    value={orientation ?? 'list'}
                    disabled={orientation === null}
                    onChange={(e) => { setOrientation(e.target.value); setStatus('idle') }}
                >
                    <option value="list">Gallery</option>
                    <option value="gallery">Carousel</option>
                </select>
                <button className="btn btn-sm btn-primary" onClick={save} disabled={orientation === null || saving}>
                    {saving ? 'Saving…' : 'Save'}
                </button>
                {status === 'ok' && <span className="text-success small">Saved</span>}
                {status === 'error' && <span className="text-danger small">Error</span>}
            </div>
            <div className="form-check mt-2">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id={horizontalId}
                    checked={showHorizontalRow}
                    disabled={orientation === null}
                    onChange={(e) => { setShowHorizontalRow(e.target.checked); setStatus('idle') }}
                />
                <label className="form-check-label" htmlFor={horizontalId}>Show horizontal row</label>
            </div>
            <div className="form-check">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id={onlyAvailableId}
                    checked={showOnlyAvailableTeams}
                    disabled={orientation === null}
                    onChange={(e) => { setShowOnlyAvailableTeams(e.target.checked); setStatus('idle') }}
                />
                <label className="form-check-label" htmlFor={onlyAvailableId}>Show only available teams</label>
            </div>
        </div>
    )
}
