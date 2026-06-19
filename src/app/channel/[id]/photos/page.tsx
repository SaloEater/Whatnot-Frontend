'use client'

import React, {useEffect, useRef, useState} from 'react'
import {Photo} from '@/app/entity/entities'
import {usePhotoBoard} from './usePhotoBoard'
import './boardComponent.css'

const VIEWPORT_W = 1080
const VIEWPORT_H = 1920
const CARD_AREA_H = VIEWPORT_H / 2
const FALLBACK_ASPECT = 3 / 4

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

    function getAspect(photo: Photo): number {
        const d = cardDims[photo.id]
        return d ? d.w / d.h : FALLBACK_ASPECT
    }

    function isLandscape(photo: Photo): boolean {
        const d = cardDims[photo.id]
        return d ? d.w > d.h : false
    }

    // Group by orientation (landscape first), expensive cards first within each group.
    const sortedPhotos = [...displayPhotos].sort((a, b) => {
        const orientDiff = Number(isLandscape(b)) - Number(isLandscape(a))
        if (orientDiff !== 0) return orientDiff
        return b.price - a.price
    })

    function packRowsWithHeight(portraitH: number): Array<{photos: Photo[]; rowHeight: number; widths: number[]}> {
        const landscapeH = portraitH / 2

        const result: Array<{photos: Photo[]; rowHeight: number; widths: number[]}> = []
        let i = 0

        while (i < sortedPhotos.length) {
            const firstLandscape = isLandscape(sortedPhotos[i])

            let totalW = 0
            let j = i

            if (firstLandscape) {
                // Landscape rows: stop before overflow, render at fixed landscapeH with no stretching.
                while (j < sortedPhotos.length) {
                    if (isLandscape(sortedPhotos[j]) !== firstLandscape) break
                    const nextW = landscapeH * getAspect(sortedPhotos[j])
                    if (j > i && totalW + nextW > VIEWPORT_W) break
                    totalW += nextW
                    j++
                }
                const centered = centerByPrice(sortedPhotos.slice(i, j))
                result.push({
                    photos: centered,
                    rowHeight: landscapeH,
                    widths: centered.map((p) => landscapeH * getAspect(p)),
                })
            } else {
                // Portrait rows: fill-threshold then stretch; last incomplete row stays natural.
                while (j < sortedPhotos.length) {
                    if (isLandscape(sortedPhotos[j]) !== firstLandscape) break
                    totalW += portraitH * getAspect(sortedPhotos[j])
                    j++
                    if (totalW >= VIEWPORT_W) break
                }
                const isLastIncomplete = j >= sortedPhotos.length && totalW < VIEWPORT_W
                const scaleFactor = isLastIncomplete ? 1 : VIEWPORT_W / totalW
                const centered = centerByPrice(sortedPhotos.slice(i, j))
                result.push({
                    photos: centered,
                    rowHeight: portraitH * scaleFactor,
                    widths: centered.map((p) => portraitH * getAspect(p) * scaleFactor),
                })
            }

            i = j
        }

        const rowMaxPrice = (r: {photos: Photo[]}) => Math.max(...r.photos.map((p) => p.price))

        return result
            .filter((r) => r.photos.length > 0)
            .sort((a, b) => rowMaxPrice(b) - rowMaxPrice(a))
    }

    function totalHeight(rows: Array<{rowHeight: number}>): number {
        return rows.reduce((s, r) => s + r.rowHeight, 0)
    }

    function packRows(): Array<{photos: Photo[]; rowHeight: number; widths: number[]}> {
        if (sortedPhotos.length === 0) return []

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
