'use client'

// Settings for `cameraShelf` (obs-camera-shelf-plan.md §7). Every field goes through
// `onPatchElement` (ElementsPanel's `mutate` -> debounced `pushConfig`) — the config path already
// pushes to OBS, so no `useSettingWrite` here (that hook is for settings that live on the BACKEND,
// not inside LayoutConfig). The one thing that talks to OBS directly, outside that push, is
// `obs.getProgramSceneItemNames()`/`obs.getSceneItemRenderedAspect()` — the SAVED value
// (`cameraAspect`) is still just plain config, written via `onPatchElement` like everything else.

import { useEffect, useState } from 'react'
import type { Element, Phase } from '@/app/obs/layout/schema'
import { MAX_TEXT_LENGTH } from '@/app/obs/layout/schema'
import {
    DEFAULT_GLARE,
    DEFAULT_GLARE_OPACITY,
    DEFAULT_LABEL_FONT_SIZE,
    DEFAULT_FILL_COLOR,
    DEFAULT_LABEL_OFFSET_Y,
    DEFAULT_SHELF_LABEL,
    cameraGaps,
} from '@/app/obs/layout/elements/camera-shelf/CameraShelfElement'
import { SHELF_ASSETS, SHELF_RECTS } from '@/app/obs/layout/elements/camera-shelf/assets'
import type { MyOBSWebsocket } from '@/app/entity/my_obs_websocket'
import type { PatchElement } from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    currentPhase: Phase
    onPatchElement: PatchElement
    obs: MyOBSWebsocket | null
    isConnected: boolean
}

