'use client'

// football-field-board-plan.md §4/§5.1 — standalone tuning page for the `board:cobra_flat`
// football-field lines (plan §3), now living at /obs/setup/sport_style/board. Modelled on
// src/app/obs/setup/sport_style/team/page.tsx: client component, knobs persisted to localStorage via a try/catch
//
// sport-style-board-plan.md §1/§6: fieldGeometry.ts and turfTexture.ts are the shared, "load-bearing
// for the stream" modules now imported from src/app/obs/sport_style/ (also used verbatim by the
// board:sport_style layout element) — this page still owns nothing but the knobs/UI around them.
// loader, a mock grid of team logos in place of real event data. This page never touches
// obs/layout/elements/board-cobra-flat/ — it exists so the geometry (fieldGeometry.ts) and the
// constants (lineW/tickH/ticksPerColumn/edgeGap/opacity) can be settled BEFORE they're ported
// there in a later step (plan §5.3).
//
// Layer order (v3): clip group A — the turf canvas only, clipped to the oval field — sits at the
// bottom; the mock cell grid (opaque, unclipped by the oval) is painted next; clip group B — the
// white column/row strips, the hash ticks confined to the edge-gap band above the first row/below
// the last row, and the interior-row-seam ticks — is painted above the cells, clipped to the same
// oval; the field border is painted last, above everything. Every geometric value comes from
// fieldGeometry.ts — nothing here is measured from the DOM, so cells and lines can't drift apart on
// this page any more than they could on the real board.

import {useEffect, useMemo, useRef, useState, type ChangeEvent} from 'react'
import {Teams, TeamIconSrc} from '@/app/common/teams'
import {fieldGeometry, type FieldInput} from '@/app/obs/sport_style/fieldGeometry'
import {renderTurf, type TurfParams} from '@/app/obs/sport_style/turfTexture'
import './page.css'

const STORAGE_KEY = 'test-board-field-v9'

const DEFAULTS = {
    boxW: 1080,
    boxH: 440,
    rows: 4,
    cols: 10,
    edgeGap: 60,
    lineWFactor: 0.035,
    tickHFactor: 0.14,
    seamTickHFactor: 0.14,
    sameAsLine: true,
    tickWOverride: 4,
    ticksPerColumn: 4,
    ticksAreaHeight: 36,
    turfMargin: 0,
    opacity: 0.85,
    soldCount: 6,
    showStrips: true,
    showTicks: true,
    seamTicks: true,
    cornerWidth: 120,
    cornerRoundness: 1,
    borderWidth: 6,
    turfEnabled: true,
    turfDark: '#1e3a08',
    turfLight: '#8fb457',
    turfBaseLum: 0.55,
    turfStripeStrength: 0.08,
    turfStripePeriod: 1 as 1 | 2,
    turfPatchScale: 1,
    turfPatchContrast: 0.25,
    turfOctaves: 3,
    turfAnisotropy: 1.5,
    turfGrainStrength: 0.03,
    turfSpotCount: 18,
    turfSpotRadiusMin: 0.6,
    turfSpotRadiusMax: 2.0,
    turfSpotStrength: 0.18,
    turfSpotLightRatio: 0.6,
}

type SavedState = typeof DEFAULTS

const PRESETS: Array<{label: string; w: number; h: number}> = [
    {label: '1080 × 340 (COBRA_FLAT_BOX)', w: 1080, h: 340},
    {label: '1080 × 600', w: 1080, h: 600},
]

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
    return TeamIconSrc(team)
}

// sport-style-board-plan.md R2.1: elliptical-corner radii for `field`, both whole px, guarded
// against a zero-sized field.
function fieldCornerRadii(fieldW: number, fieldH: number, cornerWidth: number, cornerRoundness: number): {rx: number; ry: number} {
    const rx = fieldW > 0 ? Math.min(cornerWidth, Math.floor(fieldW / 2)) : 0
    const ry = fieldH > 0 ? Math.min(Math.round((cornerRoundness * fieldH) / 2), Math.floor(fieldH / 2)) : 0
    return {rx, ry}
}

// R2.2: `inset(top right bottom left round rx / ry)`, `field` expressed as offsets from each edge
// of the `boxW × boxH` reference box.
function fieldClipPath(field: {x: number; y: number; w: number; h: number}, boxW: number, boxH: number, rx: number, ry: number): string {
    const top = field.y
    const right = boxW - (field.x + field.w)
    const bottom = boxH - (field.y + field.h)
    const left = field.x
    return `inset(${top}px ${right}px ${bottom}px ${left}px round ${rx}px / ${ry}px)`
}

