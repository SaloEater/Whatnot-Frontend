'use client'

// Settings for the `cards` element. The orientation/show_horizontal_row/show_only_available_teams
// block was ported verbatim from src/app/channel/[id]/widgets/page.tsx (request/response handling,
// endpoints, and the orientation option value/label mapping unchanged). obs-layout-plan.md §2.8
// extends this panel with the rest of channel/[id]/photos/controls/page.tsx — the card-size slider,
// sort mode (same localStorage keys), and the click-to-mark-sold card grid — rather than adding a
// second panel, since "no per-stage panels — operator actions live in element blocks" (§1.9).
//
// Reuses usePhotoBoard (channel/[id]/photos/usePhotoBoard.ts) as-is for the sold+unsold photo list
// and the optimistic markSold write — the old route's own polling of it is untouched elsewhere;
// importing the hook here doesn't change that file. After every mark-sold, `onFireCue` sends a
// `photos-changed` cue through the same state-update path the Actions strip uses, so the board's
// `photo_board` poll (120s in the data spine, useLayoutData.tsx) doesn't leave the OBS board stale
// for up to two minutes (obs-layout-plan.md §2.8). That cue is kept as its own direct `onFireCue`
// call rather than routed through useSettingWrite.ts below: it fires off usePhotoBoard's own
// optimistic markSold, not a `post()` call made at this call site, and it targets the `photos`
// source under its historical `photos-changed` kind rather than the generic `refetch` kind — going
// through the helper here would just be a wrapper with no write to wrap.
//
// The orientation/show_horizontal_row/show_only_available_teams block below (its own `post()`
// call) does go through useSettingWrite.ts, pushing a `cardsBoardSettings` refetch on save.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {Photo} from '@/app/entity/entities'
import type {Cue} from '@/app/obs/layout/schema'
import {usePhotoBoard} from '@/app/channel/[id]/photos/usePhotoBoard'
import {splitName, nameFontSize} from '@/app/common/cardName'
import {TeamIconSrc} from '@/app/common/teams'
import {useSettingWrite} from './useSettingWrite'

const CARD_SIZE_KEY = 'photos-controls-card-size'
const SORT_KEY = 'photos-controls-sort'

type SortMode = 'price' | 'team'

// Value/label mapping is the old widgets page's, verbatim — note the two are crossed over there
// ('list' is labelled "Gallery"), which is preserved deliberately: the stored values drive the
// board's rendering and renaming them here would change what an existing config means.
const ORIENTATIONS: ReadonlyArray<{ value: string; label: string }> = [
    {value: 'list', label: 'Gallery'},
    {value: 'gallery', label: 'Carousel'},
]

