'use client'

import React, {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {getEndpoints, post, get} from "@/app/lib/backend";
import {Photo, Series} from "@/app/entity/entities";
import {PhotoGridComponent} from "@/app/series/[id]/photoGridComponent";

function parsePrice(val: string): [string, string] {
    const range = val.match(/^\$(\d+)-\$(\d+)$/)
    if (range) return [range[1], range[2]]
    const single = val.match(/^\$(\d+)$/)
    if (single) return [single[1], '']
    return ['', '']
}

function buildPrice(from: string, to: string): string {
    if (from && to) return `$${from}-$${to}`
    if (from) return `$${from}`
    return ''
}

export default function Page({params}: {params: {id: string}}) {
    const seriesId = parseInt(params.id)
    const router = useRouter()

    const [series, setSeries] = useState<Series | null>(null)
    const [photos, setPhotos] = useState<Photo[]>([])
    const [deletedPhotos, setDeletedPhotos] = useState<Photo[]>([])
    const [photosLoading, setPhotosLoading] = useState(true)
    const [editingName, setEditingName] = useState(false)
    const [nameInput, setNameInput] = useState('')
    const [editingTotalCards, setEditingTotalCards] = useState(false)
    const [totalCardsInput, setTotalCardsInput] = useState('')
    const [editingDefaultPrice, setEditingDefaultPrice] = useState(false)
    const [priceFrom, setPriceFrom] = useState('')
    const [priceTo, setPriceTo] = useState('')

    useEffect(() => {
        post(getEndpoints().series_get, {id: seriesId}).then((data: Series) => {
            setSeries(data)
            setNameInput(data.name)
            setTotalCardsInput(String(data.total_cards))
            const [f, t] = parsePrice(data.default_price ?? '')
            setPriceFrom(f)
            setPriceTo(t)
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
        post(getEndpoints().series_update, {
            id: seriesId,
            name: nameInput,
            used_cards: series?.used_cards ?? 0,
            total_cards: series?.total_cards ?? 0,
            default_price: series?.default_price ?? '',
        }).then(() => {
            setSeries((s) => s ? {...s, name: nameInput} : s)
            setEditingName(false)
        })
    }

    function saveTotalCards() {
        const parsed = parseInt(totalCardsInput)
        if (isNaN(parsed) || parsed === series?.total_cards) {
            setEditingTotalCards(false)
            return
        }
        post(getEndpoints().series_update, {
            id: seriesId,
            name: series?.name ?? '',
            used_cards: series?.used_cards ?? 0,
            total_cards: parsed,
            default_price: series?.default_price ?? '',
        }).then(() => {
            setSeries((s) => s ? {...s, total_cards: parsed} : s)
            setEditingTotalCards(false)
        })
    }

    function saveDefaultPrice() {
        if (priceTo && !priceFrom) return
        const built = buildPrice(priceFrom, priceTo)
        if (built === series?.default_price) {
            setEditingDefaultPrice(false)
            return
        }
        post(getEndpoints().series_update, {
            id: seriesId,
            name: series?.name ?? '',
            used_cards: series?.used_cards ?? 0,
            total_cards: series?.total_cards ?? 0,
            default_price: built,
        }).then(() => {
            setSeries((s) => s ? {...s, default_price: built} : s)
            setEditingDefaultPrice(false)
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

            <div className="d-flex align-items-center gap-2 mb-3">
                <span className="text-secondary">Total cards:</span>
                {editingTotalCards ? (
                    <>
                        <input
                            type="number"
                            className="form-control"
                            style={{maxWidth: '120px'}}
                            value={totalCardsInput}
                            onChange={(e) => setTotalCardsInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveTotalCards()}
                            autoFocus
                        />
                        <button className="btn btn-sm btn-success" onClick={saveTotalCards}>Save</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingTotalCards(false)}>Cancel</button>
                    </>
                ) : (
                    <>
                        <span className="fw-bold">{series.total_cards}</span>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingTotalCards(true)}>Edit</button>
                    </>
                )}
            </div>

            <div className="d-flex align-items-center gap-2 mb-3">
                <span className="text-secondary">Side Cards Price:</span>
                {editingDefaultPrice ? (
                    <>
                        <input
                            type="number"
                            className="form-control"
                            style={{maxWidth: '90px'}}
                            placeholder="From"
                            value={priceFrom}
                            onChange={(e) => setPriceFrom(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveDefaultPrice()}
                            autoFocus
                        />
                        <span>-</span>
                        <input
                            type="number"
                            className="form-control"
                            style={{maxWidth: '90px'}}
                            placeholder="To"
                            value={priceTo}
                            onChange={(e) => setPriceTo(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveDefaultPrice()}
                        />
                        <button className="btn btn-sm btn-success" onClick={saveDefaultPrice}>Save</button>
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditingDefaultPrice(false)}>Cancel</button>
                    </>
                ) : (
                    <>
                        <span className="fw-bold">{series.default_price || '—'}</span>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setEditingDefaultPrice(true)}>Edit</button>
                    </>
                )}
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
                onUrlChange={(id, url) => setPhotos((old) => old.map((p) => p.id === id ? {...p, url} : p))}
            />
        </main>
    )
}
