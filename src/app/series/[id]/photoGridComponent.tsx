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
}

export const PhotoGridComponent: FC<PhotoGridComponentProps> = ({photos, deletedPhotos = [], isLoading, onDelete, onRestore, onTeamChange, onPriceChange}) => {
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())

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
                        <button
                            className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 p-0 lh-1"
                            style={{width: '22px', height: '22px', fontSize: '12px'}}
                            onClick={() => deletePhoto(photo.id)}
                        >×</button>
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

    return (
        <>
            {photos.length === 0 && deletedPhotos.length === 0 && (
                <p className="text-secondary">No photos yet.</p>
            )}
            {photos.length > 0 && (
                <div className="row g-2">
                    {photos.map((photo) => renderCard(photo, false))}
                </div>
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