export default function CameraShelfSettings({
    elementKey,
    element,
    currentPhase,
    onPatchElement,
    obs,
    isConnected,
}: Props) {
    // Narrowed into a local rather than an early return so the hooks below stay unconditional
    // (rules-of-hooks) — same convention as TextSettings.tsx; this panel is only ever mounted for
    // a `cameraShelf` element anyway.
    const shelf = element.kind === 'cameraShelf' ? element : null
    const savedLabel = shelf?.label ?? DEFAULT_SHELF_LABEL

    // The header text is a DRAFT, committed by Save — copied from TextSettings.tsx's draft
    // convention (typing is not the same as nudging a number: every keystroke would otherwise be a
    // config push and a bus emit to OBS). A single-line input rather than TextSettings' 3-row
    // textarea: the header plate holds one short line, never multi-line copy.
    const [draft, setDraft] = useState(savedLabel)
    useEffect(() => {
        setDraft(savedLabel)
    }, [savedLabel])

    // OBS-source names, refetched on connect and by the Refresh button — kept only to drive the
    // LOCAL, unsaved "Read aspect from" select below (obs-visibility-toggle-plan.md §11): the shelf
    // no longer saves a bound source of its own, so there is nothing here to persist.
    const [sourceNames, setSourceNames] = useState<string[]>([])
    // Unsaved: which fetched source to read `cameraAspect` from. Never written to config.
    const [readSource, setReadSource] = useState('')

    const [readNotice, setReadNotice] = useState<string | null>(null)

    function refreshSources() {
        if (!obs || !isConnected) {
            setSourceNames([])
            return
        }
        obs.getProgramSceneItemNames().then(setSourceNames).catch(() => setSourceNames([]))
    }
    useEffect(() => {
        refreshSources()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, obs])

    if (!shelf) return null

    const labelFontSize = shelf.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
    const labelOffsetY = shelf.labelOffsetY ?? DEFAULT_LABEL_OFFSET_Y
    const glare = shelf.glare ?? DEFAULT_GLARE
    const flip = shelf.flip ?? false
    const fillBlur = shelf.fillBlur ?? 0
    const glareOpacity = shelf.glareOpacity ?? DEFAULT_GLARE_OPACITY
    const dirty = draft !== savedLabel
    const placements = shelf.placements
    const box = placements[currentPhase] ?? placements.all

    // Window size at the current stage's box (read-only readout, and the gap-fill line below).
    const s = box ? box.w / SHELF_ASSETS.shelf.w : 0
    const win = box
        ? {
              x: SHELF_RECTS.window.x * s,
              y: SHELF_RECTS.window.y * s,
              w: SHELF_RECTS.window.w * s,
              h: SHELF_RECTS.window.h * s,
          }
        : null
    const gaps = win ? cameraGaps(win, shelf.cameraAspect) : []
    let gapReadout: string | null = null
    if (win && gaps.length > 0) {
        // Two gaps of equal width means left/right (pillarbox); equal height means top/bottom
        // (letterbox) — `cameraGaps` never returns anything else.
        if (gaps[0].w < win.w) {
            gapReadout = `${Math.round(gaps[0].w)} px each side`
        } else {
            gapReadout = `${Math.round(gaps[0].h)} px top and bottom`
        }
    }

    function fitHeight() {
        if (!box) return
        const nextH = Math.round((SHELF_ASSETS.shelf.h * box.w) / SHELF_ASSETS.shelf.w)
        onPatchElement(elementKey, { placements: { ...placements, [currentPhase]: { ...box, h: nextH } } })
    }

    // "Read from OBS" (obs-camera-shelf-plan.md §7, source select moved to a local/unsaved pick in
    // obs-visibility-toggle-plan.md §11 since the shelf no longer saves a bound source of its own):
    // reads the picked camera source's own rendered aspect ratio and saves it as `cameraAspect`, so
    // the gap-fill math above has a real number instead of the operator eyeballing it.
    async function readFromObs() {
        if (!obs || !isConnected || !readSource) return
        setReadNotice(null)
        try {
            const item = await obs.findSceneItemInProgramScene(readSource)
            if (!item) {
                setReadNotice(`"${readSource}" is not in the program scene`)
                return
            }
            const aspect = await obs.getSceneItemRenderedAspect(item.scene, item.id)
            if (!aspect || aspect <= 0) {
                setReadNotice('OBS reported a zero-size source')
                return
            }
            onPatchElement(elementKey, { cameraAspect: aspect })
        } catch (e) {
            setReadNotice(e instanceof Error ? e.message : String(e))
        }
    }

    return (
        <div className="d-flex flex-column gap-2">
            <div>
                <label className="form-label mb-0 small">Label</label>
                <input
                    type="text"
                    className="form-control form-control-sm"
                    maxLength={MAX_TEXT_LENGTH}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                />
                <div className="d-flex align-items-center gap-2 mt-1">
                    <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        disabled={!dirty}
                        onClick={() => onPatchElement(elementKey, { label: draft })}
                    >
                        Save
                    </button>
                    {dirty && (
                        <button
                            type="button"
                            className="btn btn-sm btn-link p-0"
                            onClick={() => setDraft(savedLabel)}
                        >
                            Discard
                        </button>
                    )}
                    {dirty && <span className="text-warning small">Unsaved</span>}
                </div>
            </div>

            <div>
                <label className="form-label mb-0 small">Label font size (px)</label>
                <input
                    type="number"
                    min={1}
                    step={1}
                    className="form-control form-control-sm"
                    style={{ width: '100px' }}
                    value={labelFontSize}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        onPatchElement(elementKey, {
                            labelFontSize: Number.isFinite(parsed) && parsed > 0 ? parsed : 1,
                        })
                    }}
                />
            </div>

            <div>
                <label className="form-label mb-0 small">Label Y offset (px from the art&apos;s {flip ? 'bottom' : 'top'} edge)</label>
                <input
                    type="number"
                    step={1}
                    className="form-control form-control-sm"
                    style={{ width: '100px' }}
                    value={labelOffsetY}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        onPatchElement(elementKey, { labelOffsetY: Number.isFinite(parsed) ? parsed : 0 })
                    }}
                />
            </div>

            <div className="form-check">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id={`csh-flip-${elementKey}`}
                    checked={flip}
                    onChange={(e) => onPatchElement(elementKey, { flip: e.target.checked })}
                />
                <label className="form-check-label small" htmlFor={`csh-flip-${elementKey}`}>
                    Flip (header at the bottom; label offset then counts from the bottom edge)
                </label>
            </div>
            <div className="form-check">
                <input
                    type="checkbox"
                    className="form-check-input"
                    id={`csh-glare-${elementKey}`}
                    checked={glare}
                    onChange={(e) => onPatchElement(elementKey, { glare: e.target.checked })}
                />
                <label className="form-check-label small" htmlFor={`csh-glare-${elementKey}`}>
                    Glare
                </label>
            </div>
            <div>
                <label className="form-label mb-0 small">Glare opacity</label>
                <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    className="form-range"
                    disabled={!glare}
                    value={glareOpacity}
                    onChange={(e) => onPatchElement(elementKey, { glareOpacity: parseFloat(e.target.value) })}
                />
            </div>

            <div>
                <label className="form-label mb-0 small">Fill blur ({fillBlur}%)</label>
                <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    className="form-range"
                    value={fillBlur}
                    onChange={(e) => onPatchElement(elementKey, { fillBlur: parseInt(e.target.value, 10) })}
                />
                <div className="small text-secondary">
                    0 = solid fill colour. Above 0 the strips paint no colour, only a blur of that strength
                    over whatever layout element sits behind them.
                </div>
            </div>

            <div className="d-flex align-items-end gap-2">
                <div>
                    <label className="form-label mb-0 small">Camera aspect (w/h)</label>
                    <input
                        type="number"
                        min={0.01}
                        step={0.01}
                        className="form-control form-control-sm"
                        style={{ width: '100px' }}
                        value={shelf.cameraAspect ?? ''}
                        placeholder="unset"
                        onChange={(e) => {
                            const raw = e.target.value
                            if (raw === '') {
                                onPatchElement(elementKey, { cameraAspect: undefined })
                                return
                            }
                            const parsed = parseFloat(raw)
                            if (Number.isFinite(parsed) && parsed > 0) {
                                onPatchElement(elementKey, { cameraAspect: parsed })
                            }
                        }}
                    />
                </div>
                <div>
                    <label className="form-label mb-0 small">Fill colour</label>
                    <input
                        type="color"
                        className="form-control form-control-color form-control-sm"
                        value={shelf.fillColor ?? DEFAULT_FILL_COLOR}
                        title="Colour of the gap fills beside/above/below the camera — default matches the cabinet's inner faces"
                        onChange={(e) => onPatchElement(elementKey, { fillColor: e.target.value })}
                    />
                </div>
            </div>
            <div className="small text-secondary">
                {gapReadout
                    ? `Gap fill: ${gapReadout}.`
                    : 'No gap fill — either cameraAspect is unset or it matches the window.'}
            </div>
            {readNotice && <div className="small text-warning">{readNotice}</div>}

            {/* obs-visibility-toggle-plan.md §11: the shelf no longer binds/saves an OBS source of
                its own — enabling/disabling a source is now the `obsToggle` element's job. This
                select is LOCAL and unsaved, purely so "Read from OBS" has something to read the
                rendered aspect off; nothing here is written to config. */}
            <div className="d-flex align-items-end gap-2">
                <div>
                    <label className="form-label mb-0 small">Read aspect from</label>
                    <select
                        className="form-select form-select-sm"
                        style={{ width: '220px' }}
                        disabled={sourceNames.length === 0}
                        value={sourceNames.includes(readSource) ? readSource : ''}
                        onChange={(e) => setReadSource(e.target.value)}
                    >
                        <option value="">
                            {sourceNames.length === 0
                                ? isConnected
                                    ? 'No scene items found'
                                    : 'Connect to OBS to choose'
                                : 'Select source'}
                        </option>
                        {sourceNames.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </select>
                </div>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={refreshSources}>
                    Refresh
                </button>
                <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    disabled={!isConnected || !readSource}
                    onClick={readFromObs}
                >
                    Read from OBS
                </button>
            </div>
            <div className="small text-secondary">
                This shelf no longer enables/disables an OBS source itself — add an{' '}
                <strong>OBS visibility</strong> element on the same stage(s) and list the camera (and
                optional backing) source there instead.
            </div>

            <div>
                <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!box} onClick={fitHeight}>
                    Fit height
                </button>
            </div>

            {win && (
                <div className="small text-muted">
                    Window: {Math.round(win.w)}×{Math.round(win.h)} px (aspect {(win.w / win.h).toFixed(2)}:1)
                </div>
            )}
        </div>
    )
}
