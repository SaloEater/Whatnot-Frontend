'use client'

// Settings for `imageBox` (obs-image-box-plan.md §3.7, pan control added in §5): upload an image,
// pick how it fits its box, and — since `contain`/`cover` both leave slack the operator may want to
// choose — pan which part of the image shows via `position` (a 0..100 percent pair mapped straight
// onto CSS `object-position`, see ImageBoxElement.tsx). Both settings live on the element
// (LayoutConfig) — the upload itself hits its own endpoint (`/api/layout/image/upload`) to get a
// public URL, then that URL is patched onto the element via `onPatchElement` like any other field,
// same as TextSettings.
//
// The "Current image" preview doubles as the pan control (§5.4): it is sized to the element's own
// box aspect ratio (via `resolveBox`) so what the operator sees while dragging matches what OBS
// will show, and dragging it moves the image the same direction the layout page would. Dragging
// keeps its own local state so the preview tracks the pointer smoothly; the element is only patched
// once, on release, so a drag does not spam the undo history with a patch per pointermove.

import {useEffect, useRef, useState} from 'react'
import type {Element, ImageFit, Phase} from '@/app/obs/layout/schema'
import {DEFAULT_IMAGE_POSITION, IMAGE_FITS} from '@/app/obs/layout/schema'
import {resolveBox} from '@/app/obs/layout/config'
import {REGISTRY} from '@/app/obs/layout/registry'
import {getEndpoints, postMultipart} from '@/app/lib/backend'
import {DEFAULT_IMAGE_FIT, OBJECT_FIT} from '@/app/obs/layout/elements/image-box/ImageBoxElement'
import type {PatchElement} from './ElementBlock'

const FIT_LABELS: Record<ImageFit, string> = {
    contain: 'Contain (whole image, letterboxed)',
    cover: 'Cover (fill box, crop overflow)',
    stretch: 'Stretch (ignore aspect ratio)',
}

const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp'

// The preview fits inside this box (px) while preserving the element's own box aspect ratio.
const PREVIEW_MAX = 240

type Position = { x: number; y: number }

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v))
}

// Uniform scale the browser applies to the natural image to satisfy `object-fit` inside a
// `pw`x`ph` box — `cover` scales up to the larger ratio (so the box is always filled, overflow is
// cropped), `contain`/`stretch`* scale to the smaller ratio (so the whole image fits, letterboxed).
// (*`stretch` never reaches this — dragging/sliders are disabled for it, see callers.)
function computeSlack(fit: ImageFit, pw: number, ph: number, nw: number, nh: number): { slackX: number; slackY: number } {
    const scale = fit === 'cover' ? Math.max(pw / nw, ph / nh) : Math.min(pw / nw, ph / nh)
    return { slackX: nw * scale - pw, slackY: nh * scale - ph }
}

type Props = {
    elementKey: string
    element: Element
    channelId: number
    currentPhase: Phase
    onPatchElement: PatchElement
}

