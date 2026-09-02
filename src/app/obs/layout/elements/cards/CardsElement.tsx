'use client'

// The `cards` registry component (obs-layout-plan.md §2.8). Ported from
// channel/[id]/photos/page.tsx — the old route is untouched (byte-identical, copy not move).
//
// Differences from the old route:
//   - Photos and cards-board settings (orientation / show_horizontal_row / show_only_available_teams)
//     come from the data spine (useLayoutData()) instead of this page's own usePhotoBoard (120s
//     poll) and widget_cards_board_get (5s poll) — the spine is the only backend poller in the
//     layout system (obs-layout-plan.md §1.3). The "available teams" break_events lookup (15s in
//     the old route) also comes from the spine, which polls break_events every 5s.
//   - The `photos-changed` cue (fired by CardsSettings.tsx after a mark-sold) is handled inside
//     the spine itself (useLayoutData.tsx), not here — this component just reads whatever `photos`
//     currently holds.
//   - Geometry is derived from `box` instead of the old page's module-level VIEWPORT_W/H=1080/1920:
//     the card area stays 85% of box.w by 60% of box.h — the exact fractions the old fixed-viewport
//     page hardcoded as 918/1152 px — so this looks identical at a 1080x1920 box and rescales
//     proportionally at any other size. The row-packing math (packing.ts) takes that width/height
//     budget as plain arguments instead of closing over the old module constants.
//   - Hover-zoom (hoveredId/elevatedId, the mouseenter/mouseleave handlers, the translate/scale
//     transform) is KEPT, but re-based: the original sized it against the fixed 1080x1920 viewport,
//     whereas here it centres on this element's own box and converts rect offsets back through the
//     stage scale. A browser source has no mouse, but this page is also opened in a real browser to
//     check a board, which is exactly when it is wanted.
//   - CSS is prefixed `crd-` (`board-`/`gallery-` are too generic for the shared layout page).

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { NoCustomer, Photo } from '@/app/entity/entities'
import type { ElementProps } from '../../registry'
import { useLayoutData } from '../../useLayoutData'
import { centerByPrice, packList, PackedRow } from './packing'
import './CardsElement.css'

const FALLBACK_ASPECT = 3 / 4
const GALLERY_INTERVAL_MS = 5000

// Fractions of the box reproducing the old fixed-viewport page's hardcoded px values (board-card-area:
// 85% width, 60% height of the viewport; gallery base card width ~27.8% of viewport width; gallery
// gap ~2.2% of viewport width) — see file header. Expressed as decimals rather than a ratio of two
// viewport-sized literals so no 1080/1920 constant survives in the sizing path.
const CARD_AREA_W_FRACTION = 0.85
const CARD_AREA_H_FRACTION = 0.6
const GALLERY_BASE_W_FRACTION = 0.277778
const GALLERY_GAP_FRACTION = 0.022222

/** Nearest equivalent rotation in (-180, 180], so a hovered card unwinds the short way round. */
function shortestRotation(deg: number): number {
    return (((deg % 360) + 540) % 360) - 180
}

function normalizeTeam(team: string): string {
    return team.trim().toLowerCase()
}