export default function CardsSettings({channelId, elementKey, onFireCue}: {
    channelId: number
    elementKey: string
    onFireCue?: (cue: Cue) => void
}) {
    const [orientation, setOrientation] = useState<string | null>(null)
    const [showHorizontalRow, setShowHorizontalRow] = useState(false)
    const [showOnlyAvailableTeams, setShowOnlyAvailableTeams] = useState(false)
    const {save: writeSetting, saving, status} = useSettingWrite(onFireCue)

    useEffect(() => {
        post(getEndpoints().widget_cards_board_get, {channel_id: channelId})
            .then((d: { orientation: string, show_horizontal_row: boolean, show_only_available_teams: boolean }) => {
                setOrientation(d?.orientation ?? 'list')
                setShowHorizontalRow(d?.show_horizontal_row ?? false)
                setShowOnlyAvailableTeams(d?.show_only_available_teams ?? false)
            })
    }, [channelId])

    /**
     * Saves on every change rather than behind a Save button. The endpoint replaces all three
     * fields at once, so the changed one is passed in explicitly: React state updates are async,
     * and reading it back off state here would post the value from before the click.
     */
    async function save(next: {
        orientation?: string
        showHorizontalRow?: boolean
        showOnlyAvailableTeams?: boolean
    }) {
        // `??` (not `||`) so an unchanged `false` checkbox is preserved rather than falling back.
        const nextOrientation = next.orientation ?? orientation
        if (nextOrientation === null) return
        await writeSetting('cardsBoardSettings', () => post(getEndpoints().widget_cards_board_update, {
            channel_id: channelId,
            orientation: nextOrientation,
            show_horizontal_row: next.showHorizontalRow ?? showHorizontalRow,
            show_only_available_teams: next.showOnlyAvailableTeams ?? showOnlyAvailableTeams,
        }))
    }

    // ---- card grid (ported from channel/[id]/photos/controls/page.tsx) --------------------------

    const {photos, markSold} = usePhotoBoard(channelId, true)

    const [cardSize, setCardSize] = useState(() => {
        if (typeof localStorage === 'undefined') return 70
        const stored = localStorage.getItem(CARD_SIZE_KEY)
        return stored ? parseInt(stored) : 70
    })

    function updateCardSize(size: number) {
        setCardSize(size)
        localStorage.setItem(CARD_SIZE_KEY, String(size))
    }

    const [sortMode, setSortMode] = useState<SortMode>(() => {
        if (typeof localStorage === 'undefined') return 'price'
        return localStorage.getItem(SORT_KEY) === 'team' ? 'team' : 'price'
    })

    function updateSortMode(mode: SortMode) {
        setSortMode(mode)
        localStorage.setItem(SORT_KEY, mode)
    }

    function handleMarkSold(photo: Photo) {
        markSold(photo.id, !photo.is_sold)
        // The board's photo_board poll is 120s (useLayoutData.tsx) — without this cue a mark-sold
        // here would take up to two minutes to reach the OBS board.
        onFireCue?.({kind: 'photos-changed'})
    }

    const byPriceDesc = (a: Photo, b: Photo) => b.price - a.price
    // Team name A→Z, most expensive first within a team.
    const byTeamThenPrice = (a: Photo, b: Photo) =>
        (a.team || '').localeCompare(b.team || '') || byPriceDesc(a, b)
    const sorter = sortMode === 'team' ? byTeamThenPrice : byPriceDesc
    const unsold = photos.filter((p) => !p.is_sold && !p.is_deleted).sort(sorter)
    const sold   = photos.filter((p) =>  p.is_sold && !p.is_deleted).sort(sorter)

    // Fits the name inside the card width, capped at 3x the base size.
    function cardNameFontSize(lines: string[]): number {
        return nameFontSize(lines, cardSize - 6, Math.max(10, cardSize * 0.12) * 3)
    }

    function renderCard(photo: Photo) {
        const nameLines = splitName(photo.name || '—')
        return (
            <div key={photo.id} style={{
                width: `${cardSize}px`,
                flexShrink: 0,
                padding: '3px',
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.35)',
                borderRadius: '4px',
            }}>
                <div style={{
                    fontSize: `${cardNameFontSize(nameLines)}px`,
                    lineHeight: 1.2,
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    marginBottom: '2px',
                }}>
                    {nameLines.map((line, i) => <div key={i}>{line}</div>)}
                </div>
                <div
                    className="position-relative"
                    style={{cursor: 'pointer'}}
                    onClick={() => handleMarkSold(photo)}
                >
                    <img
                        src={photo.url}
                        alt={photo.name || 'card'}
                        style={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                            borderRadius: '2px',
                            opacity: photo.is_sold ? 0.4 : 1,
                        }}
                    />
                    {photo.is_sold && (
                        <div style={{
                            position: 'absolute', inset: 0,
                            background: 'rgba(128,128,128,0.4)',
                            pointerEvents: 'none',
                        }} />
                    )}
                    {photo.team && (
                        <img
                            src={TeamIconSrc(photo.team)}
                            alt={photo.team}
                            title={photo.team}
                            style={{
                                position: 'absolute', bottom: '2px', left: '2px',
                                // A third of the card's rendered height — the image box is this
                                // element's positioning parent, so percentages track the photo
                                // whatever its aspect ratio.
                                height: '33%', width: 'auto', maxWidth: '100%',
                                objectFit: 'contain',
                                pointerEvents: 'none',
                                background: '#000',
                                borderRadius: '2px',
                                padding: '1px',
                            }}
                        />
                    )}
                </div>
            </div>
        )
    }

    const horizontalId = `ctl-showHorizontalRowCheck-${elementKey}`
    const onlyAvailableId = `ctl-showOnlyAvailableTeamsCheck-${elementKey}`

    return (
        <div>
            <div className="d-flex align-items-center gap-2">
                <label className="form-label mb-0 text-nowrap">Orientation</label>
                <div className="btn-group btn-group-sm" role="group" aria-label="Orientation">
                    {ORIENTATIONS.map((option) => {
                        const active = (orientation ?? 'list') === option.value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                className={`btn ${active ? 'btn-primary' : 'btn-outline-secondary'}`}
                                aria-pressed={active}
                                disabled={orientation === null}
                                onClick={() => { setOrientation(option.value); save({orientation: option.value}) }}
                            >
                                {option.label}
                            </button>
                        )
                    })}
                </div>
                {saving && <span className="text-secondary small">Saving…</span>}
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
                    onChange={(e) => { setShowHorizontalRow(e.target.checked); save({showHorizontalRow: e.target.checked}) }}
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
                    onChange={(e) => { setShowOnlyAvailableTeams(e.target.checked); save({showOnlyAvailableTeams: e.target.checked}) }}
                />
                <label className="form-check-label" htmlFor={onlyAvailableId}>Show only available teams</label>
            </div>

            <hr/>

            <div className="d-flex align-items-center gap-4 mb-2 flex-wrap">
                <div className="d-flex align-items-center gap-3" style={{width: '260px'}}>
                    <label className="text-nowrap small">Size: {cardSize}px</label>
                    <input
                        type="range"
                        className="form-range"
                        min={40}
                        max={500}
                        value={cardSize}
                        onChange={(e) => updateCardSize(parseInt(e.target.value))}
                    />
                </div>
                <div className="d-flex align-items-center gap-2">
                    <span className="text-nowrap small">Sort:</span>
                    <div className="btn-group btn-group-sm" role="group" aria-label="Sort cards">
                        <button
                            type="button"
                            className={`btn ${sortMode === 'price' ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => updateSortMode('price')}
                        >Price</button>
                        <button
                            type="button"
                            className={`btn ${sortMode === 'team' ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => updateSortMode('team')}
                        >Team</button>
                    </div>
                </div>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center'}}>
                {unsold.map((p) => renderCard(p))}
                {sold.map((p) => renderCard(p))}
            </div>
        </div>
    )
}
