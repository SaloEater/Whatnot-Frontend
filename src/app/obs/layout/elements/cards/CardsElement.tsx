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
//     in list mode the card area IS the element box (top-aligned, no fraction of it held back), and
//     in carousel mode the cards size to fit both axes of the box, centred horizontally, with the
//     side cards overhanging the box edges (drawn outside it, registry `unclipped`). The row-packing math (packing.ts) takes that
//     width/height budget as plain arguments instead of closing over the old module constants.
//   - Hover-zoom (hoveredId/elevatedId, the mouseenter/mouseleave handlers, the translate/scale
//     transform) is KEPT, but re-based: the original sized it against the fixed 1080x1920 viewport,
//     whereas here it centres on this element's own box and converts rect offsets back through the
//     stage scale. A browser source has no mouse, but this page is also opened in a real browser to
//     check a board, which is exactly when it is wanted.
//   - CSS is prefixed `crd-` (`board-`/`gallery-` are too generic for the shared layout page).

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NoCustomer, Photo } from '@/app/entity/entities'
import type { ElementProps } from '../../registry'
import { CANVAS } from '../../schema'
import { useLayoutData } from '../../useLayoutData'
import { useCueBus } from '../../cueBus'
import { centerByPrice, packList, PackedRow } from './packing'
import { normalizeTeam, usePendingSoldCards } from './usePendingSoldCards'
import { usePendingBroadcast } from './usePendingBroadcast'
import './CardsElement.css'

const FALLBACK_ASPECT = 3 / 4
const GALLERY_INTERVAL_MS = 5000

// Main area / card-count threshold (cards-main-area-plan.md §1): the operator sometimes covers the
// bottom of the box with semi-transparent elements drawn over it, so a crowded board should use the
// full box while a sparse one packs into the uncovered top share instead. Exported so the settings
// panel (CardsSettings.tsx) shows the same numbers a freshly-added/unset element actually renders
// at, same convention as CameraShelfElement.tsx's DEFAULT_* constants.
export const DEFAULT_MAIN_AREA_HEIGHT_PCT = 100
export const DEFAULT_MAIN_AREA_MAX_CARDS = 0

// Copied from ImageBoxElement.tsx / CameraShelfElement.tsx (ADDING_AN_ELEMENT.md's copy rule —
// never imported/refactored out). Read after mount: `window` does not exist during SSR, and the
// first client render must match the server's (empty) markup byte for byte.
function readDevMode(): boolean {
    try {
        return new URLSearchParams(window.location.search).get('dev') === '1'
    } catch {
        return false
    }
}

// Pending-sold-cards (pending-sold-cards-plan.md §2.2): a card whose team just sold, still shown
// (marked) until the operator acknowledges it by hovering it in the controls grid — which zooms it
// here, the same zoom-out that ends the highlight — or this timeout elapses.
const PENDING_TIMEOUT_MS = 30_000
// How often `usePendingBroadcast` re-sends the pending set to the controls page while it's
// non-empty, so a dock opened late catches up and a dead layout's tint expires there.
const PENDING_HEARTBEAT_MS = 3_000

// Auto-zoom driver (cards-auto-show-pending-plan.md §3): how long each pending card is held
// zoomed on stream before the queue moves to the next one, and the pause between two consecutive
// auto zooms so they read as separate zooms rather than one bleeding into the next.
const AUTO_SHOW_MS = 10_000
const AUTO_START_GAP_MS = 300

// useLayoutEffect only warns during SSR — same fallback as Stage.tsx.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect


// How long a remote highlight survives without being renewed. The controls page re-sends the cue
// it is holding every second (CardsSettings' HIGHLIGHT_HEARTBEAT_MS), so this is the backstop for
// every way a "highlight off" can fail to arrive: the operator alt-tabs with the pointer still on a
// card and no mouseleave ever fires, the controls page is closed or crashes, the clear is simply
// lost on the bus. Comfortably more than two heartbeats so a single missed renewal is not a flicker.
const HIGHLIGHT_TTL_MS = 1000

/** Nearest equivalent rotation in (-180, 180], so a hovered card unwinds the short way round. */
function shortestRotation(deg: number): number {
    return (((deg % 360) + 540) % 360) - 180
}

/** A card's resting position/size in CANVAS units (box.x/box.y + w/h) — what a `ZoomPortal` wrapper is positioned at. */
type CanvasRect = { left: number; top: number; width: number; height: number }

/** Finds which packed row/index a photo id is currently in, or null if it isn't on the board any more. */
function findCardGeom(rows: PackedRow[], id: number | null): { photo: Photo; row: PackedRow; ci: number } | null {
    if (id === null) return null
    for (const row of rows) {
        const ci = row.photos.findIndex((p) => p.id === id)
        if (ci !== -1) return { photo: row.photos[ci], row, ci }
    }
    return null
}

