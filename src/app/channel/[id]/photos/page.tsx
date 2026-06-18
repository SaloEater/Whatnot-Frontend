'use client'

import React, {useEffect, useRef, useState} from 'react'
import {Photo} from '@/app/entity/entities'
import {usePhotoBoard} from './usePhotoBoard'
import './boardComponent.css'

const VIEWPORT_W = 1080
const VIEWPORT_H = 1920
const CARD_AREA_H = VIEWPORT_H / 2
const FALLBACK_ASPECT = 3 / 4

function shuffle<T>(arr: T[]): T[] {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
    }
    return a
}

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const {photos} = usePhotoBoard(channelId)

    const [displayPhotos, setDisplayPhotos] = useState<Photo[]>([])
    const prevIdsRef = useRef<string>('')

    const [cardDims, setCardDims] = useState<Record<number, {w: number; h: number}>>({})

    const [hoveredId, setHoveredId] = useState<number | null>(null)
    const [elevatedId, setElevatedId] = useState<number | null>(null)
    const hoverData = useRef<{scale: number; origin: string}>({scale: 1, origin: 'center'})
    const exitZoomRef = useRef<string>('')
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const elevationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const unsold = photos.filter((p) => !p.is_sold && !p.is_deleted)
        const ids = unsold.map((p) => p.id).sort((a, b) => a - b).join(',')
        if (ids !== prevIdsRef.current) {
            prevIdsRef.current = ids
            setDisplayPhotos(shuffle(unsold))
        }
    }, [photos])

    function getAspect(photo: Photo): number {
        const d = cardDims[photo.id]
        return d ? d.w / d.h : FALLBACK_ASPECT
    }

    function isLandscape(photo: Photo): boolean {
        const d = cardDims[photo.id]
        return d ? d.w > d.h : false
    }

    // Portrait cards first (shuffled within group), landscape cards after (shuffled within group)
    const sortedPhotos = [...displayPhotos].sort(
        (a, b) => Number(isLandscape(b)) - Number(isLandscape(a))
    )

    function packRowsWithHeight(portraitH: number): Array<{photos: Photo[]; rowHeight: number; widths: number[]}> {
        const portraitCards = sortedPhotos.filter((p) => !isLandscape(p) && cardDims[p.id])
        const landscapeH = portraitCards.length > 0
            ? portraitCards.reduce((sum, p) => sum + portraitH * getAspect(p), 0) / portraitCards.length
            : portraitH * FALLBACK_ASPECT

        const result: Array<{photos: Photo[]; rowHeight: number; widths: number[]}> = []
        let i = 0

        while (i < sortedPhotos.length) {
            const firstLandscape = isLandscape(sortedPhotos[i])
            const targetH = firstLandscape ? landscapeH : portraitH

            let totalW = 0
            let j = i

            // Fill-threshold: add cards until the row reaches VIEWPORT_W, then stop.
            // This ensures the last row doesn't stretch out of proportion.
            while (j < sortedPhotos.length) {
                if (j > i && isLandscape(sortedPhotos[j]) !== firstLandscape) break
                totalW += targetH * getAspect(sortedPhotos[j])
                j++
                if (totalW >= VIEWPORT_W) break
            }

            // Don't stretch the last incomplete row — keep cards at natural targetH size.
            const isLastIncomplete = j >= sortedPhotos.length && totalW < VIEWPORT_W
            const scaleFactor = isLastIncomplete ? 1 : VIEWPORT_W / totalW
            const rowHeight = targetH * scaleFactor
            const widths = sortedPhotos.slice(i, j).map((p) => targetH * getAspect(p) * scaleFactor)

            result.push({photos: sortedPhotos.slice(i, j), rowHeight, widths})
            i = j
        }

        return result
    }

    function totalHeight(rows: Array<{rowHeight: number}>): number {
        return rows.reduce((s, r) => s + r.rowHeight, 0)
    }

    function packRows(): Array<{photos: Photo[]; rowHeight: number; widths: number[]}> {
        if (sortedPhotos.length === 0) return []

        // Binary search for the largest portraitH whose rows still fit in CARD_AREA_H.
        // With the fill-threshold inner loop, totalHeight is monotonically increasing in portraitH,
        // so binary search is valid across the full range up to CARD_AREA_H.
        let lo = 10, hi = CARD_AREA_H
        for (let iter = 0; iter < 24; iter++) {
            const mid = (lo + hi) / 2
            if (totalHeight(packRowsWithHeight(mid)) <= CARD_AREA_H) lo = mid
            else hi = mid
        }
        return packRowsWithHeight(lo)
    }

    function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>, photo: Photo) {
        const rect = e.currentTarget.getBoundingClientRect()

        const mh = VIEWPORT_W * 0.05
        const mv = VIEWPORT_H * 0.05

        // Space between each card edge and the nearest 5% margin.
        // Clamped to 0 when the card is already inside the margin.
        const spaceLeft   = Math.max(0, rect.left - mh)
        const spaceRight  = Math.max(0, VIEWPORT_W - mh - rect.right)
        const spaceTop    = Math.max(0, rect.top - mv)
        const spaceBottom = Math.max(0, VIEWPORT_H - mv - rect.bottom)

        const totalH = spaceLeft + spaceRight
        const totalV = spaceTop + spaceBottom

        // Max scale: expand until all available space on both sides is consumed.
        const scaleH = totalH > 0 ? (rect.width + totalH) / rect.width : 1
        const scaleV = totalV > 0 ? (rect.height + totalV) / rect.height : 1
        const scale = Math.max(1, Math.min(scaleH, scaleV))

        // Origin distributes growth proportionally to available space on each side.
        // ox = 0 → grow entirely right; ox = width → grow entirely left; ox = width/2 → grow equally.
        const ox = totalH > 0 ? rect.width * spaceLeft / totalH : rect.width / 2
        const oy = totalV > 0 ? rect.height * spaceTop / totalV : rect.height / 2

        hoverData.current = {scale, origin: `${ox}px ${oy}px`}

        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null
            setElevatedId(photo.id)
            setHoveredId(photo.id)
        }, 500)
    }

    function handleMouseLeave() {
        exitZoomRef.current = hoverData.current.origin
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        setHoveredId(null)
        // Keep z-index elevated until the shrink transition finishes (200ms).
        if (elevationTimerRef.current) clearTimeout(elevationTimerRef.current)
        elevationTimerRef.current = setTimeout(() => {
            setElevatedId(null)
            exitZoomRef.current = ''
            elevationTimerRef.current = null
        }, 220)
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
                                        height: `${row.rowHeight}px`,
                                        ...(hovered
                                            ? {
                                                transform: `scale(${hoverData.current.scale})`,
                                                transformOrigin: hoverData.current.origin,
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                            }
                                            : elevatedId === photo.id
                                                ? {transformOrigin: exitZoomRef.current}
                                                : {}),
                                        ...(hovered || elevatedId === photo.id
                                            ? {zIndex: 10}
                                            : {})
                                    }}
                                    onMouseEnter={(e) => handleMouseEnter(e, photo)}
                                    onMouseLeave={handleMouseLeave}
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
                ))}
            </div>
        </div>
    )
}
