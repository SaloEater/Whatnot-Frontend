'use client'

import React, {useEffect, useRef, useState} from 'react'
import {Photo} from '@/app/entity/entities'
import {getEndpoints, post} from '@/app/lib/backend'
import {usePhotoBoard} from './usePhotoBoard'
import './boardComponent.css'

const VIEWPORT_W = 1080
const VIEWPORT_H = 1920
const CARD_AREA_H = VIEWPORT_H / 2
const FALLBACK_ASPECT = 3 / 4
const GALLERY_BASE_W = 300
const GALLERY_INTERVAL_MS = 5000

function centerByPrice(cards: Photo[]): Photo[] {
    const sorted = [...cards].sort((a, b) => b.price - a.price)
    const result = new Array<Photo>(sorted.length)
    const center = Math.floor(sorted.length / 2)
    sorted.forEach((card, i) => {
        if (i % 2 === 0) result[center + i / 2] = card
        else              result[center - Math.ceil(i / 2)] = card
    })
    return result
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const {photos} = usePhotoBoard(channelId)

    const [displayPhotos, setDisplayPhotos] = useState<Photo[]>([])
    const prevIdsRef = useRef<string>('')

    const [cardDims, setCardDims] = useState<Record<number, {w: number; h: number}>>({})

    const [orientation, setOrientation] = useState<string>('list')
    const [galleryIndex, setGalleryIndex] = useState(0)

    const [hoveredId, setHoveredId] = useState<number | null>(null)
    const [elevatedId, setElevatedId] = useState<number | null>(null)
    const hoverData = useRef<{scale: number; dx: number; dy: number}>({scale: 1, dx: 0, dy: 0})
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const elevationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const unsold = photos.filter((p) => !p.is_sold && !p.is_deleted)
        const ids = unsold.map((p) => p.id).sort((a, b) => a - b).join(',')
        if (ids !== prevIdsRef.current) {
            prevIdsRef.current = ids
            setDisplayPhotos([...unsold].sort((a, b) => b.price - a.price))
        }
    }, [photos])

    useEffect(() => {
        function fetchOrientation() {
            post(getEndpoints().widget_cards_board_get, {channel_id: channelId})
                .then((d: {orientation: string}) => { if (d?.orientation) setOrientation(d.orientation) })
        }
        fetchOrientation()
        const id = setInterval(fetchOrientation, 5000)
        return () => clearInterval(id)
    }, [channelId])

    useEffect(() => {
        if (orientation !== 'gallery' || displayPhotos.length <= 3) return
        const id = setInterval(() => setGalleryIndex((i) => i - 1), GALLERY_INTERVAL_MS)
        return () => clearInterval(id)
    }, [orientation, displayPhotos.length])

    function getAspect(photo: Photo): number {
        const d = cardDims[photo.id]
        return d ? d.w / d.h : FALLBACK_ASPECT
    }

    // Sort by price descending only — mixed orientation per row.
    const sortedPhotos = [...displayPhotos]

    type PackedRow = {photos: Photo[]; rowHeight: number; widths: number[]; cardHeights: number[]}

    function packRowsWithHeight(rowH: number): PackedRow[] {
        const result: PackedRow[] = []
        let i = 0

        while (i < sortedPhotos.length) {
            let totalW = 0
            let j = i

            while (j < sortedPhotos.length) {
                totalW += rowH * getAspect(sortedPhotos[j])
                j++
                if (totalW >= VIEWPORT_W) break
            }

            const isLastIncomplete = j >= sortedPhotos.length && totalW < VIEWPORT_W
            const scaleFactor = isLastIncomplete ? 1 : VIEWPORT_W / totalW
            const h = rowH * scaleFactor
            const centered = centerByPrice(sortedPhotos.slice(i, j))
            result.push({
                photos: centered,
                rowHeight: h,
                widths: centered.map((p) => rowH * getAspect(p) * scaleFactor),
                cardHeights: centered.map(() => h),
            })

            i = j
        }

        const rowMaxPrice = (r: PackedRow) => Math.max(...r.photos.map((p) => p.price))

        return result
            .filter((r) => r.photos.length > 0)
            .sort((a, b) => rowMaxPrice(b) - rowMaxPrice(a))
    }

    function totalHeight(rows: Array<{rowHeight: number}>): number {
        return rows.reduce((s, r) => s + r.rowHeight, 0)
    }

    // Second pass: grow rows that mix horizontal and vertical cards.
    // Vertical cards (aspect < 1) gain height; horizontal cards (aspect >= 1)
    // shrink in height and width to keep total row width = VIEWPORT_W.
    // Portrait-only rows are not touched.
    function stretchMixedRows(rows: PackedRow[]): PackedRow[] {
        const leftover = CARD_AREA_H - totalHeight(rows)
        if (leftover <= 1) return rows

        const capacities = rows.map((r) => {
            const aspects = r.photos.map(getAspect)
            const sumV = aspects.filter((a) => a < 1).reduce((s, a) => s + a, 0)
            if (sumV === 0 || !aspects.some((a) => a >= 1)) return 0
            return Math.max(0, VIEWPORT_W / sumV - r.rowHeight)
        })

        const totalCap = capacities.reduce((s, c) => s + c, 0)
        if (totalCap <= 0) return rows

        const scale = Math.min(1, leftover / totalCap)

        return rows.map((r, ri) => {
            if (capacities[ri] <= 0) return r
            const newH = r.rowHeight + capacities[ri] * scale
            const aspects = r.photos.map(getAspect)
            const sumV = aspects.filter((a) => a < 1).reduce((s, a) => s + a, 0)
            const sumH = aspects.filter((a) => a >= 1).reduce((s, a) => s + a, 0)
            const k = (VIEWPORT_W - newH * sumV) / sumH
            return {
                ...r,
                rowHeight: newH,
                widths:      aspects.map((a) => (a < 1 ? newH * a : k * a)),
                cardHeights: aspects.map((a) => (a < 1 ? newH : k)),
            }
        })
    }

    function packRows(): PackedRow[] {
        if (sortedPhotos.length === 0) return []

        let lo = 10, hi = CARD_AREA_H
        for (let iter = 0; iter < 24; iter++) {
            const mid = (lo + hi) / 2
            if (totalHeight(packRowsWithHeight(mid)) <= CARD_AREA_H) lo = mid
            else hi = mid
        }
        return stretchMixedRows(packRowsWithHeight(lo))
    }

    function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>, photo: Photo) {
        const rect = e.currentTarget.getBoundingClientRect()
        const scale = Math.min(
            VIEWPORT_W * 0.8 / rect.width,
            VIEWPORT_H * 0.8 / rect.height,
        )
        const dx = VIEWPORT_W / 2 - (rect.left + rect.width / 2)
        const dy = VIEWPORT_H / 2 - (rect.top + rect.height / 2)
        hoverData.current = {scale, dx, dy}

        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null
            setElevatedId(photo.id)
            setHoveredId(photo.id)
        }, 500)
    }

    function handleMouseLeave() {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        setHoveredId(null)
        if (elevationTimerRef.current) clearTimeout(elevationTimerRef.current)
        elevationTimerRef.current = setTimeout(() => {
            setElevatedId(null)
            elevationTimerRef.current = null
        }, 220)
    }

    if (orientation === 'gallery') {
        const n = displayPhotos.length
        const visible = n === 0
            ? []
            : n <= 3
                ? displayPhotos
                : [0, 1, 2].map((o) => displayPhotos[(((galleryIndex + o) % n) + n) % n])
        const centerPos = Math.floor(visible.length / 2)

        return (
            <div className="board-root">
                <div className="gallery-area">
                    {visible.map((photo, pos) => {
                        const scale = pos === centerPos ? 2 : 0.65
                        const width = GALLERY_BASE_W * scale
                        const height = width / getAspect(photo)
                        return (
                            <div
                                key={photo.id}
                                className={`gallery-card ${pos === centerPos ? 'gallery-card--center' : 'gallery-card--side'}`}
                                style={{width: `${width}px`, height: `${height}px`}}
                            >
                                <img
                                    src={photo.url}
                                    alt={photo.name || 'card'}
                                    onLoad={(e) => {
                                        const img = e.currentTarget
                                        setCardDims((prev) => ({
                                            ...prev,
                                            [photo.id]: {w: img.naturalWidth, h: img.naturalHeight},
                                        }))
                                    }}
                                />
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }

    const rows = packRows()

    return (
        <div className="board-root">
            <div className="board-card-area">
                {rows.map((row, ri) => (
                    <div key={ri} className="board-row">
                        {row.photos.map((photo, ci) => {
                            const hovered = hoveredId === photo.id
                            return (
                                <div
                                    key={photo.id}
                                    className="board-card"
                                    style={{
                                        width: `${row.widths[ci]}px`,
                                        height: `${row.cardHeights[ci]}px`,
                                        ...(hovered || elevatedId === photo.id ? {zIndex: 10} : {})
                                    }}
                                    onMouseEnter={(e) => handleMouseEnter(e, photo)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div
                                        className="board-card-visual"
                                        style={hovered ? {
                                            transform: `translate(${hoverData.current.dx}px, ${hoverData.current.dy}px) scale(${hoverData.current.scale})`,
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                        } : {}}
                                    >
                                        <img
                                            src={photo.url}
                                            alt={photo.name || 'card'}
                                            onLoad={(e) => {
                                                const img = e.currentTarget
                                                setCardDims((prev) => ({
                                                    ...prev,
                                                    [photo.id]: {w: img.naturalWidth, h: img.naturalHeight},
                                                }))
                                            }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ))}
            </div>
        </div>
    )
}
