'use client'

import React, {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {getEndpoints, post, get} from "@/app/lib/backend";
import {Photo, Series} from "@/app/entity/entities";
import {PhotoGridComponent} from "@/app/series/[id]/photoGridComponent";

export default function Page({params}: {params: {id: string}}) {
    const seriesId = parseInt(params.id)
    const router = useRouter()

    const [series, setSeries] = useState<Series | null>(null)
    const [photos, setPhotos] = useState<Photo[]>([])
    const [deletedPhotos, setDeletedPhotos] = useState<Photo[]>([])
    const [photosLoading, setPhotosLoading] = useState(true)
    const [editingName, setEditingName] = useState(false)
    const [nameInput, setNameInput] = useState('')

    useEffect(() => {
        post(getEndpoints().series_get, {id: seriesId}).then((data: Series) => {
            setSeries(data)
            setNameInput(data.name)
        })
        post(getEndpoints().photo_list, {series_id: seriesId}).then((data: Photo[]) => {
            const all = data ?? []
            setPhotos(all.filter((p) => !p.is_deleted))
            setDeletedPhotos(all.filter((p) => p.is_deleted))
            setPhotosLoading(false)
        })
    }, [])

    function saveName() {
        if (!nameInput.trim() || nameInput === series?.name) {
            setEditingName(false)
            return
        }
        post(getEndpoints().series_update, {id: seriesId, name: nameInput}).then(() => {
            setSeries((s) => s ? {...s, name: nameInput} : s)
            setEditingName(false)
        })
    }

    function closeSeries() {
        post(getEndpoints().series_close, {id: seriesId}).then(() => {
            setSeries((s) => s ? {...s, status: 'closed'} : s)
        })
    }

    function deleteSeries() {
        post(getEndpoints().series_delete, {id: seriesId}).then(() => {
            router.push('/series')
        })
    }

    function removePhoto(id: number) {
        const photo = photos.find((p) => p.id === id)
        setPhotos((old) => old.filter((p) => p.id !== id))
        if (photo) setDeletedPhotos((old) => [...old, {...photo, is_deleted: true}])
    }

    function restorePhoto(id: number) {
        const photo = deletedPhotos.find((p) => p.id === id)
        setDeletedPhotos((old) => old.filter((p) => p.id !== id))
        if (photo) setPhotos((old) => [...old, {...photo, is_deleted: false}])
    }

    if (!series) return null

    return (
        <main className="container py-3">
            <div className="d-flex align-items-center gap-2 mb-3">
                {editingName ? (
                    <>
                        <input
                            className="form-control"
                            style={{maxWidth: '300px'}}
                            value={nameInput}
                            onChange={(e) => setNameInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveName()}
                            autoFocus
                        />
                        <button className="btn btn-sm btn-success" onClick={saveName}>Save</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingName(false)}>Cancel</button>
                    </>
                ) : (
                    <>
                        <h4 className="mb-0">{series.name}</h4>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingName(true)}>Rename</button>
                    </>
                )}
                <span className={`badge ${series.status === 'open' ? 'bg-warning text-dark' : 'bg-success'}`}>
                    {series.status}
                </span>
            </div>

            <div className="d-flex justify-content-between mb-4">
                <div className="d-flex gap-2">
                    <button className="btn btn-secondary" onClick={() => router.push(`/series/${seriesId}/team-prices`)}>
                        Team Prices →
                    </button>
                    {photos.length === 0 && (
                        <button className="btn btn-danger" onClick={deleteSeries}>Delete Series</button>
                    )}
                </div>
                <div>
                    {series.status === 'open' && (
                        <button className="btn btn-warning" onClick={closeSeries}>Close Series</button>
                    )}
                </div>
            </div>

            <PhotoGridComponent
                photos={photos}
                deletedPhotos={deletedPhotos}
                isLoading={photosLoading}
                onDelete={removePhoto}
                onRestore={restorePhoto}
                onTeamChange={(id, team) => setPhotos((old) => old.map((p) => p.id === id ? {...p, team} : p))}
                onPriceChange={(id, price) => setPhotos((old) => old.map((p) => p.id === id ? {...p, price} : p))}
            />
        </main>
    )
}
