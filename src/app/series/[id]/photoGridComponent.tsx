'use client'

import React, {FC, useState} from "react";
import {Photo} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";
import {Teams} from "@/app/common/teams";

interface PhotoGridComponentProps {
    photos: Photo[]
    isLoading?: boolean
    onDelete: (id: number) => void
    onTeamChange: (id: number, team: string) => void
}

export const PhotoGridComponent: FC<PhotoGridComponentProps> = ({photos, isLoading, onDelete, onTeamChange}) => {
    const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set())

    function markLoaded(id: number) {
        setLoadedImages((prev) => new Set(prev).add(id))
    }

    function deletePhoto(id: number) {
        post(getEndpoints().photo_delete, {id}).then(() => onDelete(id))
    }

    function setTeam(photo: Photo, team: string) {
        post(getEndpoints().photo_update, {id: photo.id, name: photo.name, team}).then(() => onTeamChange(photo.id, team))
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

    if (photos.length === 0) {
        return <p className="text-secondary">No photos yet.</p>
    }

    return (
        <div className="row g-2">
            {photos.map((photo) => {
                const imgLoaded = loadedImages.has(photo.id)
                return (
                    <div key={photo.id} className="col-6 col-sm-4 col-md-3">
                        <div className="position-relative">
                            <div
                                className="rounded"
                                style={{width: '100%', aspectRatio: '3/4', backgroundColor: '#444', overflow: 'hidden'}}
                            >
                                <img
                                    src={photo.url}
                                    alt={photo.name || 'card'}
                                    style={{width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: imgLoaded ? 'block' : 'none'}}
                                    onLoad={() => markLoaded(photo.id)}
                                />
                            </div>
                            <button
                                className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 p-0 lh-1"
                                style={{width: '22px', height: '22px', fontSize: '12px'}}
                                onClick={() => deletePhoto(photo.id)}
                            >×</button>
                        </div>
                        <select
                            className="form-select form-select-sm mt-1"
                            value={photo.team || ''}
                            onChange={(e) => setTeam(photo, e.target.value)}
                        >
                            <option value="">— no team —</option>
                            {Teams.map((t) => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                )
            })}
        </div>
    )
}