/**
 * The zoomed card's visual, teleported (via `createPortal`) into `.lay-canvas` so it draws above
 * EVERY other layout element, not just sibling cards — see the header comment on `.crd-zoom-portal`
 * in CardsElement.css for why ElementFrame's own zIndex can't do this.
 *
 * Mounts with no transform and applies the zoom transform one frame later (double rAF) so the
 * zoom-in still transitions instead of snapping straight to its final state — a portal that mounted
 * already-transformed would have nothing to transition FROM. Keyed by photo id from the caller, so
 * a genuinely new elevation remounts (fresh `applied` state) while the zoom-out window (elevatedId
 * held for 220ms after hoveredId clears) keeps reusing the same instance and animates back via the
 * `hovered` prop going false.
 */
function ZoomPortal({
    canvasEl,
    rect,
    photo,
    rotated,
    hovered,
    transform,
}: {
    canvasEl: HTMLElement
    rect: CanvasRect
    photo: Photo
    rotated: boolean // row.rotated — whether this row already rotates its cards into place
    hovered: boolean // apply the zoom transform (vs. animate back to rest)
    transform: string
}) {
    const [applied, setApplied] = useState(false)

    useEffect(() => {
        let raf2 = 0
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => setApplied(true))
        })
        return () => {
            cancelAnimationFrame(raf1)
            cancelAnimationFrame(raf2)
        }
    }, [])

    const rotation = photo.rotation ?? 0
    const rotateInBox = rotated && rotation !== 0
    const swap = rotateInBox && rotation % 180 !== 0

    return createPortal(
        <div
            className="crd-zoom-portal"
            style={{ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }}
        >
            <div
                className="crd-card-visual"
                style={
                    hovered && applied
                        ? { transform, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }
                        : undefined
                }
            >
                <img
                    src={photo.url}
                    alt={photo.name || 'card'}
                    style={rotateInBox ? {
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: `${swap ? rect.height : rect.width}px`,
                        height: `${swap ? rect.width : rect.height}px`,
                        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                    } : undefined}
                />
            </div>
        </div>,
        canvasEl
    )
}

