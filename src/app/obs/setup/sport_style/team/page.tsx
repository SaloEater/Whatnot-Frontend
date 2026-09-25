'use client'

// Team patch cell playground. sport-style-board-plan.md §1/§6: PatchCell.tsx/patchColors.ts/
// wearRandom.ts are now the shared modules at src/app/obs/sport_style/ (also used verbatim by the
// board:sport_style layout element) — this page owns only the knobs/UI around them, unchanged
// behaviour. `GeneralSettings` (the export/import JSON shape) now lives on PatchCell.tsx so the
// element names the same shape this page does.

import { useEffect, useRef, useState } from 'react'
import { Teams } from '@/app/common/teams'
import { mix, PatchPalette, resolveStitch, RGB, rgbToCss, StitchMode } from '@/app/obs/sport_style/patchColors'
import PatchCell, { defaultPatchStyle, GeneralSettings, PatchStyle } from '@/app/obs/sport_style/PatchCell'
import { wearParamsFor } from '@/app/obs/sport_style/wearRandom'
import { loadPalette } from '@/app/obs/sport_style/teamPalette'
import { patchSizeFor, scalePatchStyle } from '@/app/obs/sport_style/scalePatchStyle'
import { PATCH_REFERENCE_SIZE } from '@/app/obs/sport_style/fieldConstants'
import type { EdgeTier } from '@/app/obs/sport_style/tierSkins'

// Footprint background/outline shared by the three previews and the show-all grid (R1 fix 3) — a
// flat turf green in the same family as the preview panel's gradient, with a dashed outline so the
// padding around the centred patch is visible against it.
const FOOTPRINT_BG = '#2f7d32'
const FOOTPRINT_OUTLINE = '1px dashed rgba(255,255,255,0.6)'

const STITCH_MODES: StitchMode[] = ['logo', 'contrast', 'complement']

const DEFAULT_TEAM = 'Arizona Cardinals'
const STORAGE_KEY = 'test-team-patch'
const DEFAULT_MIX_ENABLED = true
const DEFAULT_MIX_RATIO = 0.3
const DEFAULT_STITCH_MIN_CONTRAST = 4.5
const DEFAULT_STITCH_MIN_LUMINANCE = 0.35
const DEFAULT_STITCH_MODE: StitchMode = 'logo'
const DEFAULT_WEAR_SEED = 1
const DEFAULT_SHOW_ALL = false
const DEFAULT_SOLD = false
const DEFAULT_SOLD_COUNT = 6
// R3.2's Edge select — 'plain' is today's auto-palette edge (PatchCell's `edgeTier` prop left
// unset), the other three map straight onto `EdgeTier`.
type EdgeChoice = 'plain' | EdgeTier
const DEFAULT_EDGE: EdgeChoice = 'plain'
const DEFAULT_TIERED_DEMO = false
// Show-all grid's "Tiered demo" order (R3.2): best/good/mid/regular by index modulo 4, so all four
// tiers read side by side (every tier now has its own neon skin — no plain slot in the demo).
const DEMO_EDGE_TIERS: EdgeTier[] = ['best', 'good', 'mid', 'regular']

function randomWearSeed(): number {
    return Math.abs(Date.now() ^ Math.floor(Math.random() * 1e9))
}

interface SavedState {
    team: string
    style: Partial<PatchStyle>
    bgOverride: RGB | null
    stitchOverride: RGB | null
    mixEnabled: boolean
    mixRatio: number
    stitchMinContrast: number
    stitchMinLuminance: number
    stitchMode: StitchMode
    wearSeed: number
    showAll: boolean
    sold: boolean
    soldCount: number
    edge: EdgeChoice
    tieredDemo: boolean
}

