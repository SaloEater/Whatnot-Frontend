'use client'

// Settings for `scene` (obs-scene-element-plan.md §2.5): a Full/Reduced quality toggle, one row per
// entry in `element.effects` (enabled checkbox + that effect's own controls), and a Reset button
// that restores DEFAULT_SCENE_EFFECTS. Like TextSettings/FrameSettings/SportStyleBoardSettings,
// this mutates the element itself via `onPatchElement` — deliberately NOT `useSettingWrite`, which
// is for settings that live on the BACKEND outside LayoutConfig (e.g. CobraBoardSettings' price
// ranges): `'layout_config'` is not a real `LayoutDataSourceKey` (see useLayoutData.tsx's actual
// union), and TextSettings.tsx's header comment already documents why nothing in this file's family
// uses that hook — the config path (ElementsPanel's `patchElement` -> `mutate(..., {debounce:
// true})`) already pushes to OBS itself, debounced 400ms. That debounce is also what keeps a
// dragged Y/speed/opacity field from spamming a bus push per keystroke — there is nothing extra
// to add here for that; every field below just patches on `onChange` like every other numeric
// setting in this family (StashOrPassWrapSettings' pad/speed, FrameSettings' border widths, …).
//
// Every field used to be a `type="range"` slider stacked in its own row; they're now compact
// `type="number"` inputs (`.scene-settings-num`, ~5rem, see SceneSettings.css) laid out inline per
// effect so the whole panel fits in roughly half the vertical space. `onChange` still commits like
// before, but NaN-guarded: an empty or partial value (deleting the field, typing a lone "-") is
// ignored rather than written as `NaN` — the DOM input is left showing whatever the user typed
// (nothing re-renders this component when `onChange` bails out, so nothing stomps it), and `onBlur`
// clamps back to a valid number in range once they're done editing.

import { useRef } from 'react'
import type { ChangeEvent, FocusEvent } from 'react'
import type { Element } from '@/app/obs/layout/schema'
import { DEFAULT_SCENE_EFFECTS, SCENE_QUALITIES, SKY_MOODS } from '@/app/obs/layout/schema'
import type { SceneEffect, SceneQuality, SkyMood } from '@/app/obs/layout/schema'
import type { PatchElement } from './ElementBlock'
import './SceneSettings.css'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
}

const QUALITY_LABELS: Record<SceneQuality, string> = {
    full: 'Full',
    reduced: 'Reduced',
}

const MOOD_LABELS: Record<SkyMood, string> = {
    day: 'Day',
    dusk: 'Dusk',
    night: 'Night',
}

const EFFECT_LABELS: Record<SceneEffect['id'], string> = {
    sky: 'Sky',
    mountain: 'Mountain',
    clouds: 'Clouds',
    rain: 'Rain',
    lightning: 'Lightning',
    birds: 'Birds',
}

// obs-scene-element-plan.md §5's lightning row: the interval input's own range, and the value the
// "cue only" checkbox restores when unchecked (matching DEFAULT_SCENE_EFFECTS' own default).
const LIGHTNING_INTERVAL_MIN = 1
const LIGHTNING_INTERVAL_MAX = 600
const LIGHTNING_INTERVAL_FALLBACK = 20

// obs-scene-element-plan.md §6's birds row ranges (config.ts's `validateSceneEffect` enforces the
// same bounds).
const BIRDS_COUNT_MIN = 1
const BIRDS_COUNT_MAX = 12
const BIRDS_INTERVAL_MIN = 5
const BIRDS_INTERVAL_MAX = 600
const BIRDS_Y_MIN = 0
const BIRDS_Y_MAX = 100

function clamp(v: number, min: number, max: number): number {
    if (Number.isNaN(v)) return min
    return Math.min(max, Math.max(min, v))
}

