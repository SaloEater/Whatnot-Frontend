'use client'

// rips-scene-plan.md §7 — tuning page for the `ripsScene` layout element. Modelled on
// /obs/setup/sport_style/board: client component, state persisted to localStorage through a
// try/catch loader, nothing rendered until mounted (hydration guard), Copy/Apply JSON box.
//
// The recipe is NESTED, so it lives in ONE useState<RipsSceneRecipe> instead of one state per knob.
// Preview-only knobs (height, debug toggles, time scale) are never exported. No auth/login handling
// here on purpose — the backend ignores credentials and this page never calls it.

import {useEffect, useRef, useState, type ChangeEvent, type FocusEvent, type ReactNode} from 'react'
import {RipsScene, middleCloudPivot, useSkyVisibility} from '@/app/obs/rips_scene/RipsScene'
import {
    DEFAULT_GLOW,
    DEFAULT_RIPS_RECIPE,
    mergeRecipe,
    type FrontCloud,
    type Glow,
    type GlowDepth,
    type GlowMode,
    type MiddleCloud,
    type RipsSceneRecipe,
    type SkyCloud,
} from '@/app/obs/rips_scene/recipe'
import './page.css'

const STORAGE_KEY = 'setup-rips-scene-v1'

const MIN_H = 100
const MAX_H = 960

type Preview = {height: number; showOverflow: boolean; showPivots: boolean; timeScale: number}

const DEFAULT_PREVIEW: Preview = {height: 640, showOverflow: false, showPivots: false, timeScale: 1}

// Glow depth select, in the plan's order (front-most first).
const DEPTH_OPTIONS: Array<{value: GlowDepth; label: string}> = [
    {value: 'frontFront', label: 'In front of everything'},
    {value: 'frontBack', label: 'In front of back cloud (front back)'},
    {value: 'mountain', label: 'In front of mountain'},
    {value: 'middleCloud', label: 'In front of middle cloud'},
    {value: 'skyClouds', label: 'In front of sky clouds'},
    {value: 'background', label: 'In front of background'},
]

// Glow mode select (recipe.ts's GLOW_MODES).
const MODE_OPTIONS: Array<{value: GlowMode; label: string}> = [
    {value: 'add', label: 'Glow — adds light'},
    {value: 'screen', label: 'Soft glow — adds light, never blows out'},
    {value: 'normal', label: 'Shade — covers (black dims)'},
    {value: 'multiply', label: 'Darken — multiplies (black dims, colour tints)'},
]

function loadSaved(): {recipe: RipsSceneRecipe; preview: Preview} {
    if (typeof window === 'undefined') return {recipe: DEFAULT_RIPS_RECIPE, preview: DEFAULT_PREVIEW}
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        const parsed = raw ? JSON.parse(raw) : {}
        const p = (parsed && typeof parsed === 'object' ? parsed.preview : undefined) ?? {}
        const height = typeof p.height === 'number' && Number.isFinite(p.height) ? clamp(p.height, MIN_H, MAX_H) : DEFAULT_PREVIEW.height
        return {
            recipe: mergeRecipe(parsed?.recipe),
            preview: {
                height,
                showOverflow: typeof p.showOverflow === 'boolean' ? p.showOverflow : DEFAULT_PREVIEW.showOverflow,
                showPivots: typeof p.showPivots === 'boolean' ? p.showPivots : DEFAULT_PREVIEW.showPivots,
                timeScale: [1, 5, 20].includes(p.timeScale) ? p.timeScale : DEFAULT_PREVIEW.timeScale,
            },
        }
    } catch {
        return {recipe: DEFAULT_RIPS_RECIPE, preview: DEFAULT_PREVIEW}
    }
}

function clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v))
}

type NumProps = {label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void}

/** Number input with SceneSettings.tsx's `numberField` behaviour: onChange ignores a non-finite
 *  value (an empty/partial "-" is never written as NaN); onBlur clamps into range, falling back to
 *  the current value if the field can't be parsed. */