export function CardsElement({ box }: ElementProps) {
    const { photos, cardsBoardSettings, events: breakEvents, stream } = useLayoutData()

    const [displayPhotos, setDisplayPhotos] = useState<Photo[]>([])
    const prevIdsRef = useRef<string>('')

    const [cardDims, setCardDims] = useState<Record<number, { w: number; h: number }>>({})

    // Hover-to-inspect, ported back from channel/[id]/photos. It was dropped in the §2.8 port on
    // the grounds that a browser source has no mouse — true in OBS, but the layout page is also
    // opened in a normal browser to check a board, and that is exactly when you want it.
    //
    // The maths differs from the original in two ways that matter:
    //   - It centres the card in THIS ELEMENT'S box, not the 1080x1920 viewport. ElementFrame
    //     clips a boxed element, so a card centred on the canvas would just be cut off.
    //   - `getBoundingClientRect()` returns VIEWPORT px, but the stage is scaled and the transform
    //     is applied inside that scaled canvas. Everything is divided back through the stage scale
    //     (measured as rootRect.width / box.w) so the offsets are in canvas units.
    const rootRef = useRef<HTMLDivElement>(null)
    const [hoveredId, setHoveredId] = useState<number | null>(null)
    const [elevatedId, setElevatedId] = useState<number | null>(null)
    const hoverData = useRef({ scale: 1, dx: 0, dy: 0 })
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const elevationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
            if (elevationTimerRef.current) clearTimeout(elevationTimerRef.current)
        }
    }, [])

    function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>, photo: Photo, alreadyRotated: boolean) {
        const root = rootRef.current
        if (!root) return
        const rootRect = root.getBoundingClientRect()
        const rect = e.currentTarget.getBoundingClientRect()
        // Viewport px per canvas px. Guarded: a zero-width root (never laid out) would divide by 0.
        const stageScale = rootRect.width > 0 ? rootRect.width / box.w : 1

        const cardW = rect.width / stageScale
        const cardH = rect.height / stageScale
        const rotation = photo.rotation ?? 0
        const swapAxes = !alreadyRotated && rotation % 180 !== 0
        const scale = swapAxes
            ? Math.min((box.w * 0.8) / cardH, (box.h * 0.8) / cardW)
            : Math.min((box.w * 0.8) / cardW, (box.h * 0.8) / cardH)

        const dx = (rootRect.left + rootRect.width / 2 - (rect.left + rect.width / 2)) / stageScale
        const dy = (rootRect.top + rootRect.height / 2 - (rect.top + rect.height / 2)) / stageScale
        hoverData.current = { scale, dx, dy }

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
        // Held briefly after the zoom releases so the full-res image is not swapped back to the
        // thumbnail mid-transition.
        elevationTimerRef.current = setTimeout(() => {
            setElevatedId(null)
            elevationTimerRef.current = null
        }, 220)
    }
    const [galleryIndex, setGalleryIndex] = useState(0)

    const orientation = cardsBoardSettings?.orientation ?? 'list'
    const showHorizontalRow = cardsBoardSettings?.show_horizontal_row ?? false
    const showOnlyAvailableTeams = cardsBoardSettings?.show_only_available_teams ?? false

    // Available (untaken) teams of the active break — same rule as obs/prices and the old route.
    // null = no filtering (option off, or no active break to derive availability from).
    const availableTeams = useMemo<Set<string> | null>(() => {
        if (!showOnlyAvailableTeams || !stream?.active_break_id) return null
        const teams = breakEvents
            .filter((e) => !e.is_giveaway && (e.customer === '' || e.customer === NoCustomer))
            .map((e) => normalizeTeam(e.team))
        return new Set(teams)
    }, [showOnlyAvailableTeams, stream?.active_break_id, breakEvents])

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

    const cardAreaW = box.w * CARD_AREA_W_FRACTION
    const cardAreaH = box.h * CARD_AREA_H_FRACTION
    const galleryBaseW = box.w * GALLERY_BASE_W_FRACTION
    const galleryGap = box.w * GALLERY_GAP_FRACTION

    function packRows(): PackedRow[] {
        if (!showHorizontalRow) return packList(sortedPhotos, cardAreaH, cardAreaW, getAspect)

        // Pin the 3 most expensive landscape cards as a full-width first row; everything else
        // packs below it as usual.
        const horizontal = sortedPhotos.filter((p) => getDisplayAspect(p) >= 1).slice(0, 3)
        if (horizontal.length === 0) return packList(sortedPhotos, cardAreaH, cardAreaW, getAspect)

        const h = Math.min(
            cardAreaW / horizontal.reduce((s, p) => s + getDisplayAspect(p), 0),
            cardAreaH * 0.5,
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
        return [firstRow, ...packList(rest, cardAreaH - h, cardAreaW, getAspect)]
    }

    function recordDims(photo: Photo, e: React.SyntheticEvent<HTMLImageElement>) {
        const img = e.currentTarget
        setCardDims((prev) => ({
            ...prev,
            [photo.id]: { w: img.naturalWidth, h: img.naturalHeight },
        }))
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
            <div className="crd-root">
                <div className="crd-gallery-area" style={{ gap: `${galleryGap}px` }}>
                    {visible.map((photo, pos) => {
                        const scale = pos === centerPos ? 2 : 0.65
                        const rotation = photo.rotation ?? 0
                        const aspect = getAspect(photo)
                        const effectiveAspect = rotation % 180 === 0 ? aspect : 1 / aspect
                        const width = galleryBaseW * scale
                        const height = width / effectiveAspect
                        const imgWidth = rotation % 180 === 0 ? width : height
                        const imgHeight = rotation % 180 === 0 ? height : width
                        return (
                            <div
                                key={photo.id}
                                className={`crd-gallery-card ${pos === centerPos ? 'crd-gallery-card--center' : 'crd-gallery-card--side'}`}
                                style={{
                                    width: `${width}px`, height: `${height}px`,
                                    ...(rotation !== 0 ? { position: 'relative' } : {}),
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
                                    onLoad={(e) => recordDims(photo, e)}
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
        <div className="crd-root" ref={rootRef}>
            <div className="crd-card-area">
                {rows.map((row, ri) => (
                    <div key={ri} className="crd-row">
                        {row.photos.map((photo, ci) => {
                            const rotation = photo.rotation ?? 0
                            const rotateInBox = !!row.rotated && rotation !== 0
                            const swap = rotateInBox && rotation % 180 !== 0
                            const hovered = hoveredId === photo.id
                            const isElevated = hovered || elevatedId === photo.id
                            return (
                                <div
                                    key={photo.id}
                                    className="crd-card"
                                    style={{
                                        width: `${row.widths[ci]}px`,
                                        height: `${row.cardHeights[ci]}px`,
                                        ...(isElevated ? { zIndex: 10 } : {}),
                                    }}
                                    onMouseEnter={(e) => handleMouseEnter(e, photo, !!row.rotated)}
                                    onMouseLeave={handleMouseLeave}
                                >
                                    <div
                                        className="crd-card-visual"
                                        style={hovered ? {
                                            transform: `translate(${hoverData.current.dx}px, ${hoverData.current.dy}px) scale(${hoverData.current.scale})${row.rotated ? '' : ` rotate(${shortestRotation(rotation)}deg)`}`,
                                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                        } : undefined}
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
                                            onLoad={(e) => recordDims(photo, e)}
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

export default CardsElement