function loadSaved(): Partial<SavedState> {
    if (typeof window === 'undefined') return {}
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

function teamSrc(team: string): string {
    return `/images/teams/${encodeURIComponent(team)}.webp`
}

function hexToRgb(hex: string): RGB {
    const n = parseInt(hex.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function rgbToHex([r, g, b]: RGB): string {
    return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('')
}

export default function Page() {
    const [team, setTeam] = useState(() => loadSaved().team ?? DEFAULT_TEAM)
    const [palette, setPalette] = useState<PatchPalette | null>(null)
    const [bgOverride, setBgOverride] = useState<RGB | null>(() => loadSaved().bgOverride ?? null)
    const [stitchOverride, setStitchOverride] = useState<RGB | null>(() => loadSaved().stitchOverride ?? null)
    const [style, setStyle] = useState<PatchStyle>(() => {
        // A style saved before R1 fix 3 may still carry the old `size` field — strip it so it
        // doesn't linger forever in this page's state (and Export JSON) now that `PatchStyle` no
        // longer has one.
        const merged = { ...defaultPatchStyle, ...(loadSaved().style ?? {}) } as PatchStyle & { size?: unknown }
        delete merged.size
        return merged
    })
    const [mixEnabled, setMixEnabled] = useState<boolean>(() => loadSaved().mixEnabled ?? DEFAULT_MIX_ENABLED)
    const [mixRatio, setMixRatio] = useState<number>(() => loadSaved().mixRatio ?? DEFAULT_MIX_RATIO)
    const [stitchMinContrast, setStitchMinContrast] = useState<number>(() => loadSaved().stitchMinContrast ?? DEFAULT_STITCH_MIN_CONTRAST)
    const [stitchMinLuminance, setStitchMinLuminance] = useState<number>(() => loadSaved().stitchMinLuminance ?? DEFAULT_STITCH_MIN_LUMINANCE)
    const [stitchMode, setStitchMode] = useState<StitchMode>(() => loadSaved().stitchMode ?? DEFAULT_STITCH_MODE)
    const [wearSeed, setWearSeed] = useState<number>(() => loadSaved().wearSeed ?? DEFAULT_WEAR_SEED)
    // Saved state lives in localStorage, so the client's first render differs from the server's.
    // Render nothing until mounted to avoid hydration mismatches.
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])
    const [showAll, setShowAll] = useState<boolean>(() => loadSaved().showAll ?? DEFAULT_SHOW_ALL)
    const [sold, setSold] = useState<boolean>(() => loadSaved().sold ?? DEFAULT_SOLD)
    const [soldCount, setSoldCount] = useState<number>(() => loadSaved().soldCount ?? DEFAULT_SOLD_COUNT)
    const [edge, setEdge] = useState<EdgeChoice>(() => loadSaved().edge ?? DEFAULT_EDGE)
    const [tieredDemo, setTieredDemo] = useState<boolean>(() => loadSaved().tieredDemo ?? DEFAULT_TIERED_DEMO)
    const [allPalettes, setAllPalettes] = useState<Record<string, PatchPalette>>({})
    const isFirstTeamEffect = useRef(true)

    useEffect(() => {
        if (isFirstTeamEffect.current) {
            isFirstTeamEffect.current = false
        } else {
            setBgOverride(null)
            setStitchOverride(null)
        }
        loadPalette(team).then(setPalette).catch(() => setPalette(null))
    }, [team])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ team, style, bgOverride, stitchOverride, mixEnabled, mixRatio, stitchMinContrast, stitchMinLuminance, stitchMode, wearSeed, showAll, sold, soldCount, edge, tieredDemo }))
        } catch {
            // ignore storage errors
        }
    }, [team, style, bgOverride, stitchOverride, mixEnabled, mixRatio, stitchMinContrast, stitchMinLuminance, stitchMode, wearSeed, showAll, sold, soldCount, edge, tieredDemo])

    useEffect(() => {
        if (!showAll) return
        Teams.forEach(t => {
            if (allPalettes[t]) return
            loadPalette(t).then(p => setAllPalettes(prev => ({ ...prev, [t]: p }))).catch(() => {})
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAll])

    const autoBackground = palette?.background ?? [40, 40, 40]
    const effectiveAutoBackground = mixEnabled && palette ? mix(autoBackground, palette.secondary, mixRatio) : autoBackground
    const effectiveAutoStitch = palette
        ? resolveStitch(stitchMode, palette.candidates, effectiveAutoBackground, { minContrast: stitchMinContrast, minLuminance: stitchMinLuminance })
        : [230, 230, 230] as RGB
    const background = bgOverride ?? effectiveAutoBackground
    const stitch = stitchOverride ?? effectiveAutoStitch
    const edgeTierProp: EdgeTier | undefined = edge === 'plain' ? undefined : edge

    const set = <K extends keyof PatchStyle>(k: K, v: PatchStyle[K]) => setStyle(prev => ({ ...prev, [k]: v }))

    const resetAll = () => {
        try {
            localStorage.removeItem(STORAGE_KEY)
        } catch {
            // ignore storage errors
        }
        setTeam(DEFAULT_TEAM)
        setBgOverride(null)
        setStitchOverride(null)
        setStyle(defaultPatchStyle)
        setMixEnabled(DEFAULT_MIX_ENABLED)
        setMixRatio(DEFAULT_MIX_RATIO)
        setStitchMinContrast(DEFAULT_STITCH_MIN_CONTRAST)
        setStitchMinLuminance(DEFAULT_STITCH_MIN_LUMINANCE)
        setStitchMode(DEFAULT_STITCH_MODE)
        setWearSeed(DEFAULT_WEAR_SEED)
        setShowAll(DEFAULT_SHOW_ALL)
        setSold(DEFAULT_SOLD)
        setSoldCount(DEFAULT_SOLD_COUNT)
        setEdge(DEFAULT_EDGE)
        setTieredDemo(DEFAULT_TIERED_DEMO)
    }

    const slider = (label: string, key: keyof PatchStyle, min: number, max: number, step = 1) => (
        <label className="d-flex align-items-center gap-2 small" key={key}>
            <span style={{ width: 120 }}>{label}</span>
            <input type="range" className="form-range" min={min} max={max} step={step}
                   value={style[key] as number}
                   onChange={e => set(key, parseFloat(e.target.value) as never)} />
            <span style={{ width: 44, textAlign: 'right' }}>{style[key] as number}</span>
        </label>
    )

    const toggle = (label: string, key: keyof PatchStyle) => (
        <div className="form-check form-check-inline small" key={key}>
            <input className="form-check-input" type="checkbox" id={key} checked={style[key] as boolean}
                   onChange={e => set(key, e.target.checked as never)} />
            <label className="form-check-label" htmlFor={key}>{label}</label>
        </div>
    )

    const [importExportText, setImportExportText] = useState('')
    const [ieStatus, setIeStatus] = useState<{ text: string; error: boolean } | null>(null)

    const handleExport = () => {
        const { grainSeed, ...styleWithoutSeed } = style
        const settings: GeneralSettings = {
            style: styleWithoutSeed,
            mixEnabled,
            mixRatio,
            stitchMode,
            stitchMinContrast,
            stitchMinLuminance,
        }
        const json = JSON.stringify(settings, null, 2)
        setImportExportText(json)
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(json).catch(() => {})
        }
        setIeStatus({ text: 'Exported', error: false })
    }

    const handleImport = () => {
        let parsed: unknown
        try {
            parsed = JSON.parse(importExportText)
        } catch (e) {
            setIeStatus({ text: e instanceof Error ? e.message : 'Invalid JSON', error: true })
            return
        }
        if (typeof parsed !== 'object' || parsed === null) {
            setIeStatus({ text: 'Expected a JSON object', error: true })
            return
        }
        const imported = parsed as Record<string, unknown>
        let count = 0

        if (typeof imported.style === 'object' && imported.style !== null) {
            const mergedStyle: PatchStyle & { size?: unknown } = { ...defaultPatchStyle, ...(imported.style as Partial<PatchStyle>) }
            delete mergedStyle.grainSeed
            // R1 fix 3: "an imported style carrying `size` is ignored" — a pasted pre-R1 export.
            delete mergedStyle.size
            setStyle(mergedStyle)
            count++
        }
        if (typeof imported.mixEnabled === 'boolean') {
            setMixEnabled(imported.mixEnabled)
            count++
        }
        if (typeof imported.mixRatio === 'number') {
            setMixRatio(imported.mixRatio)
            count++
        }
        if (typeof imported.stitchMode === 'string' && STITCH_MODES.includes(imported.stitchMode as StitchMode)) {
            setStitchMode(imported.stitchMode as StitchMode)
            count++
        }
        if (typeof imported.stitchMinContrast === 'number') {
            setStitchMinContrast(imported.stitchMinContrast)
            count++
        }
        if (typeof imported.stitchMinLuminance === 'number') {
            setStitchMinLuminance(imported.stitchMinLuminance)
            count++
        }

        setIeStatus({ text: `Imported ${count} settings`, error: false })
    }

    const mainWear = wearParamsFor(wearSeed, 'main')
    const smallWear = wearParamsFor(wearSeed, 'small')
    const largeWear = wearParamsFor(wearSeed, 'large')

    if (!mounted) return null

    return (
        <div className="container-fluid p-3" style={{ minHeight: '100vh' }}>
            <h4>Team patch cell playground</h4>
            <div className="row g-4">
                <div className="col-lg-4">
                    <div className="mb-3 d-flex gap-3 align-items-end">
                        <div className="flex-grow-1">
                            <label className="form-label small">Team</label>
                            <select className="form-select form-select-sm" value={team} onChange={e => setTeam(e.target.value)}>
                                {Teams.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="form-check mb-2">
                            <input className="form-check-input" type="checkbox" id="sold" checked={sold}
                                   onChange={e => setSold(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="sold">Sold</label>
                        </div>
                        <div>
                            <label className="form-label small mb-0" htmlFor="edge">Edge</label>
                            <select id="edge" className="form-select form-select-sm" value={edge}
                                    onChange={e => setEdge(e.target.value as EdgeChoice)}>
                                <option value="plain">Plain</option>
                                <option value="best">Best</option>
                                <option value="good">Good</option>
                                <option value="mid">Mid</option>
                                <option value="regular">Regular</option>
                            </select>
                        </div>
                    </div>

                    <div className="mb-3 d-flex gap-3 align-items-center">
                        <label className="small d-flex align-items-center gap-1">
                            Background
                            <input type="color" value={rgbToHex(background)} onChange={e => setBgOverride(hexToRgb(e.target.value))} />
                        </label>
                        <label className="small d-flex align-items-center gap-1">
                            Stitch
                            <input type="color" value={rgbToHex(stitch)} onChange={e => setStitchOverride(hexToRgb(e.target.value))} />
                        </label>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => { setBgOverride(null); setStitchOverride(null) }}>
                            Reset to auto
                        </button>
                        <button className="btn btn-sm btn-outline-secondary" onClick={resetAll}>
                            Reset all
                        </button>
                    </div>

                    <div className="mb-3 d-flex gap-3 align-items-center">
                        <div className="form-check small">
                            <input className="form-check-input" type="checkbox" id="mixEnabled" checked={mixEnabled}
                                   onChange={e => setMixEnabled(e.target.checked)} />
                            <label className="form-check-label" htmlFor="mixEnabled">Mix background with secondary</label>
                        </div>
                        <label className="d-flex align-items-center gap-2 small">
                            <span style={{ width: 70 }}>Mix ratio</span>
                            <input type="range" className="form-range" min={0} max={1} step={0.01}
                                   value={mixRatio}
                                   onChange={e => setMixRatio(parseFloat(e.target.value))} />
                            <span style={{ width: 40, textAlign: 'right' }}>{mixRatio}</span>
                        </label>
                    </div>

                    <div className="mb-3 small d-flex gap-2 align-items-center">
                        <span style={{ width: 120 }}>Stitch colour</span>
                        <select className="form-select form-select-sm w-auto" value={stitchMode} onChange={e => setStitchMode(e.target.value as StitchMode)}>
                            <option value="logo">From logo</option>
                            <option value="contrast">Contrast (light/dark)</option>
                            <option value="complement">Complementary hue</option>
                        </select>
                    </div>

                    {stitchMode === 'logo' && (
                        <div className="mb-3 d-flex gap-3 align-items-center">
                            <label className="d-flex align-items-center gap-2 small">
                                <span style={{ width: 120 }}>Stitch min contrast</span>
                                <input type="range" className="form-range" min={1} max={10} step={0.1}
                                       value={stitchMinContrast}
                                       onChange={e => setStitchMinContrast(parseFloat(e.target.value))} />
                                <span style={{ width: 40, textAlign: 'right' }}>{stitchMinContrast}</span>
                            </label>
                            <label className="d-flex align-items-center gap-2 small">
                                <span style={{ width: 120 }}>Stitch min brightness</span>
                                <input type="range" className="form-range" min={0} max={1} step={0.01}
                                       value={stitchMinLuminance}
                                       onChange={e => setStitchMinLuminance(parseFloat(e.target.value))} />
                                <span style={{ width: 40, textAlign: 'right' }}>{stitchMinLuminance}</span>
                            </label>
                        </div>
                    )}

                    {palette && (
                        <div className="mb-3">
                            <div className="small text-secondary mb-1">
                                Auto picks: primary <span style={{ display: 'inline-block', width: 12, height: 12, background: rgbToCss(palette.background), border: '1px solid #666', verticalAlign: 'middle' }} />
                                {' '}secondary <span style={{ display: 'inline-block', width: 12, height: 12, background: rgbToCss(palette.secondary), border: '1px solid #666', verticalAlign: 'middle' }} />
                                {' '}stitch <span style={{ display: 'inline-block', width: 12, height: 12, background: rgbToCss(effectiveAutoStitch), border: '1px solid #666', verticalAlign: 'middle' }} />
                            </div>
                            <div className="small text-secondary mb-1">Extracted colours (click to use as background, right-click as stitch)</div>
                            <div className="d-flex flex-wrap gap-1">
                                {palette.candidates.slice(0, 12).map((c, i) => (
                                    <div key={i}
                                         title={`${rgbToHex(c.rgb)} ×${c.count}`}
                                         onClick={() => setBgOverride(c.rgb)}
                                         onContextMenu={e => { e.preventDefault(); setStitchOverride(c.rgb) }}
                                         style={{ width: 28, height: 28, background: rgbToCss(c.rgb), border: '1px solid #666', borderRadius: 4, cursor: 'pointer' }} />
                                ))}
                            </div>
                        </div>
                    )}

                    <h6 className="mt-3">Cell</h6>
                    {slider('Padding', 'padding', 0, 60)}
                    {slider('Corner radius', 'radius', 0, 60)}
                    {slider('Logo scale', 'logoScale', 0.3, 1, 0.01)}
                    {slider('Vignette', 'vignette', 0, 1, 0.01)}
                    {toggle('Edge shadow', 'edgeShadow')}

                    <h6 className="mt-3">Logo render</h6>
                    <div className="small d-flex gap-2 align-items-center">
                        <span style={{ width: 120 }}>Mode</span>
                        <select className="form-select form-select-sm w-auto" value={style.logoMode} onChange={e => set('logoMode', e.target.value as 'classic' | 'crisp')}>
                            <option value="classic">classic</option>
                            <option value="crisp">crisp (hard outline)</option>
                        </select>
                    </div>
                    {style.logoMode === 'crisp' && (
                        <>
                            {slider('Outline width', 'logoOutlineWidth', 0, 4, 0.1)}
                            <div className="small d-flex gap-2 align-items-center">
                                <span style={{ width: 120 }}>Outline colour</span>
                                <select className="form-select form-select-sm w-auto" value={style.logoOutlineColor} onChange={e => set('logoOutlineColor', e.target.value as 'auto' | 'light' | 'dark')}>
                                    <option value="auto">auto</option>
                                    <option value="light">light</option>
                                    <option value="dark">dark</option>
                                </select>
                            </div>
                            {slider('Outline opacity', 'logoOutlineOpacity', 0, 1, 0.01)}
                        </>
                    )}

                    <h6 className="mt-3">Logo lift shadow</h6>
                    {slider('Offset X', 'logoShadowX', -10, 10, 0.5)}
                    {slider('Offset Y', 'logoShadowY', -10, 10, 0.5)}
                    {slider('Blur', 'logoShadowBlur', 0, 12, 0.5)}
                    {slider('Opacity', 'logoShadowOpacity', 0, 1, 0.01)}
                    {style.logoMode === 'classic' && slider('Contact shadow', 'logoContactShadow', 0, 1, 0.01)}
                    {slider('Lift', 'logoLift', 0, 6, 0.5)}

                    <h6 className="mt-3">Textile (rhombus weave)</h6>
                    {slider('Rhombus size', 'rhombusSize', 1, 20, 0.5)}
                    {slider('Spacing', 'rhombusSpacing', 0, 16, 0.5)}
                    {slider('Opacity', 'rhombusOpacity', 0, 1, 0.01)}
                    <div className="small d-flex gap-2 align-items-center">
                        <span style={{ width: 120 }}>Rhombus colour</span>
                        <select className="form-select form-select-sm w-auto" value={style.rhombusColor} onChange={e => set('rhombusColor', e.target.value as 'dark' | 'light')}>
                            <option value="dark">dark</option>
                            <option value="light">light</option>
                        </select>
                    </div>

                    <h6 className="mt-3">Stitch</h6>
                    {slider('Inset', 'stitchInset', 2, 30)}
                    {slider('Width', 'stitchWidth', 0.5, 6, 0.1)}
                    <div className="small d-flex gap-2 align-items-center">
                        <span style={{ width: 120 }}>Style</span>
                        <select className="form-select form-select-sm w-auto" value={style.stitchStyle} onChange={e => set('stitchStyle', e.target.value as 'dashed' | 'solid')}>
                            <option value="dashed">dashed</option>
                            <option value="solid">solid</option>
                        </select>
                    </div>
                    {style.stitchStyle === 'dashed' && slider('Dash', 'stitchDash', 1, 20, 0.5)}
                    {style.stitchStyle === 'dashed' && slider('Gap', 'stitchGap', 1, 20, 0.5)}
                    {slider('Opacity', 'stitchOpacity', 0, 1, 0.01)}
                    {toggle('Stitch shadow', 'stitchShadow')}

                    <h6 className="mt-3">Edge wear</h6>
                    <div className="small d-flex gap-2 align-items-center">
                        <span style={{ width: 120 }}>Mode</span>
                        <select className="form-select form-select-sm w-auto" value={style.edgeWear} onChange={e => set('edgeWear', e.target.value as 'none' | 'fade' | 'grain' | 'both')}>
                            <option value="none">none</option>
                            <option value="fade">fade</option>
                            <option value="grain">grain</option>
                            <option value="both">both</option>
                        </select>
                        <button className="btn btn-sm btn-outline-secondary" onClick={() => setWearSeed(randomWearSeed())}>
                            Randomize wear
                        </button>
                    </div>

                    <h6 className="mt-3">Inner shadow line</h6>
                    {toggle('Enabled', 'innerShadow')}
                    {slider('Gap from stitch', 'innerShadowGap', 0, 6, 0.5)}
                    {slider('Width', 'innerShadowWidth', 0.5, 8, 0.5)}
                    {slider('Opacity', 'innerShadowOpacity', 0, 1, 0.01)}
                    {slider('Blur', 'innerShadowBlur', 0, 4, 0.1)}

                    <h6 className="mt-3">Sold</h6>
                    {slider('Grey min', 'soldGreyMin', 0, 1, 0.01)}
                    {slider('Grey max', 'soldGreyMax', 0, 1, 0.01)}
                    {toggle('Keep background colour', 'soldKeepColor')}
                    {slider('Ring shade', 'soldRingShade', -1, 1, 0.01)}
                    {slider('Silhouette shade', 'soldSilhouetteShade', -1, 1, 0.01)}
                    {toggle('Keep weave', 'soldKeepWeave')}

                    <details className="mt-3">
                        <summary className="small">Import / export style</summary>
                        <div className="mt-2">
                            <textarea
                                className="form-control form-control-sm font-monospace w-100"
                                rows={12}
                                value={importExportText}
                                onChange={e => setImportExportText(e.target.value)}
                            />
                            <div className="d-flex gap-2 mt-2">
                                <button className="btn btn-sm btn-outline-secondary" onClick={handleExport}>Export</button>
                                <button className="btn btn-sm btn-outline-secondary" onClick={handleImport}>Import</button>
                            </div>
                            {ieStatus && (
                                <div className={`small mt-1 ${ieStatus.error ? 'text-danger' : 'text-secondary'}`}>{ieStatus.text}</div>
                            )}
                        </div>
                    </details>
                </div>

                <div className="col-lg-8">
                    <div className="d-flex flex-wrap gap-4 align-items-start p-4 rounded"
                         style={{ background: 'radial-gradient(circle at 50% 30%, #2f7d32 0%, #1f5a22 60%, #163f18 100%)' }}>
                        {/* sport-style-board-plan.md §4.2/§6: one shared factor via scalePatchStyle rather than
                            this preview's old per-field factors (rhombus at 0.7 while radius/stitchInset used
                            0.55, etc.) — an accepted simplification, proportions shift slightly from before.
                            R1 fix 3: each preview renders inside its own visible footprint (dashed outline,
                            turf-green background) at PATCH_REFERENCE_SIZE / ×0.55 / ×2, patch centred in it, so
                            the Padding slider's effect is visible. */}
                        {[
                            { footprint: PATCH_REFERENCE_SIZE, wear: mainWear },
                            { footprint: PATCH_REFERENCE_SIZE * 0.55, wear: smallWear },
                            { footprint: PATCH_REFERENCE_SIZE * 2, wear: largeWear },
                        ].map(({ footprint, wear }, i) => {
                            const patchSize = Math.max(1, patchSizeFor(footprint, style.padding))
                            const scaled = scalePatchStyle({ ...style, ...wear }, patchSize / PATCH_REFERENCE_SIZE)
                            return (
                                <div key={i} className="d-flex align-items-center justify-content-center" style={{
                                    width: footprint, height: footprint, background: FOOTPRINT_BG,
                                    border: FOOTPRINT_OUTLINE, boxSizing: 'border-box',
                                }}>
                                    <PatchCell background={background} stitch={stitch} logoSrc={teamSrc(team)} style={scaled} size={patchSize} sold={sold} edgeTier={edgeTierProp} />
                                </div>
                            )
                        })}
                    </div>

                    <div className="d-flex gap-3 align-items-center mt-3">
                        <div className="form-check">
                            <input className="form-check-input" type="checkbox" id="showAll" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="showAll">Show all 32 teams with auto colours</label>
                        </div>
                        {showAll && (
                            <div className="form-check">
                                <input className="form-check-input" type="checkbox" id="tieredDemo" checked={tieredDemo} onChange={e => setTieredDemo(e.target.checked)} />
                                <label className="form-check-label small" htmlFor="tieredDemo">Tiered demo (best/good/mid/regular)</label>
                            </div>
                        )}
                        {showAll && (
                            <label className="d-flex align-items-center gap-2 small">
                                <span>Sold count</span>
                                <input type="range" className="form-range" style={{ width: 120 }} min={0} max={32} step={1}
                                       value={soldCount}
                                       onChange={e => setSoldCount(parseInt(e.target.value, 10))} />
                                <span style={{ width: 24, textAlign: 'right' }}>{soldCount}</span>
                            </label>
                        )}
                    </div>
                    {showAll && (
                        <div className="d-flex flex-wrap gap-3 mt-3 p-3 rounded"
                             style={{ background: 'radial-gradient(circle at 50% 30%, #2f7d32 0%, #1f5a22 60%, #163f18 100%)' }}>
                            {Teams.map((t, i) => {
                                const p = allPalettes[t]
                                if (!p) return null
                                const pBackground = mixEnabled ? mix(p.background, p.secondary, mixRatio) : p.background
                                const pStitch = resolveStitch(stitchMode, p.candidates, pBackground, { minContrast: stitchMinContrast, minLuminance: stitchMinLuminance })
                                // R1 fix 3: footprint 110, same padding rule as the three previews above.
                                const gridFootprint = 110
                                const gridPatchSize = Math.max(1, patchSizeFor(gridFootprint, style.padding))
                                const gridWear = wearParamsFor(wearSeed, t)
                                return (
                                    <div key={t} className="d-flex align-items-center justify-content-center" style={{
                                        width: gridFootprint, height: gridFootprint, background: FOOTPRINT_BG,
                                        border: FOOTPRINT_OUTLINE, boxSizing: 'border-box',
                                    }}>
                                        <PatchCell background={pBackground} stitch={pStitch} logoSrc={teamSrc(t)}
                                                  style={scalePatchStyle({ ...style, ...gridWear }, gridPatchSize / PATCH_REFERENCE_SIZE)}
                                                  size={gridPatchSize}
                                                  sold={i < soldCount}
                                                  edgeTier={tieredDemo ? DEMO_EDGE_TIERS[i % 4] : undefined} />
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