export default function Page() {
    const saved = loadSaved()
    const [boxW, setBoxW] = useState<number>(() => saved.boxW ?? DEFAULTS.boxW)
    const [boxH, setBoxH] = useState<number>(() => saved.boxH ?? DEFAULTS.boxH)
    const [rows, setRows] = useState<number>(() => saved.rows ?? DEFAULTS.rows)
    const [cols, setCols] = useState<number>(() => saved.cols ?? DEFAULTS.cols)
    const [edgeGap, setEdgeGap] = useState<number>(() => saved.edgeGap ?? DEFAULTS.edgeGap)
    const [lineWFactor, setLineWFactor] = useState<number>(() => saved.lineWFactor ?? DEFAULTS.lineWFactor)
    const [tickHFactor, setTickHFactor] = useState<number>(() => saved.tickHFactor ?? DEFAULTS.tickHFactor)
    const [seamTickHFactor, setSeamTickHFactor] = useState<number>(() => saved.seamTickHFactor ?? DEFAULTS.seamTickHFactor)
    const [sameAsLine, setSameAsLine] = useState<boolean>(() => saved.sameAsLine ?? DEFAULTS.sameAsLine)
    const [tickWOverride, setTickWOverride] = useState<number>(() => saved.tickWOverride ?? DEFAULTS.tickWOverride)
    const [ticksPerColumn, setTicksPerColumn] = useState<number>(() => saved.ticksPerColumn ?? DEFAULTS.ticksPerColumn)
    const [ticksAreaHeight, setTicksAreaHeight] = useState<number>(() => saved.ticksAreaHeight ?? DEFAULTS.ticksAreaHeight)
    const [turfMargin, setTurfMargin] = useState<number>(() => saved.turfMargin ?? DEFAULTS.turfMargin)
    const [opacity, setOpacity] = useState<number>(() => saved.opacity ?? DEFAULTS.opacity)
    const [soldCount, setSoldCount] = useState<number>(() => saved.soldCount ?? DEFAULTS.soldCount)
    const [showStrips, setShowStrips] = useState<boolean>(() => saved.showStrips ?? DEFAULTS.showStrips)
    const [showTicks, setShowTicks] = useState<boolean>(() => saved.showTicks ?? DEFAULTS.showTicks)
    // Recipe knob (unlike `showStrips`/`showTicks` above, which are page-only display toggles not
    // part of the turf recipe): whether the interior-row-seam hash ticks render at all.
    const [seamTicks, setSeamTicks] = useState<boolean>(() => saved.seamTicks ?? DEFAULTS.seamTicks)

    // Field shape (sport-style-board-plan.md R2.1) — elliptical corners on the painted field.
    const [cornerWidth, setCornerWidth] = useState<number>(() => saved.cornerWidth ?? DEFAULTS.cornerWidth)
    const [cornerRoundness, setCornerRoundness] = useState<number>(() => saved.cornerRoundness ?? DEFAULTS.cornerRoundness)
    const [borderWidth, setBorderWidth] = useState<number>(() => saved.borderWidth ?? DEFAULTS.borderWidth)

    const [turfEnabled, setTurfEnabled] = useState<boolean>(() => saved.turfEnabled ?? DEFAULTS.turfEnabled)
    const [turfDark, setTurfDark] = useState<string>(() => saved.turfDark ?? DEFAULTS.turfDark)
    const [turfLight, setTurfLight] = useState<string>(() => saved.turfLight ?? DEFAULTS.turfLight)
    const [turfBaseLum, setTurfBaseLum] = useState<number>(() => saved.turfBaseLum ?? DEFAULTS.turfBaseLum)
    const [turfStripeStrength, setTurfStripeStrength] = useState<number>(() => saved.turfStripeStrength ?? DEFAULTS.turfStripeStrength)
    const [turfStripePeriod, setTurfStripePeriod] = useState<1 | 2>(() => saved.turfStripePeriod ?? DEFAULTS.turfStripePeriod)
    const [turfPatchScale, setTurfPatchScale] = useState<number>(() => saved.turfPatchScale ?? DEFAULTS.turfPatchScale)
    const [turfPatchContrast, setTurfPatchContrast] = useState<number>(() => saved.turfPatchContrast ?? DEFAULTS.turfPatchContrast)
    const [turfOctaves, setTurfOctaves] = useState<number>(() => saved.turfOctaves ?? DEFAULTS.turfOctaves)
    const [turfAnisotropy, setTurfAnisotropy] = useState<number>(() => saved.turfAnisotropy ?? DEFAULTS.turfAnisotropy)
    const [turfGrainStrength, setTurfGrainStrength] = useState<number>(() => saved.turfGrainStrength ?? DEFAULTS.turfGrainStrength)
    const [turfSpotCount, setTurfSpotCount] = useState<number>(() => saved.turfSpotCount ?? DEFAULTS.turfSpotCount)
    const [turfSpotRadiusMin, setTurfSpotRadiusMin] = useState<number>(() => saved.turfSpotRadiusMin ?? DEFAULTS.turfSpotRadiusMin)
    const [turfSpotRadiusMax, setTurfSpotRadiusMax] = useState<number>(() => saved.turfSpotRadiusMax ?? DEFAULTS.turfSpotRadiusMax)
    const [turfSpotStrength, setTurfSpotStrength] = useState<number>(() => saved.turfSpotStrength ?? DEFAULTS.turfSpotStrength)
    const [turfSpotLightRatio, setTurfSpotLightRatio] = useState<number>(() => saved.turfSpotLightRatio ?? DEFAULTS.turfSpotLightRatio)

    // Seed is deliberately NOT persisted/loaded from `saved` — the spec wants a fresh random seed
    // on every (re)generation, only ever surfaced in the read-out so a liked look can be quoted.
    const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 2 ** 31))
    const [renderMs, setRenderMs] = useState<number>(0)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    // Saved state lives in localStorage, so the client's first render can differ from the server's.
    // Render nothing until mounted to avoid hydration mismatches (same guard as obs/setup/sport_style/team/page.tsx).
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                boxW, boxH, rows, cols, edgeGap, lineWFactor, tickHFactor, seamTickHFactor,
                sameAsLine, tickWOverride, ticksPerColumn, ticksAreaHeight, turfMargin, opacity, soldCount, showStrips, showTicks, seamTicks,
                cornerWidth, cornerRoundness, borderWidth,
                turfEnabled, turfDark, turfLight, turfBaseLum, turfStripeStrength, turfStripePeriod, turfPatchScale,
                turfPatchContrast, turfOctaves, turfAnisotropy, turfGrainStrength,
                turfSpotCount, turfSpotRadiusMin, turfSpotRadiusMax, turfSpotStrength, turfSpotLightRatio,
            }))
        } catch {
            // ignore storage errors
        }
    }, [boxW, boxH, rows, cols, edgeGap, lineWFactor, tickHFactor, seamTickHFactor, sameAsLine, tickWOverride, ticksPerColumn, ticksAreaHeight, turfMargin, opacity, soldCount, showStrips, showTicks, seamTicks,
        cornerWidth, cornerRoundness, borderWidth,
        turfEnabled, turfDark, turfLight, turfBaseLum, turfStripeStrength, turfStripePeriod, turfPatchScale, turfPatchContrast, turfOctaves, turfAnisotropy, turfGrainStrength,
        turfSpotCount, turfSpotRadiusMin, turfSpotRadiusMax, turfSpotStrength, turfSpotLightRatio])

    // Seed regenerates automatically whenever a turf knob OR the geometry (box size, rows, cols,
    // edge gap) changes — but not on the very first render, which already picked a random seed
    // above. The explicit "Regenerate" button below calls setSeed directly and is unaffected by
    // this effect (seed is not one of its dependencies).
    const isFirstRun = useRef(true)
    // Set to true for exactly one render by applySettings() (the settings-panel Import), so a
    // pasted recipe's own `seed` sticks instead of being re-rolled by this effect — the one case
    // where a turf-knob change must NOT randomise the seed.
    const suppressSeedReroll = useRef(false)
    useEffect(() => {
        if (isFirstRun.current) {
            isFirstRun.current = false
            return
        }
        if (suppressSeedReroll.current) {
            suppressSeedReroll.current = false
            return
        }
        setSeed(Math.floor(Math.random() * 2 ** 31))
    }, [boxW, boxH, rows, cols, edgeGap, turfEnabled, turfDark, turfLight, turfBaseLum, turfStripeStrength, turfStripePeriod,
        turfPatchScale, turfPatchContrast, turfOctaves, turfAnisotropy, turfGrainStrength,
        turfSpotCount, turfSpotRadiusMin, turfSpotRadiusMax, turfSpotStrength, turfSpotLightRatio])

    // ── Settings import/export panel (turf recipe only — line/geometry knobs are not part of it).
    // Keys match `TurfParams` exactly, plus `enabled` (page-only today, but the field these knobs
    // are destined for once ported) and `seed` (needed to reproduce the exact same field).
    const turfExport = useMemo(() => ({
        enabled: turfEnabled,
        edgeGap,
        ticksAreaHeight,
        turfMargin,
        tickHFactor,
        seamTickHFactor,
        seamTicks,
        cornerWidth,
        cornerRoundness,
        borderWidth,
        dark: turfDark,
        light: turfLight,
        baseLum: turfBaseLum,
        stripeStrength: turfStripeStrength,
        stripePeriod: turfStripePeriod,
        patchScale: turfPatchScale,
        patchContrast: turfPatchContrast,
        octaves: turfOctaves,
        anisotropy: turfAnisotropy,
        grainStrength: turfGrainStrength,
        spotCount: turfSpotCount,
        spotRadiusMin: turfSpotRadiusMin,
        spotRadiusMax: turfSpotRadiusMax,
        spotStrength: turfSpotStrength,
        spotLightRatio: turfSpotLightRatio,
        seed,
    }), [turfEnabled, edgeGap, ticksAreaHeight, turfMargin, tickHFactor, seamTickHFactor, seamTicks, cornerWidth, cornerRoundness, borderWidth, turfDark, turfLight, turfBaseLum, turfStripeStrength, turfStripePeriod, turfPatchScale,
        turfPatchContrast, turfOctaves, turfAnisotropy, turfGrainStrength, turfSpotCount, turfSpotRadiusMin,
        turfSpotRadiusMax, turfSpotStrength, turfSpotLightRatio, seed])

    const generatedSettingsText = useMemo(() => JSON.stringify(turfExport, null, 2), [turfExport])

    const [settingsText, setSettingsText] = useState<string>(generatedSettingsText)
    // `focused` covers "the textarea has focus"; `edited` covers "the user typed something that
    // hasn't been applied or confirmed unchanged yet" — set on every keystroke, cleared on Apply or
    // on a blur where the text still matches the generated export. Either one true means "don't
    // clobber what's on screen" (spec: "focused / text differs from the generated export").
    const [focused, setFocused] = useState(false)
    const [edited, setEdited] = useState(false)
    const [settingsError, setSettingsError] = useState<string | null>(null)
    const [copyFeedback, setCopyFeedback] = useState(false)
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const settingsDirty = focused || edited

    // Re-render the textarea from state whenever the export changes (export direction) — but only
    // while the user isn't actively holding unsynced edits (see `settingsDirty` above).
    useEffect(() => {
        if (!settingsDirty) {
            setSettingsText(generatedSettingsText)
        }
    }, [generatedSettingsText, settingsDirty])

    const onSettingsChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
        setSettingsText(e.target.value)
        setEdited(true)
        setSettingsError(null)
    }

    const onSettingsBlur = () => {
        setFocused(false)
        if (settingsText === generatedSettingsText) {
            setEdited(false)
        }
    }

    const applySettings = () => {
        let parsed: unknown
        try {
            parsed = JSON.parse(settingsText)
        } catch (err) {
            setSettingsError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
            return
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            setSettingsError('JSON must be an object')
            return
        }
        const obj = parsed as Record<string, unknown>

        const num = (key: string, min: number, max: number, current: number): number => {
            const v = obj[key]
            return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : current
        }
        const bool = (key: string, current: boolean): boolean => {
            const v = obj[key]
            return typeof v === 'boolean' ? v : current
        }
        const hexColor = (key: string, current: string): string => {
            const v = obj[key]
            return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : current
        }

        const nextEnabled = bool('enabled', turfEnabled)
        const nextEdgeGap = Math.round(num('edgeGap', 0, 120, edgeGap))
        const nextTicksAreaHeight = Math.round(num('ticksAreaHeight', 0, 120, ticksAreaHeight))
        const nextTurfMargin = Math.round(num('turfMargin', 0, 120, turfMargin))
        const nextTickHFactor = num('tickHFactor', 0.05, 0.3, tickHFactor)
        const nextSeamTickHFactor = num('seamTickHFactor', 0.05, 0.5, seamTickHFactor)
        const nextSeamTicks = bool('seamTicks', seamTicks)
        const nextCornerWidth = Math.round(num('cornerWidth', 0, 540, cornerWidth))
        const nextCornerRoundness = num('cornerRoundness', 0, 1, cornerRoundness)
        const nextBorderWidth = Math.round(num('borderWidth', 0, 24, borderWidth))
        const nextDark = hexColor('dark', turfDark)
        const nextLight = hexColor('light', turfLight)
        const nextBaseLum = num('baseLum', 0.2, 1, turfBaseLum)
        const nextStripeStrength = num('stripeStrength', 0, 0.3, turfStripeStrength)
        const rawStripePeriod = obj['stripePeriod']
        const nextStripePeriod: 1 | 2 = rawStripePeriod === 1 || rawStripePeriod === 2 ? rawStripePeriod : turfStripePeriod
        const nextPatchScale = num('patchScale', Math.pow(10, -2), Math.pow(10, 0.477), turfPatchScale)
        const nextPatchContrast = num('patchContrast', 0, 1, turfPatchContrast)
        const nextOctaves = Math.round(num('octaves', 1, 4, turfOctaves))
        const nextAnisotropy = num('anisotropy', 0.5, 3, turfAnisotropy)
        const nextGrainStrength = num('grainStrength', 0, 0.6, turfGrainStrength)
        const nextSpotCount = Math.round(num('spotCount', 0, 60, turfSpotCount))
        const nextSpotRadiusMin = num('spotRadiusMin', 0.2, 4, turfSpotRadiusMin)
        const nextSpotRadiusMax = num('spotRadiusMax', 0.2, 4, turfSpotRadiusMax)
        const nextSpotStrength = num('spotStrength', 0, 0.6, turfSpotStrength)
        const nextSpotLightRatio = num('spotLightRatio', 0, 1, turfSpotLightRatio)
        const rawSeed = obj['seed']
        const nextSeed = typeof rawSeed === 'number' && Number.isFinite(rawSeed) ? Math.floor(rawSeed) : seed

        // One batch: React 18 coalesces all of these into a single re-render, so the seed-reroll
        // effect above sees every dependency change exactly once and — because the flag below is
        // already set before that render happens — skips its own re-roll for it.
        suppressSeedReroll.current = true
        setTurfEnabled(nextEnabled)
        setEdgeGap(nextEdgeGap)
        setTicksAreaHeight(nextTicksAreaHeight)
        setTurfMargin(nextTurfMargin)
        setTickHFactor(nextTickHFactor)
        setSeamTickHFactor(nextSeamTickHFactor)
        setSeamTicks(nextSeamTicks)
        setCornerWidth(nextCornerWidth)
        setCornerRoundness(nextCornerRoundness)
        setBorderWidth(nextBorderWidth)
        setTurfDark(nextDark)
        setTurfLight(nextLight)
        setTurfBaseLum(nextBaseLum)
        setTurfStripeStrength(nextStripeStrength)
        setTurfStripePeriod(nextStripePeriod)
        setTurfPatchScale(nextPatchScale)
        setTurfPatchContrast(nextPatchContrast)
        setTurfOctaves(nextOctaves)
        setTurfAnisotropy(nextAnisotropy)
        setTurfGrainStrength(nextGrainStrength)
        setTurfSpotCount(nextSpotCount)
        setTurfSpotRadiusMin(nextSpotRadiusMin)
        setTurfSpotRadiusMax(nextSpotRadiusMax)
        setTurfSpotStrength(nextSpotStrength)
        setTurfSpotLightRatio(nextSpotLightRatio)
        setSeed(nextSeed)

        setSettingsText(JSON.stringify({
            enabled: nextEnabled, edgeGap: nextEdgeGap, ticksAreaHeight: nextTicksAreaHeight, turfMargin: nextTurfMargin, tickHFactor: nextTickHFactor,
            seamTickHFactor: nextSeamTickHFactor,
            seamTicks: nextSeamTicks,
            cornerWidth: nextCornerWidth, cornerRoundness: nextCornerRoundness, borderWidth: nextBorderWidth,
            dark: nextDark, light: nextLight, baseLum: nextBaseLum,
            stripeStrength: nextStripeStrength, stripePeriod: nextStripePeriod, patchScale: nextPatchScale,
            patchContrast: nextPatchContrast, octaves: nextOctaves, anisotropy: nextAnisotropy,
            grainStrength: nextGrainStrength, spotCount: nextSpotCount, spotRadiusMin: nextSpotRadiusMin,
            spotRadiusMax: nextSpotRadiusMax, spotStrength: nextSpotStrength, spotLightRatio: nextSpotLightRatio,
            seed: nextSeed,
        }, null, 2))
        setEdited(false)
        setFocused(false)
        setSettingsError(null)
    }

    const copySettings = async () => {
        try {
            await navigator.clipboard.writeText(settingsText)
            setCopyFeedback(true)
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
            copyTimeoutRef.current = setTimeout(() => setCopyFeedback(false), 1500)
        } catch {
            // clipboard API can throw (permissions, insecure context, etc.) — nothing to recover,
            // just skip the "Copied" feedback.
        }
    }

    const reset = () => {
        try {
            localStorage.removeItem(STORAGE_KEY)
        } catch {
            // ignore storage errors
        }
        setBoxW(DEFAULTS.boxW)
        setBoxH(DEFAULTS.boxH)
        setRows(DEFAULTS.rows)
        setCols(DEFAULTS.cols)
        setEdgeGap(DEFAULTS.edgeGap)
        setLineWFactor(DEFAULTS.lineWFactor)
        setTickHFactor(DEFAULTS.tickHFactor)
        setSeamTickHFactor(DEFAULTS.seamTickHFactor)
        setSameAsLine(DEFAULTS.sameAsLine)
        setTickWOverride(DEFAULTS.tickWOverride)
        setTicksPerColumn(DEFAULTS.ticksPerColumn)
        setTicksAreaHeight(DEFAULTS.ticksAreaHeight)
        setTurfMargin(DEFAULTS.turfMargin)
        setOpacity(DEFAULTS.opacity)
        setSoldCount(DEFAULTS.soldCount)
        setShowStrips(DEFAULTS.showStrips)
        setShowTicks(DEFAULTS.showTicks)
        setSeamTicks(DEFAULTS.seamTicks)
        setCornerWidth(DEFAULTS.cornerWidth)
        setCornerRoundness(DEFAULTS.cornerRoundness)
        setBorderWidth(DEFAULTS.borderWidth)
        setTurfEnabled(DEFAULTS.turfEnabled)
        setTurfDark(DEFAULTS.turfDark)
        setTurfLight(DEFAULTS.turfLight)
        setTurfBaseLum(DEFAULTS.turfBaseLum)
        setTurfStripeStrength(DEFAULTS.turfStripeStrength)
        setTurfStripePeriod(DEFAULTS.turfStripePeriod)
        setTurfPatchScale(DEFAULTS.turfPatchScale)
        setTurfPatchContrast(DEFAULTS.turfPatchContrast)
        setTurfOctaves(DEFAULTS.turfOctaves)
        setTurfAnisotropy(DEFAULTS.turfAnisotropy)
        setTurfGrainStrength(DEFAULTS.turfGrainStrength)
        setTurfSpotCount(DEFAULTS.turfSpotCount)
        setTurfSpotRadiusMin(DEFAULTS.turfSpotRadiusMin)
        setTurfSpotRadiusMax(DEFAULTS.turfSpotRadiusMax)
        setTurfSpotStrength(DEFAULTS.turfSpotStrength)
        setTurfSpotLightRatio(DEFAULTS.turfSpotLightRatio)
    }

    // tickW defaults to "same as line": probe fieldGeometry once to get lineW (tickW has no effect
    // on lineW/strips, so the value passed in this probe call is irrelevant), then feed the real
    // tickW into the geometry actually rendered.
    const base: Omit<FieldInput, 'tickW'> = {
        boxW, boxH, cols, rows, edgeGap, lineWFactor, tickHFactor, seamTickHFactor, ticksPerColumn, ticksAreaHeight, turfMargin,
    }
    const lineWProbe = fieldGeometry({...base, tickW: 1}).lineW
    const tickW = sameAsLine ? lineWProbe : tickWOverride
    const geometry = fieldGeometry({...base, tickW})

    const cellCount = rows * cols
    const clampedSoldCount = Math.min(soldCount, cellCount)
    const lineColor = `rgba(255,255,255,${opacity})`

    // R2.1/R2.2: oval-field shape, computed from the same `geometry.field` the strips/ticks/canvas
    // already use — the radii and clip path are identical for the playground and the element.
    const {rx: fieldRx, ry: fieldRy} = fieldCornerRadii(geometry.field.w, geometry.field.h, cornerWidth, cornerRoundness)
    const fieldClip = fieldClipPath(geometry.field, boxW, boxH, fieldRx, fieldRy)

    // Turf draw pass — keyed on every turf knob plus the geometry it depends on (cellPx/gridLeft)
    // and the seed, so a fresh render happens exactly when any of those change (turfTexture.ts does
    // all the actual work; this effect only times it and hands the canvas to it).
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        if (!turfEnabled) {
            ctx.clearRect(0, 0, boxW, boxH)
            setRenderMs(0)
            return
        }
        const params: TurfParams = {
            dark: turfDark,
            light: turfLight,
            baseLum: turfBaseLum,
            stripeStrength: turfStripeStrength,
            stripePeriod: turfStripePeriod,
            patchScale: turfPatchScale,
            patchContrast: turfPatchContrast,
            octaves: turfOctaves,
            anisotropy: turfAnisotropy,
            grainStrength: turfGrainStrength,
            spotCount: turfSpotCount,
            spotRadiusMin: turfSpotRadiusMin,
            spotRadiusMax: turfSpotRadiusMax,
            spotStrength: turfSpotStrength,
            spotLightRatio: turfSpotLightRatio,
        }
        const t0 = performance.now()
        renderTurf(ctx, {
            width: boxW, height: boxH, cellPx: geometry.cellPx, gridLeft: geometry.gridLeft, cols, seed, params,
            field: geometry.field,
        })
        const t1 = performance.now()
        setRenderMs(t1 - t0)
        // `geometry.field` is a fresh object every render (fieldGeometry() returns a new one each
        // call); depending on the object itself would re-run this effect on every render regardless
        // of value, so its four primitive members are listed below instead — same trick already
        // used for `geometry.cellPx`/`geometry.gridLeft`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boxW, boxH, geometry.cellPx, geometry.gridLeft, geometry.field.x, geometry.field.y, geometry.field.w, geometry.field.h,
        cols, seed, turfEnabled, turfDark, turfLight, turfBaseLum,
        turfStripeStrength, turfStripePeriod, turfPatchScale, turfPatchContrast, turfOctaves, turfAnisotropy, turfGrainStrength,
        turfSpotCount, turfSpotRadiusMin, turfSpotRadiusMax, turfSpotStrength, turfSpotLightRatio])

    if (!mounted) return null

    return (
        <div className="field-page container-fluid p-3">
            <h4>Football-field board lines playground (/obs/setup/sport_style/board)</h4>
            <div className="row g-4">
                <div className="col-lg-4">
                    <div className="mb-3 d-flex gap-2 align-items-end flex-wrap">
                        <label className="small">
                            Box W
                            <input type="number" className="form-control form-control-sm" style={{width: 90}}
                                   value={boxW} onChange={e => setBoxW(parseInt(e.target.value) || 0)} />
                        </label>
                        <label className="small">
                            Box H
                            <input type="number" className="form-control form-control-sm" style={{width: 90}}
                                   value={boxH} onChange={e => setBoxH(parseInt(e.target.value) || 0)} />
                        </label>
                    </div>
                    <div className="mb-3 d-flex gap-2 flex-wrap">
                        {PRESETS.map(p => (
                            <button key={p.label} className="btn btn-sm btn-outline-secondary"
                                    onClick={() => { setBoxW(p.w); setBoxH(p.h) }}>
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Rows</span>
                        <input type="range" className="form-range" min={1} max={4} step={1}
                               value={rows} onChange={e => setRows(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{rows}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Cols</span>
                        <input type="range" className="form-range" min={8} max={11} step={1}
                               value={cols} onChange={e => setCols(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{cols}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Line width factor</span>
                        <input type="range" className="form-range" min={0.01} max={0.08} step={0.001}
                               value={lineWFactor} onChange={e => setLineWFactor(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{lineWFactor.toFixed(3)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Edge gap (px)</span>
                        <input type="range" className="form-range" min={0} max={120} step={1}
                               value={edgeGap} onChange={e => setEdgeGap(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{edgeGap}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Tick height factor</span>
                        <input type="range" className="form-range" min={0.05} max={0.3} step={0.005}
                               value={tickHFactor} onChange={e => setTickHFactor(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{tickHFactor.toFixed(3)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Seam tick height factor</span>
                        <input type="range" className="form-range" min={0.05} max={0.5} step={0.005}
                               value={seamTickHFactor} onChange={e => setSeamTickHFactor(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{seamTickHFactor.toFixed(3)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <div className="form-check">
                            <input className="form-check-input" type="checkbox" id="sameAsLine" checked={sameAsLine}
                                   onChange={e => setSameAsLine(e.target.checked)} />
                            <label className="form-check-label" htmlFor="sameAsLine">Tick width = line width</label>
                        </div>
                    </div>
                    {!sameAsLine && (
                        <div className="mb-2 d-flex align-items-center gap-2 small">
                            <span style={{width: 140}}>Tick width (px)</span>
                            <input type="range" className="form-range" min={1} max={8} step={1}
                                   value={tickWOverride} onChange={e => setTickWOverride(parseInt(e.target.value))} />
                            <span style={{width: 30, textAlign: 'right'}}>{tickWOverride}</span>
                        </div>
                    )}
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Ticks per column</span>
                        <input type="range" className="form-range" min={0} max={9} step={1}
                               value={ticksPerColumn} onChange={e => setTicksPerColumn(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{ticksPerColumn}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Ticks area height</span>
                        <input type="range" className="form-range" min={0} max={120} step={1}
                               value={ticksAreaHeight} onChange={e => setTicksAreaHeight(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{ticksAreaHeight}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Turf extra margin</span>
                        <input type="range" className="form-range" min={0} max={120} step={1}
                               value={turfMargin} onChange={e => setTurfMargin(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{turfMargin}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Line opacity</span>
                        <input type="range" className="form-range" min={0.3} max={1} step={0.01}
                               value={opacity} onChange={e => setOpacity(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{opacity.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Sold count</span>
                        <input type="range" className="form-range" min={0} max={cellCount} step={1}
                               value={clampedSoldCount} onChange={e => setSoldCount(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{clampedSoldCount}</span>
                    </div>
                    <div className="mb-3 d-flex gap-3">
                        <div className="form-check">
                            <input className="form-check-input" type="checkbox" id="showStrips" checked={showStrips}
                                   onChange={e => setShowStrips(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="showStrips">Show lines (v+h)</label>
                        </div>
                        <div className="form-check">
                            <input className="form-check-input" type="checkbox" id="showTicks" checked={showTicks}
                                   onChange={e => setShowTicks(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="showTicks">Show ticks</label>
                        </div>
                        <div className="form-check">
                            <input className="form-check-input" type="checkbox" id="seamTicks" checked={seamTicks}
                                   onChange={e => setSeamTicks(e.target.checked)} />
                            <label className="form-check-label small" htmlFor="seamTicks">Seam ticks</label>
                        </div>
                    </div>

                    <hr className="my-3" />
                    <h6>Field shape</h6>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Corners width (px)</span>
                        <input type="range" className="form-range" min={0} max={540} step={1}
                               value={cornerWidth} onChange={e => setCornerWidth(parseInt(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{cornerWidth}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Corners roundness</span>
                        <input type="range" className="form-range" min={0} max={1} step={0.01}
                               value={cornerRoundness} onChange={e => setCornerRoundness(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{cornerRoundness.toFixed(2)}</span>
                    </div>
                    <div className="mb-3 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Border width (px)</span>
                        <input type="range" className="form-range" min={0} max={24} step={1}
                               value={borderWidth} onChange={e => setBorderWidth(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{borderWidth}</span>
                    </div>

                    <hr className="my-3" />
                    <h6>Turf</h6>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <div className="form-check">
                            <input className="form-check-input" type="checkbox" id="turfEnabled" checked={turfEnabled}
                                   onChange={e => setTurfEnabled(e.target.checked)} />
                            <label className="form-check-label" htmlFor="turfEnabled">Enabled</label>
                        </div>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Dark colour</span>
                        <input type="color" className="form-control form-control-color form-control-sm" style={{width: 50}}
                               value={turfDark} onChange={e => setTurfDark(e.target.value)} />
                        <span>{turfDark}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Light colour</span>
                        <input type="color" className="form-control form-control-color form-control-sm" style={{width: 50}}
                               value={turfLight} onChange={e => setTurfLight(e.target.value)} />
                        <span>{turfLight}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Base brightness</span>
                        <input type="range" className="form-range" min={0.2} max={1} step={0.01}
                               value={turfBaseLum} onChange={e => setTurfBaseLum(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfBaseLum.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Stripe strength</span>
                        <input type="range" className="form-range" min={0} max={0.3} step={0.005}
                               value={turfStripeStrength} onChange={e => setTurfStripeStrength(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfStripeStrength.toFixed(3)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Stripe period</span>
                        <div className="btn-group btn-group-sm" role="group">
                            <button type="button"
                                    className={`btn btn-outline-secondary${turfStripePeriod === 1 ? ' active' : ''}`}
                                    onClick={() => setTurfStripePeriod(1)}>1</button>
                            <button type="button"
                                    className={`btn btn-outline-secondary${turfStripePeriod === 2 ? ' active' : ''}`}
                                    onClick={() => setTurfStripePeriod(2)}>2</button>
                        </div>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Patch scale (cells)</span>
                        <input type="range" className="form-range" min={-2} max={0.477} step={0.01}
                               value={Math.log10(turfPatchScale)}
                               onChange={e => setTurfPatchScale(Math.pow(10, parseFloat(e.target.value)))} />
                        <span style={{width: 50, textAlign: 'right'}}>{turfPatchScale.toFixed(3)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Patch contrast</span>
                        <input type="range" className="form-range" min={0} max={1} step={0.01}
                               value={turfPatchContrast} onChange={e => setTurfPatchContrast(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfPatchContrast.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Octaves</span>
                        <input type="range" className="form-range" min={1} max={4} step={1}
                               value={turfOctaves} onChange={e => setTurfOctaves(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{turfOctaves}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Anisotropy</span>
                        <input type="range" className="form-range" min={0.5} max={3} step={0.05}
                               value={turfAnisotropy} onChange={e => setTurfAnisotropy(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfAnisotropy.toFixed(2)}</span>
                    </div>
                    <div className="mb-3 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Grain strength</span>
                        <input type="range" className="form-range" min={0} max={0.6} step={0.005}
                               value={turfGrainStrength} onChange={e => setTurfGrainStrength(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfGrainStrength.toFixed(3)}</span>
                    </div>

                    <h6 className="mt-3">Spots</h6>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Spot count</span>
                        <input type="range" className="form-range" min={0} max={60} step={1}
                               value={turfSpotCount} onChange={e => setTurfSpotCount(parseInt(e.target.value))} />
                        <span style={{width: 30, textAlign: 'right'}}>{turfSpotCount}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Spot radius min (cells)</span>
                        <input type="range" className="form-range" min={0.2} max={4} step={0.05}
                               value={turfSpotRadiusMin}
                               onChange={e => setTurfSpotRadiusMin(Math.min(parseFloat(e.target.value), turfSpotRadiusMax))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfSpotRadiusMin.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Spot radius max (cells)</span>
                        <input type="range" className="form-range" min={0.2} max={4} step={0.05}
                               value={turfSpotRadiusMax}
                               onChange={e => setTurfSpotRadiusMax(Math.max(parseFloat(e.target.value), turfSpotRadiusMin))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfSpotRadiusMax.toFixed(2)}</span>
                    </div>
                    <div className="mb-2 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Spot strength</span>
                        <input type="range" className="form-range" min={0} max={0.6} step={0.005}
                               value={turfSpotStrength} onChange={e => setTurfSpotStrength(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfSpotStrength.toFixed(3)}</span>
                    </div>
                    <div className="mb-3 d-flex align-items-center gap-2 small">
                        <span style={{width: 140}}>Spot light ratio</span>
                        <input type="range" className="form-range" min={0} max={1} step={0.01}
                               value={turfSpotLightRatio} onChange={e => setTurfSpotLightRatio(parseFloat(e.target.value))} />
                        <span style={{width: 40, textAlign: 'right'}}>{turfSpotLightRatio.toFixed(2)}</span>
                    </div>

                    <div className="mb-3 d-flex gap-2">
                        <button className="btn btn-sm btn-outline-secondary" onClick={reset}>Reset</button>
                        <button className="btn btn-sm btn-outline-light"
                                onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>Regenerate</button>
                    </div>

                    <div className="field-readout-compact small text-muted mb-2">
                        cellPx {geometry.cellPx} · grid {geometry.gridLeft},{geometry.gridTop} · lineW {geometry.lineW} · tickH {geometry.tickH} · field {geometry.field.x},{geometry.field.y} {geometry.field.w}×{geometry.field.h} · render {Math.round(renderMs)} ms
                    </div>

                    <div className="field-settings">
                        <label className="small d-block mb-1" htmlFor="turfSettingsTextarea">Turf recipe (JSON)</label>
                        <textarea
                            id="turfSettingsTextarea"
                            className="form-control form-control-sm font-monospace field-settings__textarea"
                            rows={16}
                            spellCheck={false}
                            value={settingsText}
                            onChange={onSettingsChange}
                            onFocus={() => setFocused(true)}
                            onBlur={onSettingsBlur}
                        />
                        <div className="mt-2 d-flex gap-2 align-items-center">
                            <button className="btn btn-sm btn-outline-primary" onClick={applySettings}>Apply</button>
                            <button className="btn btn-sm btn-outline-secondary" onClick={copySettings}>Copy</button>
                            {copyFeedback && <span className="small text-success">Copied</span>}
                        </div>
                        {settingsError && <div className="small text-danger mt-1">{settingsError}</div>}
                    </div>
                </div>

                <div className="col-lg-8">
                    <div className="field-preview" style={{width: boxW, height: boxH}}>
                        {/* Layer 1 — clip group A: turf canvas only, clipped to the oval field. */}
                        <div className="field-clip-turf" style={{clipPath: fieldClip, WebkitClipPath: fieldClip}}>
                            <canvas ref={canvasRef} className="field-turf-canvas" width={boxW} height={boxH} />
                        </div>

                        {/* Layer 2 — cells, unclipped by the oval. */}
                        {Array.from({length: rows}).map((_, r) =>
                            Array.from({length: cols}).map((_, c) => {
                                const idx = r * cols + c
                                const team = Teams[idx % Teams.length]
                                const sold = idx < clampedSoldCount
                                const footprintX = geometry.gridLeft + c * geometry.cellPx
                                const footprintY = geometry.gridTop + r * geometry.cellPx
                                const x = footprintX + geometry.cellBox.mx
                                const y = footprintY + geometry.cellBox.my
                                return (
                                    <div key={`cell-${idx}`}
                                         className={`field-cell${sold ? ' field-cell--sold' : ''}`}
                                         style={{
                                             left: x, top: y, width: geometry.cellBox.w, height: geometry.cellBox.h,
                                         }}>
                                        {!sold && (
                                            // eslint-disable-next-line @next/next/no-img-element -- plain <img>, same as every other layout element
                                            <img className="field-cell__logo" src={teamSrc(team)} alt={team} />
                                        )}
                                    </div>
                                )
                            })
                        )}

                        {/* Layer 3 — clip group B: column/row strips + hash ticks + seam ticks, above
                            the cells, clipped to the oval field. */}
                        <div className="field-clip-lines" style={{clipPath: fieldClip, WebkitClipPath: fieldClip}}>
                            {showStrips && geometry.vStrips.map((s, i) => (
                                <div key={`vstrip-${i}`} className="field-strip"
                                     style={{left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: lineColor}} />
                            ))}
                            {showStrips && geometry.hStrips.map((s, i) => (
                                <div key={`hstrip-${i}`} className="field-strip"
                                     style={{left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: lineColor}} />
                            ))}

                            {showTicks && geometry.ticks.map((t, i) => (
                                <div key={`tick-${i}`} className="field-tick"
                                     style={{left: t.x, top: t.y, width: t.w, height: t.h, backgroundColor: lineColor}} />
                            ))}

                            {seamTicks && geometry.seamTicks.map((t, i) => (
                                <div key={`seamtick-${i}`} className="field-tick"
                                     style={{left: t.x, top: t.y, width: t.w, height: t.h, backgroundColor: lineColor}} />
                            ))}
                        </div>

                        {/* Layer 4 — border, unchanged, above the lines and the cells; omitted at width 0. */}
                        {borderWidth > 0 && (
                            <div className="field-border" style={{
                                left: geometry.field.x, top: geometry.field.y,
                                width: geometry.field.w, height: geometry.field.h,
                                border: `${borderWidth}px solid ${lineColor}`,
                                borderRadius: `${fieldRx}px / ${fieldRy}px`,
                            }} />
                        )}

                        {/* Debug aid — un-rounded field bounds, never clipped to the oval. */}
                        <div className="field-outline" style={{
                            left: geometry.field.x, top: geometry.field.y,
                            width: geometry.field.w, height: geometry.field.h,
                        }} />
                    </div>

                    <h6 className="mt-4">Reference photo</h6>
                    {/* eslint-disable-next-line @next/next/no-img-element -- plain <img>, same as every other layout element */}
                    <img className="field-reference" src="/images/test/football-field.jpg" alt="Football field reference"
                         style={{width: boxW}} />
                </div>
            </div>
        </div>
    )
}