export default function SceneSettings({ elementKey, element, onPatchElement }: Props) {
    const scene = element.kind === 'scene' ? element : null

    // obs-scene-element-plan.md §5's "unchecking 'cue only' restores the last slider value": kept
    // per effect-array index (not per-id — `clouds` also repeats by index) in a ref rather than
    // `useState`, since it must survive across "cue only" toggles without itself triggering a
    // render, and it is derived, never the write-of-record (`element.effects` on the stored config
    // is). Synced during render (below) whenever the current value is a real number, so it always
    // reflects the last non-null value this row actually had — including one loaded from a stored
    // config on mount, not just one dragged in this session. Declared before the `!scene` early
    // return below (rules of hooks: every hook must run on every render of this component).
    const lastIntervalRef = useRef<Record<number, number>>({})

    if (!scene) return null

    const quality = scene.quality ?? 'full'
    const effects = scene.effects

    effects.forEach((e, i) => {
        if (e.id === 'lightning' && e.ambientIntervalSec !== null) {
            lastIntervalRef.current[i] = e.ambientIntervalSec
        }
    })

    function setQuality(next: SceneQuality) {
        onPatchElement(elementKey, { quality: next })
    }

    // `patch` is loosely typed (not `Partial<SceneEffect>`): `keyof (A | B | C)` is the
    // INTERSECTION of the union members' keys, not their union, so `Partial<SceneEffect>` would
    // only ever admit `id`/`enabled` — every call site below already knows which effect it's
    // patching, so a plain object is safe here the same way `PatchElement`'s own `patch` param is.
    function patchEffectAt(index: number, patch: Record<string, unknown>) {
        const next = effects.map((e, i) => (i === index ? ({ ...e, ...patch } as SceneEffect) : e))
        onPatchElement(elementKey, { effects: next })
    }

    function resetToDefaults() {
        onPatchElement(elementKey, { quality: 'full', effects: DEFAULT_SCENE_EFFECTS.map((e) => ({ ...e })) })
    }

    // Generic handlers for a single, independent numeric field (mountain Y, clouds speed/opacity/Y,
    // rain intensity, birds interval). `onChange` NaN-guards (an empty/partial value, e.g. "" or
    // "-", is simply ignored — never written as `NaN`); `onBlur` clamps whatever's left into range,
    // falling back to `current` if the field couldn't be parsed as a number at all.
    function numberField(index: number, field: string, min: number, max: number, current: number) {
        return {
            onChange: (e: ChangeEvent<HTMLInputElement>) => {
                const v = Number(e.target.value)
                if (!Number.isFinite(v)) return
                patchEffectAt(index, { [field]: v })
            },
            onBlur: (e: FocusEvent<HTMLInputElement>) => {
                const v = Number(e.target.value)
                patchEffectAt(index, { [field]: Number.isFinite(v) ? clamp(v, min, max) : current })
            },
        }
    }

    return (
        <div className="d-flex flex-column gap-3">
            <div className="d-flex align-items-center gap-2">
                <label className="form-label mb-0 small">Quality</label>
                <div className="btn-group btn-group-sm" role="group">
                    {SCENE_QUALITIES.map((q) => (
                        <button
                            key={q}
                            type="button"
                            className={`btn ${quality === q ? 'btn-primary' : 'btn-outline-secondary'}`}
                            onClick={() => setQuality(q)}
                        >
                            {QUALITY_LABELS[q]}
                        </button>
                    ))}
                </div>
            </div>

            <div className="d-flex flex-column gap-2">
                {effects.map((effect, index) => (
                    <div
                        key={`${effect.id}-${index}`}
                        className="d-flex flex-wrap align-items-center gap-3 border rounded p-2 scene-settings-row"
                    >
                        <div className="form-check mb-0">
                            <input
                                type="checkbox"
                                className="form-check-input"
                                id={`ctl-scene-${elementKey}-${index}-enabled`}
                                checked={effect.enabled}
                                onChange={(e) => patchEffectAt(index, { enabled: e.target.checked })}
                            />
                            <label
                                className="form-check-label small fw-semibold"
                                htmlFor={`ctl-scene-${elementKey}-${index}-enabled`}
                            >
                                {EFFECT_LABELS[effect.id]}
                                {effect.id === 'clouds' && ` (${effect.layer})`}
                            </label>
                        </div>

                        {effect.id === 'sky' && (
                            <div className="d-flex align-items-center gap-1 scene-settings-group">
                                <label className="small text-muted mb-0" htmlFor={`ctl-scene-${elementKey}-${index}-mood`}>
                                    Mood
                                </label>
                                <select
                                    id={`ctl-scene-${elementKey}-${index}-mood`}
                                    className="form-select form-select-sm w-auto"
                                    value={effect.mood}
                                    onChange={(e) => patchEffectAt(index, { mood: e.target.value as SkyMood })}
                                >
                                    {SKY_MOODS.map((m) => (
                                        <option key={m} value={m}>
                                            {MOOD_LABELS[m]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {effect.id === 'mountain' && (
                            <div className="d-flex align-items-center gap-1 scene-settings-group">
                                <label className="small text-muted mb-0" htmlFor={`ctl-scene-${elementKey}-${index}-y`}>
                                    Y
                                </label>
                                <input
                                    id={`ctl-scene-${elementKey}-${index}-y`}
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={1}
                                    className="form-control form-control-sm scene-settings-num"
                                    value={effect.y}
                                    {...numberField(index, 'y', 0, 100, effect.y)}
                                />
                            </div>
                        )}

                        {effect.id === 'clouds' && (
                            <>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    <label
                                        className="small text-muted mb-0"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-speed`}
                                    >
                                        Speed
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-speed`}
                                        type="number"
                                        min={0}
                                        max={200}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.speed}
                                        {...numberField(index, 'speed', 0, 200, effect.speed)}
                                    />
                                </div>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    <label
                                        className="small text-muted mb-0"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-opacity`}
                                    >
                                        Opacity
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-opacity`}
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.opacity}
                                        {...numberField(index, 'opacity', 0, 1, effect.opacity)}
                                    />
                                </div>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    <label
                                        className="small text-muted mb-0"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-clouds-y`}
                                    >
                                        Y
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-clouds-y`}
                                        type="number"
                                        min={0}
                                        max={100}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.y}
                                        {...numberField(index, 'y', 0, 100, effect.y)}
                                    />
                                </div>
                            </>
                        )}

                        {effect.id === 'rain' && (
                            <div className="d-flex align-items-center gap-1 scene-settings-group">
                                <label
                                    className="small text-muted mb-0"
                                    htmlFor={`ctl-scene-${elementKey}-${index}-intensity`}
                                >
                                    Intensity
                                </label>
                                <input
                                    id={`ctl-scene-${elementKey}-${index}-intensity`}
                                    type="number"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    className="form-control form-control-sm scene-settings-num"
                                    value={effect.intensity}
                                    {...numberField(index, 'intensity', 0, 1, effect.intensity)}
                                />
                            </div>
                        )}

                        {effect.id === 'lightning' && (
                            <>
                                <div className="form-check mb-0 scene-settings-group">
                                    <input
                                        type="checkbox"
                                        className="form-check-input"
                                        id={`ctl-scene-${elementKey}-${index}-cue-only`}
                                        checked={effect.ambientIntervalSec === null}
                                        onChange={(e) =>
                                            patchEffectAt(index, {
                                                // Unchecking restores the last value THIS row's input
                                                // was actually at (obs-scene-element-plan.md §5), not a
                                                // fixed constant — falling back to
                                                // LIGHTNING_INTERVAL_FALLBACK only the first time this
                                                // row has ever held a number (nothing in the ref yet).
                                                ambientIntervalSec: e.target.checked
                                                    ? null
                                                    : lastIntervalRef.current[index] ?? LIGHTNING_INTERVAL_FALLBACK,
                                            })
                                        }
                                    />
                                    <label
                                        className="form-check-label small"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-cue-only`}
                                    >
                                        Cue only
                                    </label>
                                </div>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    {/* Always rendered (not conditionally hidden) so the row's shape
                                        never jumps when "cue only" is toggled — greyed out via
                                        `disabled` instead, per obs-scene-element-plan.md §5. Its value
                                        while disabled is the last non-null value this row held (the
                                        ref above), so the field doesn't jump to some other number the
                                        instant the checkbox is unticked. */}
                                    <label
                                        className="small text-muted mb-0"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-interval`}
                                    >
                                        Interval (s)
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-interval`}
                                        type="number"
                                        min={LIGHTNING_INTERVAL_MIN}
                                        max={LIGHTNING_INTERVAL_MAX}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        disabled={effect.ambientIntervalSec === null}
                                        value={
                                            effect.ambientIntervalSec ??
                                            lastIntervalRef.current[index] ??
                                            LIGHTNING_INTERVAL_FALLBACK
                                        }
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            if (!Number.isFinite(v)) return
                                            patchEffectAt(index, { ambientIntervalSec: v })
                                        }}
                                        onBlur={(e) => {
                                            const v = Number(e.target.value)
                                            const fallback = lastIntervalRef.current[index] ?? LIGHTNING_INTERVAL_FALLBACK
                                            patchEffectAt(index, {
                                                ambientIntervalSec: Number.isFinite(v)
                                                    ? clamp(v, LIGHTNING_INTERVAL_MIN, LIGHTNING_INTERVAL_MAX)
                                                    : fallback,
                                            })
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        {effect.id === 'birds' && (
                            <>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    <label className="small text-muted mb-0">Flock</label>
                                    <label
                                        className="visually-hidden"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-count-min`}
                                    >
                                        Flock size min
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-count-min`}
                                        type="number"
                                        min={BIRDS_COUNT_MIN}
                                        max={BIRDS_COUNT_MAX}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.countMin}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            if (!Number.isFinite(v)) return
                                            patchEffectAt(index, { countMin: v, countMax: Math.max(v, effect.countMax) })
                                        }}
                                        onBlur={(e) => {
                                            const v = Number(e.target.value)
                                            const next = Number.isFinite(v)
                                                ? clamp(v, BIRDS_COUNT_MIN, BIRDS_COUNT_MAX)
                                                : effect.countMin
                                            patchEffectAt(index, { countMin: next, countMax: Math.max(next, effect.countMax) })
                                        }}
                                    />
                                    <span className="text-muted small px-1">–</span>
                                    <label
                                        className="visually-hidden"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-count-max`}
                                    >
                                        Flock size max
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-count-max`}
                                        type="number"
                                        min={BIRDS_COUNT_MIN}
                                        max={BIRDS_COUNT_MAX}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.countMax}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            if (!Number.isFinite(v)) return
                                            patchEffectAt(index, { countMax: v, countMin: Math.min(v, effect.countMin) })
                                        }}
                                        onBlur={(e) => {
                                            const v = Number(e.target.value)
                                            const next = Number.isFinite(v)
                                                ? clamp(v, BIRDS_COUNT_MIN, BIRDS_COUNT_MAX)
                                                : effect.countMax
                                            patchEffectAt(index, { countMax: next, countMin: Math.min(next, effect.countMin) })
                                        }}
                                    />
                                </div>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    <label
                                        className="small text-muted mb-0"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-interval`}
                                    >
                                        Interval (s)
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-interval`}
                                        type="number"
                                        min={BIRDS_INTERVAL_MIN}
                                        max={BIRDS_INTERVAL_MAX}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.intervalSec}
                                        {...numberField(index, 'intervalSec', BIRDS_INTERVAL_MIN, BIRDS_INTERVAL_MAX, effect.intervalSec)}
                                    />
                                </div>
                                <div className="d-flex align-items-center gap-1 scene-settings-group">
                                    <label className="small text-muted mb-0">Y</label>
                                    <label
                                        className="visually-hidden"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-ymin`}
                                    >
                                        Y min
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-ymin`}
                                        type="number"
                                        min={BIRDS_Y_MIN}
                                        max={BIRDS_Y_MAX}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.yMin}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            if (!Number.isFinite(v)) return
                                            patchEffectAt(index, { yMin: v, yMax: Math.max(v, effect.yMax) })
                                        }}
                                        onBlur={(e) => {
                                            const v = Number(e.target.value)
                                            const next = Number.isFinite(v) ? clamp(v, BIRDS_Y_MIN, BIRDS_Y_MAX) : effect.yMin
                                            patchEffectAt(index, { yMin: next, yMax: Math.max(next, effect.yMax) })
                                        }}
                                    />
                                    <span className="text-muted small px-1">–</span>
                                    <label
                                        className="visually-hidden"
                                        htmlFor={`ctl-scene-${elementKey}-${index}-ymax`}
                                    >
                                        Y max
                                    </label>
                                    <input
                                        id={`ctl-scene-${elementKey}-${index}-ymax`}
                                        type="number"
                                        min={BIRDS_Y_MIN}
                                        max={BIRDS_Y_MAX}
                                        step={1}
                                        className="form-control form-control-sm scene-settings-num"
                                        value={effect.yMax}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            if (!Number.isFinite(v)) return
                                            patchEffectAt(index, { yMax: v, yMin: Math.min(v, effect.yMin) })
                                        }}
                                        onBlur={(e) => {
                                            const v = Number(e.target.value)
                                            const next = Number.isFinite(v) ? clamp(v, BIRDS_Y_MIN, BIRDS_Y_MAX) : effect.yMax
                                            patchEffectAt(index, { yMax: next, yMin: Math.min(next, effect.yMin) })
                                        }}
                                    />
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>

            <button type="button" className="btn btn-sm btn-outline-secondary align-self-start" onClick={resetToDefaults}>
                Reset to defaults
            </button>
        </div>
    )
}