export function CardsElement({ box, element }: ElementProps) {
    const { photos, cardsBoardSettings, events: breakEvents, stream, channel } = useLayoutData()

    // `?dev=1` only (cards-main-area-plan.md §3): drives the main-area boundary outline further
    // down. Read after mount, same `readDevMode` copy pattern as `CameraShelfElement`/
    // `ImageBoxElement` — never shown in OBS.
    const [devMode, setDevMode] = useState(false)
    useEffect(() => {
        setDevMode(readDevMode())
    }, [])

    // Needed before the pending-sold-cards hook just below (which takes `autoShow`), so hoisted
    // ahead of the rest of the board-settings locals (orientation's "real" declaration further
    // down was removed in favour of this one). Narrowed the same defensive way `zoomFor`'s
    // `mainAreaHeightPct` read is below: `element.kind` isn't guaranteed 'cards' until the
    // early-return guard further down, and this is needed well before it.
    const orientation = cardsBoardSettings?.orientation ?? 'list'
    const autoShowPending = (element.kind === 'cards' ? element.autoShowPending : undefined) ?? false
    // cards-auto-show-pending-plan.md decision 2: carousel mode ignores auto-show entirely, and so
    // the 30s pending timeout stays live there too — otherwise a carousel with the box ticked would
    // hold pending cards forever, since it has no zoom to acknowledge them with.
    const autoShow = autoShowPending && orientation === 'list'

    // Pending-sold-cards (pending-sold-cards-plan.md): a team just becoming taken doesn't drop its
    // card off the board immediately — it goes pending (still shown, via the filter below) until
    // the operator acknowledges it (see the 220ms elevation timers below), the auto-zoom driver
    // acknowledges it (cards-auto-show-pending-plan.md §3), or PENDING_TIMEOUT_MS elapses (skipped
    // entirely while `autoShow` is on, see usePendingSoldCards.ts §2). Declared early (ahead of the
    // hover-zoom handlers, which call `acknowledge`) so those handlers don't reference it before
    // its declaration. `usePendingBroadcast` tells the controls page which ids are pending (and
    // which one, if any, is currently auto-shown) so it can tint/outline them — unconditional, not
    // gated on devMode (it's the return path documented in obs-browser-event-bus.md §8).
    const { pendingIds, pendingOrder, acknowledge } = usePendingSoldCards({
        enabled: (cardsBoardSettings?.show_only_available_teams ?? false) && !!stream?.active_break_id,
        activeBreakId: stream?.active_break_id ?? null,
        events: breakEvents,
        photos,
        timeoutMs: PENDING_TIMEOUT_MS,
        autoShow,
    })

    // Auto-zoom driver's own bookkeeping (cards-auto-show-pending-plan.md §3): `autoIdRef` is the
    // pending card it currently has zoomed (or null), `autoTimerRef` is that card's AUTO_SHOW_MS
    // timer. Both refs — nothing here needs to re-render on their own, the zoom itself rides the
    // same hoveredId/elevatedId/hoverSourceRef state every other source uses (see further below).
    // `autoShowingId` is the one piece of real state, kept only so `usePendingBroadcast` (which
    // needs a value to watch/post on) can tell the controls page which card is on stream (§4).
    const autoIdRef = useRef<number | null>(null)
    const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const [autoShowingId, setAutoShowingId] = useState<number | null>(null)
    const setAutoId = useCallback((id: number | null) => {
        autoIdRef.current = id
        setAutoShowingId(id)
    }, [])

    usePendingBroadcast({
        channelId: channel?.id ?? 0,
        pendingIds,
        heartbeatMs: PENDING_HEARTBEAT_MS,
        autoShowingId,
    })

    const [displayPhotos, setDisplayPhotos] = useState<Photo[]>([])
    const prevIdsRef = useRef<string>('')

    const [cardDims, setCardDims] = useState<Record<number, { w: number; h: number }>>({})

    // Hover-to-inspect, ported back from channel/[id]/photos. It was dropped in the §2.8 port on
    // the grounds that a browser source has no mouse — true in OBS, but the layout page is also
    // opened in a normal browser to check a board, and that is exactly when you want it.
    //
    // The maths differs from the original in two ways that matter:
    //   - It centres the card in THIS ELEMENT'S box, not the 1080x1920 viewport. List mode clips
    //     to the box (`.crd-root`), so a card centred on the canvas would just be cut off.
    //   - `getBoundingClientRect()` returns VIEWPORT px, but the stage is scaled and the transform
    //     is applied inside that scaled canvas. Everything is divided back through the stage scale
    //     (measured as rootRect.width / box.w) so the offsets are in canvas units.
    const rootRef = useRef<HTMLDivElement>(null)
    const [hoveredId, setHoveredId] = useState<number | null>(null)
    const [elevatedId, setElevatedId] = useState<number | null>(null)
    // Mirrors `elevatedId` synchronously (a ref update isn't batched behind a re-render like the
    // state is), so the 220ms elevation timers below can read "which id was elevated" at the
    // moment they're scheduled without adding `elevatedId` to their effect's dependency array —
    // that array is otherwise about geometry inputs (box/photos/dims), and adding state this same
    // effect also sets would re-run it an extra time on its own update.
    const elevatedIdRef = useRef<number | null>(null)
    const hoverData = useRef({ scale: 1, dx: 0, dy: 0 })
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const elevationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Zoomed-card-in-front-of-everything (see `.crd-zoom-portal` in CardsElement.css): ElementFrame
    // wraps every element (this one included) in a `.lay-element-frame` with its own zIndex AND
    // `overflow: hidden`, which both clips and creates a stacking context — a plain zIndex on the
    // hovered card only ever beats OTHER cards, never a sibling ELEMENT with a higher z. The fix is
    // to portal a copy of the zoomed card's visual straight into `.lay-canvas` (Stage.tsx), which
    // sits above every ElementFrame. If there is no canvas (e.g. this component is ever rendered
    // outside a <Stage>), the portal is simply never used and the original in-place zoom
    // (clipped/ordered like any other element) is unchanged.
    //
    // Re-checked after every render, not just on mount: both the list and carousel roots carry
    // `rootRef`, but the root node is replaced when the orientation switches, and a mount-only
    // lookup that happened to run with no root attached would leave the portal off for good.
    // Cheap — `closest` on one node, and an unchanged value bails out of the state update.
    const [canvasEl, setCanvasEl] = useState<HTMLElement | null>(null)
    // No deps on purpose (see above); the functional update returns `prev` when unchanged, so it
    // settles after one extra render at most instead of looping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        const found = (rootRef.current?.closest('.lay-canvas') as HTMLElement | null) ?? null
        setCanvasEl((prev) => (prev === found ? prev : found))
    })

    // The portal wrapper's resting position/size, in CANVAS units (box.x/box.y-relative, same space
    // ElementFrame positions boxes in) — recomputed whenever the zoomed card or the board's layout
    // changes, same triggers the remote-highlight effect below already re-derives its zoom from.
    // (State/effect declared further down, once `cardNodes` exists — see the comment there.)
    // Tagged with the photo id it was measured for, so a switch straight from card A to card B
    // never renders B's portal at A's position for a frame.
    const [portalRect, setPortalRect] = useState<{ id: number; rect: CanvasRect } | null>(null)

    /** A card element's on-screen rect converted to CANVAS units — see `zoomFor` below for the same stageScale derivation. */
    function canvasRectFor(cardEl: HTMLElement): CanvasRect | null {
        const root = rootRef.current
        if (!root) return null
        const rootRect = root.getBoundingClientRect()
        const rect = cardEl.getBoundingClientRect()
        const stageScale = rootRect.width > 0 ? rootRect.width / box.w : 1
        return {
            left: box.x + (rect.left - rootRect.left) / stageScale,
            top: box.y + (rect.top - rootRect.top) / stageScale,
            width: rect.width / stageScale,
            height: rect.height / stageScale,
        }
    }

    // Which side is driving the current zoom. The operator hovering the controls page's card grid
    // raises the same zoom remotely (see the `highlight-photo` effect below), and without this tag
    // a stray mouseleave on the layout page would cancel a highlight the operator is still holding
    // — and vice versa.
    // cards-auto-show-pending-plan.md §3 adds a third source, `'auto'`, driven by the effects
    // further below — it goes through this exact same zoom path (zoomFor/hoveredId/elevatedId),
    // so the main-area bottom limit, top-layer portal, other-card dimming, full-res image and
    // acknowledge-on-zoom-out all come with it unchanged.
    const hoverSourceRef = useRef<'local' | 'remote' | 'auto' | null>(null)

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
            if (elevationTimerRef.current) clearTimeout(elevationTimerRef.current)
            if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
        }
    }, [])

    /**
     * Shared zoom-out sequence (cards-auto-show-pending-plan.md §3's refactor) for all three
     * drivers — local mouse leave, remote cue clearing, and the auto driver ending its turn —
     * replacing what used to be duplicated in `handleMouseLeave` and the remote-highlight effect.
     * Clears `hoveredId` immediately (so the dim and the zoomed card's own transform start
     * un-animating right away), then — after `elevationTimerRef`'s 220ms hold, so the full-res
     * image isn't swapped back to the thumbnail mid-transition — clears `elevatedId` and, if
     * `acknowledgeIt`, acknowledges whichever id was elevated (pending-sold-cards-plan.md §2.2's
     * "acknowledge on zoom-out"; a no-op for a non-pending id). Callers own their own guard on
     * `hoverSourceRef.current` before calling this, and any auto-specific bookkeeping (autoIdRef/
     * autoTimerRef) around it — this only ever clears the source to null.
     */
    const endZoom = useCallback((acknowledgeIt: boolean) => {
        hoverSourceRef.current = null
        setHoveredId(null)
        if (elevationTimerRef.current) clearTimeout(elevationTimerRef.current)
        const zoomedId = elevatedIdRef.current
        elevationTimerRef.current = setTimeout(() => {
            setElevatedId(null)
            elevatedIdRef.current = null
            elevationTimerRef.current = null
            if (acknowledgeIt && zoomedId !== null) acknowledge(zoomedId)
        }, 220)
    }, [acknowledge])

    // Remote highlight (obs-layout-plan.md §2.8): the operator hovers a card in the controls
    // page's grid, and the same card grows here — the point being that the layout page usually IS
    // a browser source, where there is no mouse to hover with.
    //
    // The 500ms dwell lives on the CONTROLS side, so by the time a cue arrives the operator has
    // already committed to that card; reacting instantly here is the whole point. `cardNodes` maps
    // photo id -> the rendered card, because a cue has no mouse event to read a rect from.
    const cueBus = useCueBus()
    const cardNodes = useRef(new Map<number, { el: HTMLDivElement; rotated: boolean }>())
    const [remoteId, setRemoteId] = useState<number | null>(null)

    // Portal-wrapper geometry (see the `canvasEl`/`portalRect` declarations above): needs
    // `cardNodes`, so it lives here rather than alongside `canvasEl`. Re-derives whenever the
    // zoomed card or the board's layout changes — the same trigger set the remote-highlight effect
    // below uses to re-derive its zoom, plus box.x/box.y (position, not just scale, now matters).
    // Layout effect, not a plain effect: the in-place card goes transparent in the same render that
    // elevates it, so the portal's rect must land before paint or the card blinks out for a frame.
    useIsomorphicLayoutEffect(() => {
        if (elevatedId === null || !canvasEl) {
            setPortalRect(null)
            return
        }
        const node = cardNodes.current.get(elevatedId)
        if (!node) {
            setPortalRect(null)
            return
        }
        const rect = canvasRectFor(node.el)
        setPortalRect(rect ? { id: elevatedId, rect } : null)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- canvasRectFor closes over rootRef/box; cardNodes is a ref
    }, [elevatedId, displayPhotos, cardDims, box.x, box.y, box.w, box.h, canvasEl])

    // The TTL is refreshed here rather than in the effect below because a renewal carries the SAME
    // photo id: `setRemoteId` bails out on an unchanged value, so the effect would never re-run and
    // a held highlight would expire mid-hover.
    const remoteExpiryRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
        const unsubscribe = cueBus.subscribe((cue) => {
            if (cue.kind !== 'highlight-photo') return
            if (remoteExpiryRef.current) {
                clearTimeout(remoteExpiryRef.current)
                remoteExpiryRef.current = null
            }
            setRemoteId(cue.photoId)
            if (cue.photoId !== null) {
                remoteExpiryRef.current = setTimeout(() => {
                    remoteExpiryRef.current = null
                    setRemoteId(null)
                }, HIGHLIGHT_TTL_MS)
            }
        })
        return () => {
            unsubscribe()
            if (remoteExpiryRef.current) clearTimeout(remoteExpiryRef.current)
        }
    }, [cueBus])

    // Re-runs when the board relayouts (new photos, new measured aspect ratios, a resized box) so a
    // held highlight keeps pointing at where its card actually is now.
    useEffect(() => {
        if (remoteId === null) {
            if (hoverSourceRef.current === 'remote') endZoom(true)
            return
        }
        // cards-auto-show-pending-plan.md §3: a highlight-photo cue while the auto driver is
        // showing a card means the operator has their pointer on the controls grid right now.
        // Same id as the auto card → they're holding IT: cancel its 10s timer and hand off to the
        // ordinary remote-highlight path below (it's already zoomed at this id, nothing else to
        // do here). A DIFFERENT id → "operator hovers a different card": the auto zoom is dropped
        // WITHOUT acknowledging (it stays pending), and the code below zooms the new id instead —
        // same as how a remote cue for a different id already overrides a remote zoom in place.
        const dropAuto = () => {
            if (autoTimerRef.current) {
                clearTimeout(autoTimerRef.current)
                autoTimerRef.current = null
            }
            setAutoId(null)
        }
        if (hoverSourceRef.current === 'auto' && remoteId === autoIdRef.current) {
            dropAuto()
            hoverSourceRef.current = 'remote'
            return
        }
        const node = cardNodes.current.get(remoteId)
        const photo = displayPhotos.find((p) => p.id === remoteId)
        // A card that is sold, filtered out by "only available teams", or simply not on this board
        // has nothing to zoom — ignore rather than clearing whatever is up. Checked BEFORE dropping
        // an auto zoom: dropping it first would cancel its 10s timer with nothing taking over,
        // leaving that card zoomed on stream indefinitely.
        if (!node || !photo) return
        const zoom = zoomFor(node.el, photo, node.rotated)
        if (!zoom) return
        if (hoverSourceRef.current === 'auto') dropAuto()
        hoverData.current = zoom
        hoverSourceRef.current = 'remote'
        if (elevationTimerRef.current) {
            clearTimeout(elevationTimerRef.current)
            elevationTimerRef.current = null
        }
        setElevatedId(remoteId)
        elevatedIdRef.current = remoteId
        setHoveredId(remoteId)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomFor closes over refs and box (acknowledge/endZoom/setAutoId are stable)
    }, [remoteId, displayPhotos, cardDims, box.w, box.h, acknowledge, endZoom, setAutoId, element])

    /**
     * Zoom transform for one card, in CANVAS units. Shared by the local mouse hover and the remote
     * highlight cue, which differ only in how they find the card element.
     */
    function zoomFor(cardEl: HTMLElement, photo: Photo, alreadyRotated: boolean): { scale: number; dx: number; dy: number } | null {
        const root = rootRef.current
        if (!root) return null
        const rootRect = root.getBoundingClientRect()
        const rect = cardEl.getBoundingClientRect()
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
        let dy = (rootRect.top + rootRect.height / 2 - (rect.top + rect.height / 2)) / stageScale

        // Same rule as the carousel's centre card: the zoomed card's bottom edge never goes below
        // the main area's bottom (`mainAreaHeightPct`, always applied, independent of the
        // card-count threshold). Centred in the box it lands at box.h/2 ± zoomedH/2; if that
        // bottom crosses the line, lift it by the overshoot. It may then rise above the box top,
        // which is fine: the zoom is drawn on the unclipped top-layer portal.
        const mainAreaPct = (element.kind === 'cards' ? element.mainAreaHeightPct : undefined) ?? DEFAULT_MAIN_AREA_HEIGHT_PCT
        const mainAreaBottom = (box.h * mainAreaPct) / 100
        const zoomedH = (swapAxes ? cardW : cardH) * scale
        const overshoot = box.h / 2 + zoomedH / 2 - mainAreaBottom
        if (overshoot > 0) dy -= overshoot
        return { scale, dx, dy }
    }

    function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>, photo: Photo, alreadyRotated: boolean) {
        const zoom = zoomFor(e.currentTarget, photo, alreadyRotated)
        if (!zoom) return

        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = setTimeout(() => {
            hoverTimerRef.current = null
            // A local hover starting while the auto driver has a (necessarily different) card
            // zoomed wins immediately — drop the auto zoom WITHOUT acknowledging
            // (cards-auto-show-pending-plan.md §3 "operator hovers a different card"), so it stays
            // pending and the queue resumes once this manual zoom has fully closed.
            if (hoverSourceRef.current === 'auto') {
                if (autoTimerRef.current) {
                    clearTimeout(autoTimerRef.current)
                    autoTimerRef.current = null
                }
                setAutoId(null)
            }
            // Read the geometry at fire time, not at enter time: the board may have relaid out
            // during the dwell.
            const fresh = zoomFor(e.currentTarget, photo, alreadyRotated) ?? zoom
            hoverData.current = fresh
            hoverSourceRef.current = 'local'
            setElevatedId(photo.id)
            elevatedIdRef.current = photo.id
            setHoveredId(photo.id)
        }, 500)
    }

    function handleMouseLeave() {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current)
            hoverTimerRef.current = null
        }
        // A highlight the operator is holding from the controls page, or one the auto driver is
        // holding, outlives a mouse leaving a card here — only a genuinely local zoom-out goes
        // through `endZoom`.
        if (hoverSourceRef.current !== 'local') return
        endZoom(true)
    }

    // ---- Auto-zoom driver (cards-auto-show-pending-plan.md §3, list mode only) -------------------
    // Three effects: pick the next pending card and zoom it when nothing else has a claim on the
    // zoom; drop it immediately (no acknowledge) if it vanishes out from under itself; drop it
    // immediately (no acknowledge) if the option is turned off — or the board leaves list mode,
    // which `autoShow` already folds in (decision 2) — while it's mid-turn.

    // "Card vanishes mid-zoom": the auto driver's own card can drop out of `pendingIds` (marked
    // sold, its team un-taken, or an active-break change resetting pending entirely —
    // usePendingSoldCards' rules 4/7/8) with no local/remote interruption to ever catch it.
    useEffect(() => {
        if (hoverSourceRef.current !== 'auto') return
        const id = autoIdRef.current
        if (id === null || pendingIds.has(id)) return
        if (autoTimerRef.current) {
            clearTimeout(autoTimerRef.current)
            autoTimerRef.current = null
        }
        setAutoId(null)
        endZoom(false)
    }, [pendingIds, endZoom, setAutoId])

    // Turning the option off (or leaving list mode) mid-turn must not leave a card stuck zoomed
    // with nothing left to acknowledge it.
    useEffect(() => {
        if (autoShow) return
        if (hoverSourceRef.current !== 'auto') return
        if (autoTimerRef.current) {
            clearTimeout(autoTimerRef.current)
            autoTimerRef.current = null
        }
        setAutoId(null)
        endZoom(false)
    }, [autoShow, endZoom, setAutoId])

    // "Start": zooms the oldest pending id that actually has a rendered card node, the same way a
    // local/remote zoom does, whenever nothing else has a claim on the zoom. Waits
    // AUTO_START_GAP_MS after that becomes true (not on the render where it does) so consecutive
    // auto cards read as separate zooms and a manual zoom's own 220ms zoom-out hold has fully
    // cleared first. A change to any of hoveredId/elevatedId/pendingOrder/autoShow during the wait
    // re-runs this effect, whose cleanup cancels the still-pending gap timer — so there is nothing
    // to re-check inside the timeout for those; `hoverSourceRef.current` IS re-checked there since
    // it's a ref (mutable outside the state/deps this effect watches) and this is the one path the
    // plan explicitly calls out as needing care against a double-start.
    useEffect(() => {
        if (!autoShow) return
        if (hoveredId !== null || elevatedId !== null) return
        if (hoverSourceRef.current !== null) return
        const nextId = pendingOrder.find((id) => cardNodes.current.has(id))
        if (nextId === undefined) return

        const gap = setTimeout(() => {
            if (hoverSourceRef.current !== null) return
            const node = cardNodes.current.get(nextId)
            const photo = displayPhotos.find((p) => p.id === nextId)
            if (!node || !photo) return
            const zoom = zoomFor(node.el, photo, node.rotated)
            if (!zoom) return
            hoverData.current = zoom
            hoverSourceRef.current = 'auto'
            setElevatedId(nextId)
            elevatedIdRef.current = nextId
            setHoveredId(nextId)
            setAutoId(nextId)
            autoTimerRef.current = setTimeout(() => {
                autoTimerRef.current = null
                setAutoId(null)
                endZoom(true)
            }, AUTO_SHOW_MS)
        }, AUTO_START_GAP_MS)

        return () => clearTimeout(gap)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomFor/cardNodes close over refs and box, same convention as the remote-highlight effect above
    }, [autoShow, pendingOrder, hoveredId, elevatedId, displayPhotos, cardDims, box.w, box.h, element, endZoom, setAutoId])

    const [galleryIndex, setGalleryIndex] = useState(0)

    // `orientation` moved up to just after `useLayoutData()` (needed early by `autoShow`, above).
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
            (availableTeams === null || !p.team?.trim() || availableTeams.has(normalizeTeam(p.team)) || pendingIds.has(p.id))
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
    }, [photos, availableTeams, pendingIds])

    useEffect(() => {
        if (orientation !== 'gallery' || displayPhotos.length <= 1) return
        const id = setInterval(() => setGalleryIndex((i) => i - 1), GALLERY_INTERVAL_MS)
        return () => clearInterval(id)
    }, [orientation, displayPhotos.length])

    // Every hook above this point runs unconditionally regardless of `element.kind` — the registry
    // only ever mounts this component for a `cards` element, so this is a defensive narrowing (same
    // convention as `CameraShelfElement`'s guard), not a real early-out.
    if (element.kind !== 'cards') return null

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

    // Main area / card-count threshold (cards-main-area-plan.md §1): carousel mode ignores this
    // entirely (out of scope) — `mainAreaHeightPx`/`useMainArea` are only consulted by the list-mode
    // packing below and its `?dev=1` outline.
    const mainAreaHeightPct = element.mainAreaHeightPct ?? DEFAULT_MAIN_AREA_HEIGHT_PCT
    const mainAreaMaxCards = element.mainAreaMaxCards ?? DEFAULT_MAIN_AREA_MAX_CARDS
    const mainAreaHeightPx = (box.h * mainAreaHeightPct) / 100
    const useMainArea = mainAreaMaxCards > 0 && displayPhotos.length <= mainAreaMaxCards

    const cardAreaW = box.w
    const cardAreaH = useMainArea ? mainAreaHeightPx : box.h

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

        // Base width, sized to the centre card only (scale 2 below): the centre card must fit both
        // axes of the box, so W is bounded both by box.w/2 and by box.h via the smallest displayed
        // aspect across ALL display photos (not just the visible ones) — any card can rotate into
        // the centre on the next tick, and sizing off only the currently-visible aspects would make
        // W jump every 5s. Side cards (scale 0.65) straddle the box edges — see the positioning
        // below; their outer half is drawn outside the box (`.crd-root--gallery`, registry
        // `unclipped`).
        const minAspect = displayPhotos.length > 0
            ? Math.min(...displayPhotos.map(getDisplayAspect))
            : FALLBACK_ASPECT
        const galleryW = Math.min(box.w / 2, (box.h * minAspect) / 2)

        const geoms = visible.map((photo, pos) => {
            const scale = pos === centerPos ? 2 : 0.65
            const rotation = photo.rotation ?? 0
            const aspect = getAspect(photo)
            const effectiveAspect = rotation % 180 === 0 ? aspect : 1 / aspect
            const width = galleryW * scale
            const height = width / effectiveAspect
            const imgWidth = rotation % 180 === 0 ? width : height
            const imgHeight = rotation % 180 === 0 ? height : width
            return { photo, pos, rotation, width, height, imgWidth, imgHeight }
        })

        // The centre card is always horizontally centred in the box. Each side card is centred on
        // the box edge, so exactly half its width is inside the area; the centre card draws above
        // it if they meet. With 2 visible cards the lone side card is at pos 0, which is
        // < centerPos, so it lands on the left edge.
        //
        // Vertically, every card is centred on the CANVAS midline (y = CANVAS.h / 2), not on the
        // box, so the carousel sits at the stream's vertical middle wherever the box is placed;
        // converted to box-local px by subtracting box.y. If the box doesn't straddle the midline
        // symmetrically, a card can cross the box edge — every carousel card draws outside the
        // box (the frame copy via `.crd-root--gallery`, the centre card via `.crd-top-layer`).
        const centerGeom = geoms[centerPos]
        const centerLeft = centerGeom ? (box.w - centerGeom.width) / 2 : 0
        const midlineY = CANVAS.h / 2 - box.y
        // The centre card's bottom edge never goes below the main area's bottom (the element's
        // `mainAreaHeightPct` — the uncovered top share of the box). A card that would cross it is
        // lifted until its bottom sits on that line; one that already clears it stays on the
        // midline. Always applied in carousel mode, independent of list mode's card-count
        // threshold (`mainAreaMaxCards`); at the 100% default the line is the box bottom.
        const topFor = (isCenter: boolean, height: number) =>
            isCenter
                ? Math.min(midlineY - height / 2, mainAreaHeightPx - height)
                : midlineY - height / 2

        // The centre card is drawn in front of EVERY layout element, the same way the list-mode zoom
        // is (see `canvasEl` above): ElementFrame gives this element one z-index for all of its
        // cards, so an element on a higher Layer overlapping the box would cover the centre card.
        // The carousel is rendered twice with identical geometry — once in the frame, once in a
        // box-sized, unclipped layer portalled into `.lay-canvas` at max z-index — and each
        // copy only shows its own share: side cards in the frame, the centre card on top. Both
        // copies keep every card mounted under the same key, so the centre/side swap still runs
        // the left/width/height/filter transitions in lockstep; the handoff between layers is an
        // instant opacity flip between two pixel-identical cards, which is invisible.
        const topLayer = !!canvasEl
        const renderGalleryCards = (layer: 'frame' | 'top') =>
            geoms.map(({ photo, pos, rotation, width, height, imgWidth, imgHeight }) => {
                const isCenter = pos === centerPos
                const left = isCenter
                    ? centerLeft
                    : pos < centerPos
                        ? -width / 2
                        : box.w - width / 2
                const hidden = topLayer && (layer === 'top' ? !isCenter : isCenter)
                return (
                    <div
                        key={photo.id}
                        className={`crd-gallery-card ${isCenter ? 'crd-gallery-card--center' : 'crd-gallery-card--side'}`}
                        style={{
                            left: `${left}px`, top: `${topFor(isCenter, height)}px`,
                            width: `${width}px`, height: `${height}px`,
                            ...(hidden ? { opacity: 0 } : {}),
                        }}
                    >
                        <img
                            src={isCenter ? photo.url : (photo.thumbnail || photo.url)}
                            alt={photo.name || 'card'}
                            style={rotation !== 0 ? {
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                width: `${imgWidth}px`,
                                height: `${imgHeight}px`,
                                transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                            } : undefined}
                            // One copy is enough to measure the aspect ratio.
                            onLoad={layer === 'frame' ? (e) => recordDims(photo, e) : undefined}
                        />
                    </div>
                )
            })

        return (
            <>
                <div className="crd-root crd-root--gallery" ref={rootRef}>
                    <div className="crd-gallery-area">{renderGalleryCards('frame')}</div>
                </div>
                {topLayer && canvasEl && createPortal(
                    <div
                        className="crd-top-layer"
                        style={{ left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` }}
                    >
                        <div className="crd-gallery-area">{renderGalleryCards('top')}</div>
                    </div>,
                    canvasEl,
                )}
            </>
        )
    }

    const rows = packRows()

    // Portal wiring (see the `canvasEl`/`ZoomPortal` comments above): `usePortal` gates BOTH the
    // portal render below AND the in-place hide, so a missing `.lay-canvas` (canvasEl null) falls
    // back cleanly to the original in-place-only zoom instead of hiding a card with nothing drawing
    // its replacement. `elevatedGeom` looks up which row/photo is currently elevated — it can come
    // back null for a beat (e.g. the card just sold off the board while still zoomed), in which case
    // there's nothing to portal and the in-place card (already not elevated, since it's not in
    // `rows`) is left alone.
    const usePortal = !!canvasEl
    const elevatedGeom = findCardGeom(rows, elevatedId)
    // Only hide the in-place card once its portal copy is actually drawn.
    const portalShown = usePortal && elevatedGeom !== null && portalRect?.id === elevatedGeom.photo.id
    const elevatedHovered = elevatedGeom !== null && hoveredId === elevatedGeom.photo.id
    const elevatedTransform = elevatedGeom
        ? `translate(${hoverData.current.dx}px, ${hoverData.current.dy}px) scale(${hoverData.current.scale})${elevatedGeom.row.rotated ? '' : ` rotate(${shortestRotation(elevatedGeom.photo.rotation ?? 0)}deg)`}`
        : ''

    return (
        <>
            <div className="crd-root" ref={rootRef}>
                {/* `?dev=1` only (cards-main-area-plan.md §3): the main-area boundary, always shown
                    at its own height regardless of whether it is actually being packed into right
                    now — the tag says which. Never rendered in OBS (devMode is read client-side,
                    after mount, and defaults to false). */}
                {devMode && mainAreaMaxCards > 0 && (
                    <div className="crd-dev-main-area" style={{ height: `${mainAreaHeightPx}px` }}>
                        <span className="crd-dev-main-area-tag">
                            {useMainArea ? 'main area' : 'full box'} · {displayPhotos.length}{' '}
                            {useMainArea ? '≤' : '>'} {mainAreaMaxCards}
                        </span>
                    </div>
                )}
                {/* While a card is zoomed, every OTHER card is dimmed (CardsElement.css
                    `.crd-card-area--dimmed`). Keyed off `hoveredId`, not `elevatedId`, so the dim
                    lifts together with the 200ms zoom-out instead of lingering through the
                    220ms elevation hold. */}
                <div className={`crd-card-area${hoveredId !== null ? ' crd-card-area--dimmed' : ''}`}>
                    {rows.map((row, ri) => (
                        <div key={ri} className="crd-row">
                            {row.photos.map((photo, ci) => {
                                const rotation = photo.rotation ?? 0
                                const rotateInBox = !!row.rotated && rotation !== 0
                                const swap = rotateInBox && rotation % 180 !== 0
                                const hovered = hoveredId === photo.id
                                const isElevated = hovered || elevatedId === photo.id
                                // Portaled: this card's zoom is drawn by <ZoomPortal> instead, in front of
                                // every element — hide the in-place visual (opacity, NOT visibility/display,
                                // so the `.crd-card` div underneath keeps getting mouseenter/mouseleave).
                                // Pending cards carry no mark on the layout — that tint lives only on the
                                // controls page, off stream.
                                const portaled = isElevated && portalShown
                                return (
                                    <div
                                        key={photo.id}
                                        className={`crd-card${hovered ? ' crd-card--zoomed' : ''}`}
                                        style={{
                                            width: `${row.widths[ci]}px`,
                                            height: `${row.cardHeights[ci]}px`,
                                            ...(isElevated ? { zIndex: 10 } : {}),
                                        }}
                                        ref={(el) => {
                                            if (el) cardNodes.current.set(photo.id, {el, rotated: !!row.rotated})
                                            else cardNodes.current.delete(photo.id)
                                        }}
                                        onMouseEnter={(e) => handleMouseEnter(e, photo, !!row.rotated)}
                                        onMouseLeave={handleMouseLeave}
                                    >
                                        <div
                                            className="crd-card-visual"
                                            style={
                                                portaled
                                                    ? { opacity: 0 }
                                                    : hovered ? {
                                                        transform: `translate(${hoverData.current.dx}px, ${hoverData.current.dy}px) scale(${hoverData.current.scale})${row.rotated ? '' : ` rotate(${shortestRotation(rotation)}deg)`}`,
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                                                    } : undefined
                                            }
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
            {portalShown && canvasEl && elevatedGeom && portalRect && (
                <ZoomPortal
                    key={elevatedGeom.photo.id}
                    canvasEl={canvasEl}
                    rect={portalRect.rect}
                    photo={elevatedGeom.photo}
                    rotated={!!elevatedGeom.row.rotated}
                    hovered={elevatedHovered}
                    transform={elevatedTransform}
                />
            )}
        </>
    )
}

export default CardsElement