function Num({label, value, min, max, step, onChange}: NumProps) {
    return (
        <label className="small">
            {label}
            <input
                type="number"
                className="form-control form-control-sm rsp-num"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    const v = Number(e.target.value)
                    if (!Number.isFinite(v)) return
                    onChange(v)
                }}
                onBlur={(e: FocusEvent<HTMLInputElement>) => {
                    const v = Number(e.target.value)
                    onChange(Number.isFinite(v) ? clamp(v, min, max) : value)
                }}
            />
        </label>
    )
}

function Enabled({value, onChange}: {value: boolean; onChange: (v: boolean) => void}) {
    return (
        <label className="small d-flex align-items-center gap-1">
            <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)}/>
            Enabled
        </label>
    )
}

/** Tells the operator whether a sky cloud's chain is long enough for a copy to rejoin the tail out
 *  of view: the copy leaves when its art is off-screen and wraps back `copies * gap` degrees. */
function SkyHint({c, index, height}: {c: SkyCloud; index: number; height: number}) {
    const vis = useSkyVisibility(c, index, height)
    const copies = Math.max(1, Math.round(c.copies))
    if (copies === 1) return <div className="w-100 small text-muted">One copy: turns a full 360°.</div>
    const chain = copies * c.gap
    if (chain >= 360) return <div className="w-100 small text-muted">Copies × Gap = {chain}° — a closed ring, full turn.</div>
    if (!vis) return <div className="w-100 small text-muted">The art never fully leaves the box at this height, so a copy cannot rejoin out of view.</div>
    if (vis.span === 0) return <div className="w-100 small text-warning">The art never enters the box at this height — nothing of this cloud is visible.</div>
    const ok = chain >= vis.span
    return (
        <div className={`w-100 small ${ok ? 'text-muted' : 'text-warning'}`}>
            On screen for {vis.span}° of a turn; Copies × Gap = {chain}°.
            {ok ? ' Copies rejoin the tail out of view.' : ` Too short — a copy will reappear inside the box. Needs at least ${vis.span}°.`}
        </div>
    )
}

function Section({title, children}: {title: string; children: ReactNode}) {
    return (
        <details className="rsp-section">
            <summary>{title}</summary>
            <div className="rsp-grid">{children}</div>
        </details>
    )
}

