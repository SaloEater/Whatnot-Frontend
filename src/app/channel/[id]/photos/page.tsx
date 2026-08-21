'use client'

import React, {useEffect, useRef, useState} from 'react'
import {Event, NoCustomer, Photo} from '@/app/entity/entities'
import {getEndpoints, post} from '@/app/lib/backend'
import {useChannel} from '@/app/hooks/useChannel'
import {useActiveStream} from '@/app/hooks/useActiveStream'
import {usePhotoBoard} from './usePhotoBoard'
import './boardComponent.css'

const VIEWPORT_W = 1080
const VIEWPORT_H = 1920
const CARD_AREA_H = VIEWPORT_H * 0.6
const CARD_AREA_W = VIEWPORT_W * 0.85
const FALLBACK_ASPECT = 3 / 4
const GALLERY_BASE_W = 300
const GALLERY_INTERVAL_MS = 5000

/**
 * Normalize a rotation to the SHORTEST arc, (-180, 180]: a 270° photo turns
 * -90° during the hover zoom instead of sweeping three quarters of a circle.
 */
function shortestRotation(deg: number): number {
    return (((deg % 360) + 540) % 360) - 180
}

function normalizeTeam(team: string): string {
    return team.trim().toLowerCase()
}

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
    const [channel] = useChannel(channelId)
    const stream = useActiveStream(channel)

    const [displayPhotos, setDisplayPhotos] = useState<Photo[]>([])
    const prevIdsRef = useRef<string>('')

    const [cardDims, setCardDims] = useState<Record<number, {w: number; h: number}>>({})

    const [orientation, setOrientation] = useState<string>('list')
    const [showHorizontalRow, setShowHorizontalRow] = useState(false)
    const [showOnlyAvailableTeams, setShowOnlyAvailableTeams] = useState(false)
    // null = no filtering (option off, or no active break to derive availability from)
    const [availableTeams, setAvailableTeams] = useState<Set<string> | null>(null)
    const [galleryIndex, setGalleryIndex] = useState(0)

    const [hoveredId, setHoveredId] = useState<number | null>(null)
    const [elevatedId, setElevatedId] = useState<number | null>(null)
    const hoverData = useRef<{scale: number; dx: number; dy: number}>({scale: 1, dx: 0, dy: 0})
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const elevationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const unsold = photos.filter((p) =>
            !p.is_sold && !p.is_deleted &&
            (availableTeams === null || !p.team?.trim() || availableTeams.has(normalizeTeam(p.team)))
        )
        const ids = unsold
            .slice()
            .sort((a, b) => a.id - b.id)
            .map((p) => `${p.id}:${p.rotation ?? 0}`)
            .join(',')
        if (ids !== prevIdsRef.current) {
            prevIdsRef.current = ids
            setDisplayPhotos([...unsold].sort((a, b) => b.price - a.price))
        }
    }, [photos, availableTeams])

    useEffect(() => {
        function fetchOrientation() {
            post(getEndpoints().widget_cards_board_get, {channel_id: channelId})
                .then((d: {orientation: string, show_horizontal_row: boolean, show_only_available_teams: boolean}) => {
                    if (d?.orientation) setOrientation(d.orientation)
                    setShowHorizontalRow(d?.show_horizontal_row ?? false)
                    setShowOnlyAvailableTeams(d?.show_only_available_teams ?? false)
                })
        }
        fetchOrientation()
        const id = setInterval(fetchOrientation, 5000)
        return () => clearInterval(id)
    }, [channelId])

    // Available (untaken) teams of the active break — same rule as obs/prices.
    useEffect(() => {
        const breakId = stream?.active_break_id
        if (!showOnlyAvailableTeams || !breakId) {
            setAvailableTeams(null)
            return
        }
        function fetchAvailableTeams() {
            post(getEndpoints().break_events, {break_id: breakId})
                .then((resp: {events: Event[]}) => {
                    const teams = (resp?.events ?? [])
                        .filter((e) => !e.is_giveaway && (e.customer === '' || e.customer === NoCustomer))
                        .map((e) => normalizeTeam(e.team))
                    setAvailableTeams(new Set(teams))
                })
        }
        fetchAvailableTeams()
        const id = setInterval(fetchAvailableTeams, 15000)
        return () => clearInterval(id)
    }, [stream?.active_break_id, showOnlyAvailableTeams])

    useEffect(() => {
        if (orientation !== 'gallery' || displayPhotos.length <= 1) return
        const id = setInterval(() => setGalleryIndex((i) => i - 1), GALLERY_INTERVAL_MS)
        return () => clearInterval(id)
    }, [orientation, displayPhotos.length])

    function getAspect(photo: Photo): number {
        const d = cardDims[photo.id]
        return d ? d.w / d.h : FALLBACK_ASPECT
    }

    // Aspect as displayed on the board: a 90°/270° rotation swaps width and height.
    function getDisplayAspect(photo: Photo): number {
        const aspect = getAspect(photo)
        return (photo.rotation ?? 0) % 180 === 0 ? aspect : 1 / aspect
    }

    // Sort by price descending only — mixed orientation per row.
    const sortedPhotos = [...displayPhotos]

    type PackedRow = {photos: Photo[]; rowHeight: number; widths: number[]; cardHeights: number[]; rotated?: boolean}

    function packRowsWithHeight(list: Photo[], rowH: number): PackedRow[] {
        const result: PackedRow[] = []
        let i = 0

        while (i < list.length) {
            let totalW = 0
            let j = i

            while (j < list.length) {
                totalW += rowH * getAspect(list[j])
                j++
                if (totalW >= CARD_AREA_W) break
            }

            const isLastIncomplete = j >= list.length && totalW < CARD_AREA_W
            const scaleFactor = isLastIncomplete ? 1 : CARD_AREA_W / totalW
            const h = rowH * scaleFactor
            const centered = centerByPrice(list.slice(i, j))
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

    function packList(list: Photo[], budget: number): PackedRow[] {
        if (list.length === 0) return []

        let lo = 10, hi = budget
        for (let iter = 0; iter < 24; iter++) {
            const mid = (lo + hi) / 2
            if (totalHeight(packRowsWithHeight(list, mid)) <= budget) lo = mid
            else hi = mid
        }
        const greedy = packRowsWithHeight(list, lo)

        // Reassign the greedy row sizes so card counts ascend top→bottom:
        // the expensive top rows hold the fewest cards, and every row spans
        // the full width, so fewer cards means visibly taller cards.
        const counts = greedy.map((r) => r.photos.length).sort((a, b) => a - b)

        // Smooth extreme splits (e.g. a leftover row of 2 next to rows of 5):
        // move cards up from the row below until no adjacent pair differs by
        // more than 1. Keeps counts ascending, so 2/5/5/5 becomes 3/4/5/5.
        let changed = true
        while (changed) {
            changed = false
            for (let i = 0; i < counts.length - 1; i++) {
                if (counts[i + 1] - counts[i] >= 2) {
                    counts[i] += 1
                    counts[i + 1] -= 1
                    changed = true
                }
            }
        }

        const rows: PackedRow[] = []
        let idx = 0
        for (const count of counts) {
            const slice = list.slice(idx, idx + count)
            idx += count
            const h = Math.min(
                CARD_AREA_W / slice.reduce((s, p) => s + getAspect(p), 0),
                budget * 0.5,
            )
            const centered = centerByPrice(slice)
            rows.push({
                photos: centered,
                rowHeight: h,
                widths: centered.map((p) => h * getAspect(p)),
                cardHeights: centered.map(() => h),
            })
        }

        const scale = Math.min(1, budget / totalHeight(rows))
        if (scale === 1) return rows
        return rows.map((r) => ({
            ...r,
            rowHeight: r.rowHeight * scale,
            widths: r.widths.map((w) => w * scale),
            cardHeights: r.cardHeights.map((h) => h * scale),
        }))
    }

    function packRows(): PackedRow[] {
        if (!showHorizontalRow) return packList(sortedPhotos, CARD_AREA_H)

        // Pin the 3 most expensive landscape cards as a full-width first row;
        // everything else packs below it as usual.
        const horizontal = sortedPhotos.filter((p) => getDisplayAspect(p) >= 1).slice(0, 3)
        if (horizontal.length === 0) return packList(sortedPhotos, CARD_AREA_H)

        const h = Math.min(
            CARD_AREA_W / horizontal.reduce((s, p) => s + getDisplayAspect(p), 0),
            CARD_AREA_H * 0.5,
        )
        const centered = centerByPrice(horizontal)
        const firstRow: PackedRow = {
            photos: centered,
            rowHeight: h,
            widths: centered.map((p) => h * getDisplayAspect(p)),
            cardHeights: centered.map(() => h),
            rotated: true,
        }

        const pinned = new Set(horizontal.map((p) => p.id))
        const rest = sortedPhotos.filter((p) => !pinned.has(p.id))
        return [firstRow, ...packList(rest, CARD_AREA_H - h)]
    }

    function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>, photo: Photo, alreadyRotated: boolean) {
        const rect = e.currentTarget.getBoundingClientRect()
        const rotation = photo.rotation ?? 0
        const scale = !alreadyRotated && rotation % 180 !== 0
            ? Math.min(
                VIEWPORT_W * 0.8 / rect.height,
                VIEWPORT_H * 0.8 / rect.width,
            )
            : Math.min(
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
            : n === 1
                ? displayPhotos
                : n === 2
                    ? [0, 1].map((o) => displayPhotos[(((galleryIndex + o) % 2) + 2) % 2])
                    : [0, 1, 2].map((o) => displayPhotos[(((galleryIndex + o) % n) + n) % n])
        const centerPos = Math.floor(visible.length / 2)

        return (
            <div className="board-root">
                <div className="gallery-area">
                    {visible.map((photo, pos) => {
                        const scale = pos === centerPos ? 2 : 0.65
                        const rotation = photo.rotation ?? 0
                        const aspect = getAspect(photo)
                        const effectiveAspect = rotation % 180 === 0 ? aspect : 1 / aspect
                        const width = GALLERY_BASE_W * scale
                        const height = width / effectiveAspect
                        const imgWidth = rotation % 180 === 0 ? width : height
                        const imgHeight = rotation % 180 === 0 ? height : width
                        return (
                            <div
                                key={photo.id}
                                className={`gallery-card ${pos === centerPos ? 'gallery-card--center' : 'gallery-card--side'}`}
                                style={{
                                    width: `${width}px`, height: `${height}px`,
                                    ...(rotation !== 0 ? {position: 'relative'} : {}),
                                }}
                            >
                                <img
                                    src={pos === centerPos ? photo.url : (photo.thumbnail || photo.url)}
                                    alt={photo.name || 'card'}
                                    style={rotation !== 0 ? {
                                        position: 'absolute',
                                        top: '50%',
                                        left: '50%',
                                        width: `${imgWidth}px`,
                                        height: `${imgHeight}px`,
                                        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                                    } : undefined}
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
                            const isElevated = hovered || elevatedId === photo.id
                            const rotation = photo.rotation ?? 0
                            const rotateInBox = !!row.rotated && rotation !== 0
                            const swap = rotateInBox && rotation % 180 !== 0
                            return (
                                <div
                                    key={photo.id}
                                    className="board-card"
                                    style={{
                                        width: `${row.widths[ci]}px`,
                                        height: `${row.cardHeights[ci]}px`,
                                        ...(hovered || elevatedId === photo.id ? {zIndex: 10} : {})
                                    }}
                                    onMouseEnter={(e) => handleMouseEnter(e, photo, !!row.rotated)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div
                                        className="board-card-visual"
                                        style={hovered ? {
                                            transform: `translate(${hoverData.current.dx}px, ${hoverData.current.dy}px) scale(${hoverData.current.scale})${row.rotated ? '' : ` rotate(${shortestRotation(rotation)}deg)`}`,
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                        } : {}}
                                    >
                                        <img
                                            src={isElevated ? photo.url : (photo.thumbnail || photo.url)}
                                            alt={photo.name || 'card'}
                                            style={rotateInBox ? {
                                                position: 'absolute',
                                                top: '50%',
                                                left: '50%',
                                                width: `${swap ? row.cardHeights[ci] : row.widths[ci]}px`,
                                                height: `${swap ? row.widths[ci] : row.cardHeights[ci]}px`,
                                                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                                            } : undefined}
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
