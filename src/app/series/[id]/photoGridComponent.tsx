'use client'

import React, {FC, useState} from "react";
import {Photo} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";
import {Teams} from "@/app/common/teams";

interface PhotoGridComponentProps {
    photos: Photo[]
    deletedPhotos?: Photo[]
    isLoading?: boolean
    onDelete: (id: number) => void
    onRestore?: (id: number) => void
    onTeamChange: (id: number, team: string) => void
    onPriceChange: (id: number, price: number) => void
    onUrlChange: (id: number, url: string) => void
}

type SortField = 'price' | 'name'
type SortDir   = 'asc'   | 'desc'

const ROTATIONS = [0, 90, 180, 270] as const

export const PhotoGridComponent: FC<PhotoGridComponentProps> = ({photos, deletedPhotos = [], isLoading, onDelete, onRestore, onTeamChange, onPriceChange, onUrlChange}) => {
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())
    const [sortField, setSortField] = useState<SortField>('price')
    const [sortDir,   setSortDir]   = useState<SortDir>('desc')
    const [rotatingPhoto, setRotatingPhoto] = useState<Photo | null>(null)
    const [rotating, setRotating] = useState(false)

    function toggleSort(field: SortField) {
        if (field === sortField) {
            setSortDir((d) => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortField(field)
            setSortDir('desc')
        }
    }

    function sortedPhotos(list: Photo[]): Photo[] {
        return [...list].sort((a, b) => {
            let cmp = 0
            if (sortField === 'price') cmp = a.price - b.price
            else cmp = (a.name ?? '').localeCompare(b.name ?? '')
            return sortDir === 'asc' ? cmp : -cmp
        })
    }

    function markLoaded(id: number) {
        setLoadedImages((prev) => new Set(prev).add(id))
    }

    function deletePhoto(id: number) {
        post(getEndpoints().photo_delete, {id}).then(() => onDelete(id))
    }

    function restorePhoto(id: number) {
        post(getEndpoints().photo_restore, {id}).then(() => onRestore?.(id))
    }

    function setTeam(photo: Photo, team: string) {
        post(getEndpoints().photo_update, {id: photo.id, name: photo.name, team, price: photo.price}).then(() => onTeamChange(photo.id, team))
    }

    function setPrice(photo: Photo, price: number) {
        post(getEndpoints().photo_update, {id: photo.id, name: photo.name, team: photo.team, price}).then(() => onPriceChange(photo.id, price))
    }

    async function applyRotation(degrees: number) {
        if (!rotatingPhoto || degrees === 0) {
            setRotatingPhoto(null)
            return
        }
        setRotating(true)
        const resp = await post(getEndpoints().photo_rotate, {id: rotatingPhoto.id, degrees})
        if (resp?.url) {
            onUrlChange(rotatingPhoto.id, resp.url)
        }
        setRotatingPhoto(null)
        setRotating(false)
    }

    function renderCard(photo: Photo, deleted = false) {
        const imgLoaded = loadedImages.has(photo.id)
        return (
            <div key={photo.id} className="col-6 col-sm-4 col-md-3">
                <div className="position-relative">
                    <div
                        className="rounded"
                        style={{width: '100%', aspectRatio: '3/4', backgroundColor: '#444', overflow: 'hidden', opacity: deleted ? 0.45 : 1}}
                    >
                        <img
                            src={photo.url}
                            alt={photo.name || 'card'}
                            style={{width: '100%', height: '100%', objectFit: 'contain', display: imgLoaded ? 'block' : 'none'}}
                            onLoad={() => markLoaded(photo.id)}
                        />
                    </div>
                    {deleted ? (
                        <button
                            className="btn btn-sm btn-success position-absolute top-0 end-0 m-1"
                            style={{fontSize: '11px'}}
                            onClick={() => restorePhoto(photo.id)}
                        >Restore</button>
                    ) : (
                        <>
                            <button
                                className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 p-0 lh-1"
                                style={{width: '22px', height: '22px', fontSize: '12px'}}
                                onClick={() => deletePhoto(photo.id)}
                            >×</button>
                            <button
                                className="btn btn-sm btn-secondary position-absolute top-0 end-0 m-1 p-0 lh-1"
                                style={{width: '22px', height: '22px', fontSize: '13px', right: '30px'}}
                                onClick={() => setRotatingPhoto(photo)}
                                title="Rotate"
                            >↻</button>
                        </>
                    )}
                </div>
                <select
                    className="form-select form-select-sm mt-1"
                    value={photo.team || ''}
                    onChange={(e) => setTeam(photo, e.target.value)}
                >
                    <option value="">— no team —</option>
                    <option value="Miscellaneous">Miscellaneous</option>
                    {Teams.map((t) => (
                        <option key={t} value={t}>{t}</option>
                    ))}
                </select>
                <input
                    type="number"
                    min="0"
                    step="1"
                    className="form-control form-control-sm mt-1"
                    defaultValue={photo.price ?? 0}
                    key={photo.id}
                    onBlur={(e) => setPrice(photo, parseFloat(e.target.value) || 0)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                />
            </div>
        )
    }

    if (isLoading) {
        return (
            <div className="row g-2">
                {Array.from({length: 8}).map((_, i) => (
                    <div key={i} className="col-6 col-sm-4 col-md-3">
                        <div className="rounded bg-secondary" style={{width: '100%', aspectRatio: '3/4'}} />
                        <select className="form-select form-select-sm mt-1" disabled>
                            <option>— no team —</option>
                        </select>
                    </div>
                ))}
            </div>
        )
    }

    const dirArrow = sortDir === 'asc' ? '↑' : '↓'

    return (
        <>
            {rotatingPhoto && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 1000,
                    background: 'rgba(0,0,0,0.85)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '24px',
                }}>
                    <button
                        onClick={() => setRotatingPhoto(null)}
                        style={{
                            position: 'absolute', top: '16px', right: '20px',
                            background: 'none', border: 'none', color: '#fff',
                            fontSize: '28px', cursor: 'pointer', lineHeight: 1,
                        }}
                    >×</button>
                    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px'}}>
                        {ROTATIONS.map((deg) => (
                            <button
                                key={deg}
                                disabled={rotating}
                                onClick={() => applyRotation(deg)}
                                style={{
                                    background: deg === 0 ? '#333' : '#1a1a1a',
                                    border: deg === 0 ? '2px solid #666' : '2px solid #444',
                                    borderRadius: '8px',
                                    padding: '12px',
                                    cursor: rotating ? 'not-allowed' : 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                    opacity: rotating && deg !== 0 ? 0.5 : 1,
                                    width: '220px',
                                }}
                            >
                                <div style={{
                                    width: '180px', height: '180px',
                                    overflow: 'hidden',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <img
                                        src={rotatingPhoto.url}
                                        alt={`${deg}°`}
                                        style={{
                                            maxWidth: deg % 180 === 0 ? '100%' : '100%',
                                            maxHeight: deg % 180 === 0 ? '100%' : '100%',
                                            objectFit: 'contain',
                                            transform: `rotate(${deg}deg)`,
                                            ...(deg % 180 !== 0 ? {width: '180px', height: '180px'} : {}),
                                        }}
                                    />
                                </div>
                                <span style={{color: '#ccc', fontSize: '13px'}}>
                                    {deg === 0 ? 'Current' : `${deg}°`}
                                </span>
                            </button>
                        ))}
                    </div>
                    {rotating && <span style={{color: '#aaa', fontSize: '14px'}}>Rotating…</span>}
                </div>
            )}

            {photos.length === 0 && deletedPhotos.length === 0 && (
                <p className="text-secondary">No photos yet.</p>
            )}
            {photos.length > 0 && (
                <>
                    <div className="d-flex gap-2 mb-2">
                        <button
                            className={`btn btn-sm ${sortField === 'price' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => toggleSort('price')}
                        >
                            Price {sortField === 'price' ? dirArrow : ''}
                        </button>
                        <button
                            className={`btn btn-sm ${sortField === 'name' ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => toggleSort('name')}
                        >
                            Name {sortField === 'name' ? dirArrow : ''}
                        </button>
                    </div>
                    <div className="row g-2">
                        {sortedPhotos(photos).map((photo) => renderCard(photo, false))}
                    </div>
                </>
            )}
            {deletedPhotos.length > 0 && (
                <>
                    <p className="text-secondary mt-4 mb-2">Deleted</p>
                    <div className="row g-2">
                        {deletedPhotos.map((photo) => renderCard(photo, true))}
                    </div>
                </>
            )}
        </>
    )
}