export default function ImageBoxSettings({elementKey, element, channelId, currentPhase, onPatchElement}: Props) {
    const img = element.kind === 'imageBox' ? element : null
    const url = img?.url ?? ''
    const fit = img?.fit ?? DEFAULT_IMAGE_FIT
    const position: Position = img?.position ?? DEFAULT_IMAGE_POSITION
    const pannable = fit !== 'stretch'

    const fileInputRef = useRef<HTMLInputElement | null>(null)
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Natural pixel size of the loaded image — needed to compute per-axis drag slack. Reset
    // whenever the image itself changes so a stale size from the previous upload is never used.
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
    useEffect(() => {
        setNatural(null)
    }, [url])

    // Local drag state: the preview follows the pointer from here, not from `element.position`,
    // so no `onPatchElement` call (and no undo entry) happens until the drag ends.
    const [dragPos, setDragPos] = useState<Position | null>(null)
    const dragRef = useRef<{
        startClientX: number
        startClientY: number
        startX: number
        startY: number
        slackX: number
        slackY: number
        // Latest computed position — read on release instead of `dragPos`, so the commit never
        // has to happen inside a state updater (which React may run twice in strict mode).
        current: Position
    } | null>(null)

    if (!img) return null

    const fileName = url ? url.split('/').pop() || url : ''
    const displayed = dragPos ?? position

    const box = resolveBox(element, currentPhase) ?? REGISTRY['image-box'].defaultBox
    const aspect = box.w / box.h
    const pw = aspect >= 1 ? PREVIEW_MAX : PREVIEW_MAX * aspect
    const ph = aspect >= 1 ? PREVIEW_MAX / aspect : PREVIEW_MAX

    const canDrag = pannable && natural !== null
    const slack = canDrag ? computeSlack(fit, pw, ph, natural!.w, natural!.h) : null
    const xLocked = !slack || Math.abs(slack.slackX) < 1
    const yLocked = !slack || Math.abs(slack.slackY) < 1

    function removeImage() {
        onPatchElement(elementKey, {url: undefined})
    }

    function patchPosition(next: Position) {
        onPatchElement(elementKey, {position: next})
    }

    async function upload() {
        const file = fileInputRef.current?.files?.[0]
        if (!file) return
        if (file.size > MAX_FILE_BYTES) {
            setError('File is too large — max 10 MB.')
            return
        }
        setError(null)
        setUploading(true)
        try {
            const form = new FormData()
            form.append('file', file)
            form.append('channel_id', String(channelId))
            const result = await postMultipart(getEndpoints().layout_image_upload, form)
            if (result && typeof result.url === 'string') {
                onPatchElement(elementKey, {url: result.url})
                if (fileInputRef.current) fileInputRef.current.value = ''
            } else {
                setError('Upload failed.')
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed.')
        } finally {
            setUploading(false)
        }
    }

    function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (!canDrag || !slack) return
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = {
            startClientX: e.clientX,
            startClientY: e.clientY,
            startX: position.x,
            startY: position.y,
            slackX: slack.slackX,
            slackY: slack.slackY,
            current: {x: position.x, y: position.y},
        }
        setDragPos({x: position.x, y: position.y})
    }

    function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current
        if (!drag) return
        const deltaX = e.clientX - drag.startClientX
        const deltaY = e.clientY - drag.startClientY
        const nextX = Math.abs(drag.slackX) < 1 ? drag.startX : clamp(drag.startX - (deltaX / drag.slackX) * 100, 0, 100)
        const nextY = Math.abs(drag.slackY) < 1 ? drag.startY : clamp(drag.startY - (deltaY / drag.slackY) * 100, 0, 100)
        drag.current = {x: nextX, y: nextY}
        setDragPos(drag.current)
    }

    function endDrag(e: React.PointerEvent<HTMLDivElement>) {
        const drag = dragRef.current
        if (!drag) return
        try {
            e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
            // pointer capture already released (e.g. by a pointercancel) — nothing to clean up
        }
        dragRef.current = null
        setDragPos(null)
        patchPosition({x: Math.round(drag.current.x), y: Math.round(drag.current.y)})
    }

    return (
        <div className="d-flex flex-column gap-2">
            <div>
                <label className="form-label mb-0 small">Current image</label>
                {url ? (
                    <div className="d-flex flex-column gap-1">
                        <div
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            style={{
                                width: pw,
                                height: ph,
                                background: '#000',
                                position: 'relative',
                                overflow: 'hidden',
                                cursor: canDrag ? (dragPos ? 'grabbing' : 'grab') : 'default',
                                // On the element that receives the pointer events, so a touch drag
                                // pans the image instead of scrolling the page.
                                touchAction: 'none',
                                userSelect: 'none',
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={url}
                                alt=""
                                draggable={false}
                                onLoad={(e) => setNatural({w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight})}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    display: 'block',
                                    objectFit: OBJECT_FIT[fit],
                                    objectPosition: `${displayed.x}% ${displayed.y}%`,
                                    pointerEvents: 'none',
                                }}
                            />
                        </div>
                        {pannable && <div className="small text-secondary">Drag the image to choose what shows in the box.</div>}
                        <div className="d-flex align-items-center gap-2">
                            <span className="small text-secondary text-break">{fileName}</span>
                            <button type="button" className="btn btn-sm btn-link p-0 text-danger" onClick={removeImage}>
                                Remove
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="small text-secondary">No image uploaded.</div>
                )}
            </div>
            <div>
                <label className="form-label mb-0 small" htmlFor={`ctl-imgbox-file-${elementKey}`}>Upload</label>
                <div className="d-flex align-items-center gap-2">
                    <input
                        id={`ctl-imgbox-file-${elementKey}`}
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPT}
                        className="form-control form-control-sm"
                        disabled={uploading}
                    />
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-primary text-nowrap"
                        disabled={uploading}
                        onClick={upload}
                    >
                        {uploading ? 'Uploading…' : 'Upload'}
                    </button>
                </div>
                {error && <div className="small text-danger">{error}</div>}
            </div>
            <div>
                <label className="form-label mb-0 small" htmlFor={`ctl-imgbox-fit-${elementKey}`}>Fit</label>
                <select
                    id={`ctl-imgbox-fit-${elementKey}`}
                    className="form-select form-select-sm"
                    value={fit}
                    onChange={(e) => onPatchElement(elementKey, {fit: e.target.value as ImageFit})}
                >
                    {IMAGE_FITS.map((f) => (
                        <option key={f} value={f}>{FIT_LABELS[f]}</option>
                    ))}
                </select>
            </div>
            {url && (pannable ? (
                <div className="d-flex flex-column gap-1">
                    <div>
                        <label className="form-label mb-0 small" htmlFor={`ctl-imgbox-posx-${elementKey}`}>
                            Horizontal ({Math.round(displayed.x)})
                        </label>
                        <input
                            id={`ctl-imgbox-posx-${elementKey}`}
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            className="form-range"
                            value={position.x}
                            disabled={xLocked}
                            onChange={(e) => patchPosition({...position, x: Number(e.target.value)})}
                        />
                    </div>
                    <div>
                        <label className="form-label mb-0 small" htmlFor={`ctl-imgbox-posy-${elementKey}`}>
                            Vertical ({Math.round(displayed.y)})
                        </label>
                        <input
                            id={`ctl-imgbox-posy-${elementKey}`}
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            className="form-range"
                            value={position.y}
                            disabled={yLocked}
                            onChange={(e) => patchPosition({...position, y: Number(e.target.value)})}
                        />
                    </div>
                    <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary align-self-start"
                        onClick={() => onPatchElement(elementKey, {position: undefined})}
                    >
                        Center
                    </button>
                </div>
            ) : (
                <div className="small text-secondary">Stretch ignores position.</div>
            ))}
        </div>
    )
}