export default function Page() {
    const [saved] = useState(loadSaved)
    const [recipe, setRecipe] = useState<RipsSceneRecipe>(saved.recipe)
    const [preview, setPreview] = useState<Preview>(saved.preview)
    // Bumped by "Restart animations": remounts the preview, since changing a duration re-times a
    // running CSS animation and can make a layer jump (plan §7).
    const [restartKey, setRestartKey] = useState(0)

    const [jsonText, setJsonText] = useState('')
    const [jsonError, setJsonError] = useState<string | null>(null)
    const [copyFeedback, setCopyFeedback] = useState(false)
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Saved state lives in localStorage, so the client's first render can differ from the server's.
    // Render nothing until mounted to avoid hydration mismatches (same guard as the sport_style pages).
    const [mounted, setMounted] = useState(false)
    useEffect(() => { setMounted(true) }, [])

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({recipe, preview}))
        } catch {
            // ignore storage errors (private mode, quota)
        }
    }, [recipe, preview])

    // The JSON box mirrors the recipe; Apply/typing are only a draft until applied.
    useEffect(() => {
        setJsonText(JSON.stringify(recipe, null, 2))
        setJsonError(null)
    }, [recipe])

    const setMiddle = (patch: Partial<MiddleCloud>) => setRecipe((r) => ({...r, middleCloud: {...r.middleCloud, ...patch}}))
    const setFront = (key: 'frontBack' | 'frontFront', patch: Partial<FrontCloud>) => setRecipe((r) => ({...r, [key]: {...r[key], ...patch}}))
    const setMountain = (patch: Partial<RipsSceneRecipe['mountain']>) => setRecipe((r) => ({...r, mountain: {...r.mountain, ...patch}}))
    const setSky = (i: number, patch: Partial<SkyCloud>) =>
        setRecipe((r) => ({...r, skyClouds: r.skyClouds.map((c, j) => (j === i ? {...c, ...patch} : c))}))
    const setGlow = (i: number, patch: Partial<Glow>) =>
        setRecipe((r) => ({...r, glows: r.glows.map((g, j) => (j === i ? {...g, ...patch} : g))}))
    const addGlow = () => setRecipe((r) => ({...r, glows: [...r.glows, {...DEFAULT_GLOW}]}))
    const removeGlow = (i: number) => setRecipe((r) => ({...r, glows: r.glows.filter((_, j) => j !== i)}))
    const setPrev = (patch: Partial<Preview>) => setPreview((p) => ({...p, ...patch}))

    function applyJson() {
        let parsed: unknown
        try {
            parsed = JSON.parse(jsonText)
        } catch (err) {
            setJsonError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
            return
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            setJsonError('JSON must be an object')
            return
        }
        setJsonError(null)
        setRecipe(mergeRecipe(parsed))
    }

    async function copyJson() {
        try {
            await navigator.clipboard.writeText(jsonText)
            setCopyFeedback(true)
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
            copyTimeoutRef.current = setTimeout(() => setCopyFeedback(false), 1500)
        } catch {
            // clipboard API can throw (permissions, insecure context, etc.) — nothing to recover,
            // just skip the "Copied" feedback.
        }
    }

    function reset() {
        try {
            localStorage.removeItem(STORAGE_KEY)
        } catch {
            // ignore storage errors
        }
        setRecipe(DEFAULT_RIPS_RECIPE)
        setPreview(DEFAULT_PREVIEW)
    }

    function frontSection(key: 'frontBack' | 'frontFront', title: string) {
        const c = recipe[key]
        return (
            <Section title={title}>
                <Enabled value={c.enabled} onChange={(v) => setFront(key, {enabled: v})}/>
                <Num label="Y" value={c.y} min={-400} max={960} step={1} onChange={(v) => setFront(key, {y: v})}/>
                <Num label="Speed px/s" value={c.speed} min={0} max={300} step={1} onChange={(v) => setFront(key, {speed: v})}/>
                <Num label="Width" value={c.width} min={200} max={4000} step={1} onChange={(v) => setFront(key, {width: v})}/>
                <Num label="Overlap" value={c.overlap} min={0} max={500} step={1} onChange={(v) => setFront(key, {overlap: v})}/>
                <Num label="Start offset" value={c.offset} min={0} max={4000} step={1} onChange={(v) => setFront(key, {offset: v})}/>
            </Section>
        )
    }

    if (!mounted) return null

    const mc = recipe.middleCloud

    return (
        <div className="rsp-page container-fluid p-3">
            <h4>Rips scene tuning (/obs/setup/rips_scene)</h4>
            <div className="row g-4">
                <div className="col-xl-7">
                    <div className="d-flex flex-wrap gap-3 align-items-end mb-2">
                        <Num label="Height" value={preview.height} min={MIN_H} max={MAX_H} step={1} onChange={(v) => setPrev({height: v})}/>
                        {[480, 640, 960].map((hh) => (
                            <button key={hh} type="button" className="btn btn-sm btn-outline-light" onClick={() => setPrev({height: hh})}>
                                {hh}
                            </button>
                        ))}
                        <label className="small d-flex align-items-center gap-1">
                            <input type="checkbox" checked={preview.showOverflow} onChange={(e) => setPrev({showOverflow: e.target.checked})}/>
                            Show off-screen art
                        </label>
                        <label className="small d-flex align-items-center gap-1">
                            <input type="checkbox" checked={preview.showPivots} onChange={(e) => setPrev({showPivots: e.target.checked})}/>
                            Show pivots
                        </label>
                        <div className="btn-group btn-group-sm" role="group">
                            {[1, 5, 20].map((t) => (
                                <button
                                    key={t}
                                    type="button"
                                    className={`btn ${preview.timeScale === t ? 'btn-primary' : 'btn-outline-light'}`}
                                    onClick={() => setPrev({timeScale: t})}
                                >
                                    Time ×{t}
                                </button>
                            ))}
                        </div>
                        <button type="button" className="btn btn-sm btn-outline-light" onClick={() => setRestartKey((k) => k + 1)}>
                            Restart animations
                        </button>
                    </div>
                    <div className="rsp-preview-panel">
                        <div className="rsp-preview-frame" style={{height: preview.height}}>
                            <RipsScene
                                key={restartKey}
                                w={1080}
                                h={preview.height}
                                recipe={recipe}
                                debug={{showOverflow: preview.showOverflow, showPivots: preview.showPivots, timeScale: preview.timeScale}}
                            />
                        </div>
                    </div>
                </div>

                <div className="col-xl-5">
                    <Section title="Glows">
                        <button type="button" className="btn btn-sm btn-outline-light" onClick={addGlow}>Add glow</button>
                        {recipe.glows.map((g, i) => (
                            <div key={i} className="rsp-grid w-100 border-top pt-2">
                                <Num label="X" value={g.x} min={-500} max={1580} step={1} onChange={(v) => setGlow(i, {x: v})}/>
                                <Num label="Y" value={g.y} min={-500} max={1460} step={1} onChange={(v) => setGlow(i, {y: v})}/>
                                <Num label="Radius" value={g.radius} min={10} max={1500} step={1} onChange={(v) => setGlow(i, {radius: v})}/>
                                <Num label="Strength" value={g.strength} min={0} max={1} step={0.05} onChange={(v) => setGlow(i, {strength: v})}/>
                                <label className="small">
                                    Colour
                                    <input type="color" className="form-control form-control-sm form-control-color" value={g.color} onChange={(e) => setGlow(i, {color: e.target.value})}/>
                                </label>
                                <label className="small">
                                    Depth
                                    <select className="form-select form-select-sm" value={g.depth} onChange={(e) => setGlow(i, {depth: e.target.value as GlowDepth})}>
                                        {DEPTH_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className="small">
                                    Mode
                                    <select className="form-select form-select-sm" value={g.mode} onChange={(e) => setGlow(i, {mode: e.target.value as GlowMode})}>
                                        {MODE_OPTIONS.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <button type="button" className="btn btn-sm btn-outline-danger align-self-end" onClick={() => removeGlow(i)}>Remove</button>
                            </div>
                        ))}
                    </Section>

                    {frontSection('frontFront', 'Front front cloud')}
                    {frontSection('frontBack', 'Front back cloud')}

                    <Section title="Mountain">
                        <Enabled value={recipe.mountain.enabled} onChange={(v) => setMountain({enabled: v})}/>
                        <Num label="Bottom" value={recipe.mountain.bottom} min={-600} max={600} step={1} onChange={(v) => setMountain({bottom: v})}/>
                        <Num label="X" value={recipe.mountain.x} min={-1080} max={1080} step={1} onChange={(v) => setMountain({x: v})}/>
                        <Num label="Width" value={recipe.mountain.width} min={200} max={4000} step={1} onChange={(v) => setMountain({width: v})}/>
                    </Section>

                    <Section title="Middle cloud">
                        <Enabled value={mc.enabled} onChange={(v) => setMiddle({enabled: v})}/>
                        <Num label="X" value={mc.x} min={-4000} max={4000} step={1} onChange={(v) => setMiddle({x: v})}/>
                        {/* Moving the cloud vertically carries its pivot along by the same amount, so the
                            orbit (radius, joins, sweep) stays as tuned and the whole band just shifts. */}
                        <Num label="Y (moves pivot too)" value={mc.y} min={-4000} max={4000} step={1} onChange={(v) => setMiddle({y: v, pivotY: mc.pivotY + (v - mc.y)})}/>
                        <Num label="Width" value={mc.width} min={200} max={6000} step={1} onChange={(v) => setMiddle({width: v})}/>
                        <Num label="Tilt ° (whole cloud)" value={mc.tilt} min={-180} max={180} step={0.5} onChange={(v) => setMiddle({tilt: v})}/>
                        <label className="small d-flex align-items-center gap-1">
                            <input type="checkbox" checked={mc.autoPivot} onChange={(e) => setMiddle({autoPivot: e.target.checked})}/>
                            Auto pivot (circle on the art&apos;s own curve)
                        </label>
                        {mc.autoPivot ? (
                            <div className="small text-muted">
                                Pivot: {Math.round(middleCloudPivot(mc).x)}, {Math.round(middleCloudPivot(mc).y)} (from X, Y and Width)
                            </div>
                        ) : (
                            <>
                            <Num label="Pivot X (stage)" value={mc.pivotX} min={-10000} max={10000} step={1} onChange={(v) => setMiddle({pivotX: v})}/>
                            <Num label="Pivot Y (stage)" value={mc.pivotY} min={-10000} max={10000} step={1} onChange={(v) => setMiddle({pivotY: v})}/>
                            </>
                        )}
                        <Num label="Speed °/s" value={mc.speed} min={0} max={30} step={0.1} onChange={(v) => setMiddle({speed: v})}/>
                        <Num label="Gap °" value={mc.gap} min={0} max={180} step={0.5} onChange={(v) => setMiddle({gap: v})}/>
                        <div className="w-100 small text-muted">Each new section, relative to the one before it</div>
                        <Num label="Offset X" value={mc.secondOffsetX} min={-500} max={500} step={1} onChange={(v) => setMiddle({secondOffsetX: v})}/>
                        <Num label="Offset Y" value={mc.secondOffsetY} min={-500} max={500} step={1} onChange={(v) => setMiddle({secondOffsetY: v})}/>
                    </Section>

                    {recipe.skyClouds.map((c, i) => (
                        <Section key={i} title={`Sky cloud ${i + 1}`}>
                            <Enabled value={c.enabled} onChange={(v) => setSky(i, {enabled: v})}/>
                            <Num label="Pivot offset from centre" value={c.x} min={-3000} max={3000} step={1} onChange={(v) => setSky(i, {x: v})}/>
                            <Num label="Y" value={c.y} min={-3000} max={3000} step={1} onChange={(v) => setSky(i, {y: v})}/>
                            <Num label="Width" value={c.width} min={100} max={4000} step={1} onChange={(v) => setSky(i, {width: v})}/>
                            <Num label="Pivot X (image px)" value={c.pivotX} min={-5000} max={5000} step={1} onChange={(v) => setSky(i, {pivotX: v})}/>
                            <Num label="Pivot Y (image px)" value={c.pivotY} min={-5000} max={5000} step={1} onChange={(v) => setSky(i, {pivotY: v})}/>
                            <Num label="Rotation °" value={c.rotation} min={-360} max={360} step={1} onChange={(v) => setSky(i, {rotation: v})}/>
                            <Num label="Copies" value={c.copies} min={1} max={12} step={1} onChange={(v) => setSky(i, {copies: Math.round(v)})}/>
                            <Num label="Gap ° (between copies)" value={c.gap} min={1} max={360} step={0.5} onChange={(v) => setSky(i, {gap: v})}/>
                            <Num label="Speed °/s" value={c.speed} min={0} max={30} step={0.1} onChange={(v) => setSky(i, {speed: v})}/>
                            <SkyHint c={c} index={i} height={preview.height}/>
                        </Section>
                    ))}

                    <Section title="Background">
                        <Enabled value={recipe.background.enabled} onChange={(v) => setRecipe((r) => ({...r, background: {enabled: v}}))}/>
                    </Section>

                    <div className="mt-3">
                        <label className="form-label mb-0 small">Recipe JSON</label>
                        <textarea
                            className="form-control form-control-sm rsp-json"
                            rows={16}
                            spellCheck={false}
                            value={jsonText}
                            onChange={(e) => {
                                setJsonText(e.target.value)
                                setJsonError(null)
                            }}
                        />
                        <div className="d-flex align-items-center gap-2 mt-1">
                            <button type="button" className="btn btn-sm btn-outline-light" onClick={copyJson}>Copy</button>
                            <button type="button" className="btn btn-sm btn-primary" onClick={applyJson}>Apply</button>
                            <button type="button" className="btn btn-sm btn-outline-danger" onClick={reset}>Reset to defaults</button>
                            {copyFeedback && <span className="small text-success">Copied</span>}
                        </div>
                        {jsonError && <div className="small text-danger mt-1">{jsonError}</div>}
                    </div>
                </div>
            </div>
        </div>
    )
}
