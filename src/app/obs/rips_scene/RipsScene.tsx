'use client'

// Renderer for the `ripsScene` (rips-scene-plan.md §4), shared by the layout element
// (layout/elements/rips-scene/RipsSceneElement.tsx) and the tuning page (/obs/setup/rips_scene).
// No data hooks, no layout-config imports — just `w`, `h` and an already-merged recipe.
//
// Geometry: every recipe length is stage px of a 1080-wide canvas, multiplied here by `s = w / 1080`
// (plan §1). Only the mountain is anchored to the bottom edge; everything else is measured from the
// top. Rotation and scrolling are CSS keyframes on `transform` only (no rAF loop). Paint order is the
// inline z-index below; a glow's z comes from its `depth` alone, never from whether the layer it sits
// in front of is enabled (plan §4). React state in here: the middle cloud's per-copy section counter
// (`MiddleCloudLayer`) and the sky clouds' opaque-pixel masks (`useOpaqueMask`).

import {useEffect, useMemo, useState} from 'react'
import type {CSSProperties} from 'react'
import {MIDDLE_CLOUD_ARC_CENTRE, RIPS_ASSETS, SKY_CLOUD_ASSETS, type RipsAsset} from './assets'
import {middlePivot} from './recipe'
import type {FrontCloud, Glow, GlowDepth, GlowMode, MiddleCloud, RipsSceneRecipe, SkyCloud} from './recipe'
import './RipsScene.css'

const STAGE_W = 1080

const Z_BACKGROUND = 0
const Z_SKY_BASE = 10 // sky clouds 0..3 -> 10..13
const Z_MIDDLE = 20
const Z_MOUNTAIN = 30
const Z_FRONT_BACK = 40
const Z_FRONT_FRONT = 50
const Z_MARKS = 100

// Glow sits at its layer's z + 5, so it paints directly in front of that layer.
const GLOW_Z: Record<GlowDepth, number> = {
    background: Z_BACKGROUND + 5,
    skyClouds: Z_SKY_BASE + 5,
    middleCloud: Z_MIDDLE + 5,
    mountain: Z_MOUNTAIN + 5,
    frontBack: Z_FRONT_BACK + 5,
    frontFront: Z_FRONT_FRONT + 5,
}

// CSS blend mode per glow mode (recipe.ts's GLOW_MODES). 'add' is `plus-lighter`, the original look.
const GLOW_BLEND: Record<GlowMode, CSSProperties['mixBlendMode']> = {
    add: 'plus-lighter',
    screen: 'screen',
    normal: 'normal',
    multiply: 'multiply',
}

export type RipsSceneDebug = {showOverflow?: boolean; showPivots?: boolean; timeScale?: number}

type Props = {
    w: number
    h: number
    recipe: RipsSceneRecipe
    debug?: RipsSceneDebug
}

type RotatingImageProps = {
    asset: RipsAsset
    width: number
    x: number
    y: number
    pivotStageX: number
    pivotStageY: number
    fromDeg: number
    toDeg: number
    durationSec: number
    delaySec: number
    // Angle shown when not animated (speed 0). Its own prop rather than `fromDeg`, because the two
    // middle-cloud copies share one sweep and would otherwise freeze on top of each other.
    staticDeg: number
    extraOffsetX: number
    extraOffsetY: number
    s: number
    z: number
    timeScale: number
    // Called with the number of sweeps completed so far each time the animation wraps around.
    onIteration?: (completed: number) => void
}

/** One image rotating about a point on the stage (plan §4.2). Only knows stage px — the caller
 *  converts image-px pivots. The outer 0x0 div is the rotating anchor; the img is placed relative to
 *  it, shifted by `extraOffset` in the un-rotated frame (the middle cloud's per-section offset). */
function RotatingImage(p: RotatingImageProps) {
    const {asset, s} = p
    const animated = Number.isFinite(p.durationSec) && p.durationSec > 0
    const cssDuration = p.durationSec / p.timeScale
    const style: CSSProperties & Record<string, string | number> = {
        left: p.pivotStageX * s,
        top: p.pivotStageY * s,
        zIndex: p.z,
        '--rps-from': `${p.fromDeg}deg`,
        '--rps-to': `${p.toDeg}deg`,
    }
    if (animated) {
        style.animationDuration = `${cssDuration}s`
        style.animationDelay = `${p.delaySec / p.timeScale}s`
    } else {
        style.transform = `rotate(${p.staticDeg}deg)`
    }
    return (
        <div
            className={animated ? 'rps-pivot' : 'rps-pivot rps-static'}
            style={style}
            // `elapsedTime` (seconds since the animation started, not counting a negative delay) over
            // the duration gives the sweep count without relying on having seen every earlier event.
            onAnimationIteration={p.onIteration ? (e) => p.onIteration?.(Math.round(e.elapsedTime / cssDuration)) : undefined}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                className="rps-img"
                src={asset.src}
                alt=""
                draggable={false}
                style={{
                    left: (p.x - p.pivotStageX + p.extraOffsetX) * s,
                    top: (p.y - p.pivotStageY + p.extraOffsetY) * s,
                    width: p.width * s,
                }}
            />
        </div>
    )
}

/** Offset of chain section `k` (plan §4.2, "every newly joined section"): each section is shifted by
 *  `off` relative to the one before it, in that section's own frame, so
 *  d_0 = 0 and d_k = off + R(spacing) * d_(k-1). Written in closed form (a geometric series of
 *  rotations) so `k` can grow for as long as the stream runs. The result stays on a circle — it
 *  never drifts away. */
function sectionOffset(k: number, offX: number, offY: number, spacingDeg: number): {x: number; y: number} {
    if (k <= 0 || (offX === 0 && offY === 0)) return {x: 0, y: 0}
    const a = (spacingDeg * Math.PI) / 180
    // (1 - e^{ika}) / (1 - e^{ia}) as a complex number u + iv; multiplying `off` by it is the sum.
    const dr = 1 - Math.cos(a)
    const di = -Math.sin(a)
    const den = dr * dr + di * di
    if (den < 1e-9) return {x: k * offX, y: k * offY}
    const nr = 1 - Math.cos(k * a)
    const ni = -Math.sin(k * a)
    const u = (nr * dr + ni * di) / den
    const v = (ni * dr - nr * di) / den
    return {x: offX * u - offY * v, y: offX * v + offY * u}
}

/** Centre (stage px) of a middle-cloud section's image at angle 0 — the point `tilt` turns about. */
function middleTiltOrigin(mc: MiddleCloud): {x: number; y: number} {
    const asset = RIPS_ASSETS.middleCloud
    return {x: mc.x + mc.width / 2, y: mc.y + (mc.width * asset.h) / asset.w / 2}
}

/** The middle cloud's pivot before `tilt` (auto = the art's arc centre, see recipe.ts). Exported for
 *  the setup page, which shows the computed value. */
export function middleCloudPivot(mc: MiddleCloud): {x: number; y: number} {
    return middlePivot(mc, MIDDLE_CLOUD_ARC_CENTRE, RIPS_ASSETS.middleCloud.w)
}

/** Where the middle cloud's pivot ends up on the stage once `tilt` has turned the whole cloud. */
function tiltedMiddlePivot(mc: MiddleCloud): {x: number; y: number} {
    const o = middleTiltOrigin(mc)
    const a = (mc.tilt * Math.PI) / 180
    const pv = middleCloudPivot(mc)
    const dx = pv.x - o.x
    const dy = pv.y - o.y
    return {x: o.x + dx * Math.cos(a) - dy * Math.sin(a), y: o.y + dx * Math.sin(a) + dy * Math.cos(a)}
}

/** Angle at which a middle-cloud section enters its sweep. Not a knob: the sweep (2 * gap long) is
 *  centred so that a section is half-way through it when the middle of its image crosses the
 *  box's vertical centre line — sections then enter off-screen on the right and wrap off-screen on
 *  the left by the same margin, whatever the pivot, position, width or tilt. */
function middleSweepStart(mc: MiddleCloud): number {
    const o = middleTiltOrigin(mc) // image centre at angle 0; tilt turns about it, so it stays put
    const p = tiltedMiddlePivot(mc)
    const dx = o.x - p.x
    const dy = o.y - p.y
    const r = Math.hypot(dx, dy)
    if (r < 1) return -mc.gap
    const deg = 180 / Math.PI
    // Directions seen from the pivot, measured from straight down towards the right.
    const imageDir = Math.atan2(dx, dy) * deg
    const centreDir = Math.asin(Math.max(-1, Math.min(1, (STAGE_W / 2 - p.x) / r))) * deg
    // A clockwise turn moves the cloud left, so turning by (imageDir - centreDir) puts the image's
    // middle on the centre line; the sweep starts one gap before that.
    return imageDir - centreDir - mc.gap
}

type MiddleCloudLayerProps = {mc: MiddleCloud; s: number; timeScale: number}

/** The middle cloud (plan §4.2): an endless chain of sections around the pivot, drawn with two
 *  image copies that leapfrog. Section k+1 trails section k by `spacing` degrees and is shifted by
 *  the "second" offset relative to it — the same rule at every join, not just between the first two.
 *  Copy A carries the even sections, copy B the odd ones; each time a copy's sweep wraps (it has
 *  left the screen and re-enters behind the other) it becomes the next section of its parity. */
function MiddleCloudLayer({mc, s, timeScale}: MiddleCloudLayerProps) {
    const [sweepsA, setSweepsA] = useState(0)
    const [sweepsB, setSweepsB] = useState(0)

    const spacing = mc.gap
    const pivot = middleCloudPivot(mc)
    const start = middleSweepStart(mc)
    const twoCopies = spacing > 0
    const duration = twoCopies && mc.speed > 0 ? (2 * spacing) / mc.speed : 0
    const dA = sectionOffset(2 * sweepsA, mc.secondOffsetX, mc.secondOffsetY, spacing)
    const dB = sectionOffset(2 * sweepsB + 1, mc.secondOffsetX, mc.secondOffsetY, spacing)
    const common = {
        asset: RIPS_ASSETS.middleCloud,
        width: mc.width,
        x: mc.x,
        y: mc.y,
        pivotStageX: pivot.x,
        pivotStageY: pivot.y,
        fromDeg: start,
        toDeg: start + 2 * spacing,
        durationSec: duration,
        s,
        z: Z_MIDDLE,
        timeScale,
    }
    // `tilt` turns the whole cloud as one piece: a zero-size parent holding both copies is rotated
    // about the centre of a section's image at angle 0, so the pivot and the sweep turn with it and
    // the joins between sections stay exactly as tuned.
    const origin = middleTiltOrigin(mc)
    return (
        <div
            className="rps-group"
            style={{zIndex: Z_MIDDLE, transformOrigin: `${origin.x * s}px ${origin.y * s}px`, transform: mc.tilt ? `rotate(${mc.tilt}deg)` : undefined}}
        >
            <RotatingImage
                {...common}
                delaySec={-duration / 2}
                staticDeg={twoCopies ? start + spacing : start}
                extraOffsetX={dA.x}
                extraOffsetY={dA.y}
                onIteration={setSweepsA}
            />
            {twoCopies && (
                <RotatingImage {...common} delaySec={0} staticDeg={start} extraOffsetX={dB.x} extraOffsetY={dB.y} onIteration={setSweepsB}/>
            )}
        </div>
    )
}

const SKY_MAX_COPIES = 12
// Paint closer to the pivot than this fraction of the image width is ignored by the visibility test.
const SKY_PIVOT_IGNORE = 0.06

// Coarse map of where a sky cloud image actually has paint: centres of the opaque cells of the art
// drawn down to MASK_COLS columns, in units of the image WIDTH (x 0..1, y 0..h/w). The image's
// bounding box is useless for "is it on screen" — the sample art is an arc of clouds around a mostly
// empty rectangle with the pivot inside it — so visibility is tested against these points.
type OpaqueMask = {pts: Array<[number, number]>; cell: number}

const MASK_COLS = 64
const maskCache = new Map<string, OpaqueMask>()

/** Loads `src` once per page and returns its opaque mask, or null until it is ready (or if the
 *  canvas read fails). Read from the image itself rather than stored in assets.ts, so replacing the
 *  art needs no extra step. */
function useOpaqueMask(src: string): OpaqueMask | null {
    const [mask, setMask] = useState<OpaqueMask | null>(null)
    useEffect(() => {
        const cached = maskCache.get(src)
        if (cached) {
            setMask(cached)
            return
        }
        let cancelled = false
        const img = new Image()
        img.onload = () => {
            try {
                const cols = MASK_COLS
                const rows = Math.max(1, Math.round((cols * img.naturalHeight) / img.naturalWidth))
                const canvas = document.createElement('canvas')
                canvas.width = cols
                canvas.height = rows
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                ctx.drawImage(img, 0, 0, cols, rows)
                const data = ctx.getImageData(0, 0, cols, rows).data
                const pts: Array<[number, number]> = []
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        if (data[(y * cols + x) * 4 + 3] > 16) pts.push([(x + 0.5) / cols, (y + 0.5) / cols])
                    }
                }
                const built = {pts, cell: 1 / cols}
                maskCache.set(src, built)
                if (!cancelled) setMask(built)
            } catch {
                // Canvas unreadable — the cloud keeps the plain sweep (see SkyCloudLayer).
            }
        }
        img.src = src
        return () => {
            cancelled = true
        }
    }, [src])
    return mask
}

export type SkyVisibility = {
    exit: number // angle (deg, 0..359) at which a copy has just finished leaving the box
    span: number // degrees of a full turn during which a copy shows somewhere in the box
}

/** For one sky cloud, turns the art a full circle about its pivot in 1 degree steps and records at
 *  which angles any of its paint falls inside the box. Returns where the longest stretch of "not
 *  visible" begins (`exit`) and how much of the turn is visible (`span`). Null when the art is in
 *  the box all the way round — there is then no hidden moment to wrap in; `span: 0` when it never
 *  enters the box at all. */
function skyVisibility(mask: OpaqueMask, c: SkyCloud, left: number, pivot: {x: number; y: number}, stageH: number): SkyVisibility | null {
    const m = mask.cell * c.width // one mask cell, in stage px — the test's tolerance
    // Paint sitting right on the pivot (the sample art has a small cloud there) hardly moves when the
    // image turns, so it can never "leave" — it is left out of the test, or a pivot near the box
    // would make every copy count as permanently visible.
    const minR = SKY_PIVOT_IGNORE * c.width
    const rel = mask.pts
        .map(([px, py]) => [left + px * c.width - pivot.x, c.y + py * c.width - pivot.y])
        .filter(([dx, dy]) => Math.hypot(dx, dy) > minR)
    const visible: boolean[] = []
    for (let deg = 0; deg < 360; deg++) {
        const a = (deg * Math.PI) / 180
        const cos = Math.cos(a)
        const sin = Math.sin(a)
        let hit = false
        for (const [dx, dy] of rel) {
            const x = pivot.x + dx * cos - dy * sin
            const y = pivot.y + dx * sin + dy * cos
            if (x > -m && x < STAGE_W + m && y > -m && y < stageH + m) {
                hit = true
                break
            }
        }
        visible.push(hit)
    }
    // Longest circular run of hidden angles.
    let bestStart = -1
    let bestLen = 0
    for (let start = 0; start < 360; start++) {
        if (visible[start] || !visible[(start + 359) % 360]) continue // only where a hidden run begins
        let len = 0
        while (len < 360 && !visible[(start + len) % 360]) len++
        if (len > bestLen) {
            bestLen = len
            bestStart = start
        }
    }
    if (bestStart < 0) {
        // No hidden run starts anywhere: the art is in view either all the way round or never.
        return visible[0] ? null : {exit: 0, span: 0}
    }
    return {exit: bestStart, span: 360 - bestLen}
}

/** Where a sky cloud's image and pivot sit on the stage: `x` places the PIVOT relative to the
 *  horizontal centre (0 = on the centre line), and the image's left edge is derived back from it. */
function skyGeometry(c: SkyCloud, asset: RipsAsset): {left: number; pivot: {x: number; y: number}} {
    const k = c.width / asset.w
    const pivot = {x: STAGE_W / 2 + c.x, y: c.y + c.pivotY * k}
    return {left: pivot.x - c.pivotX * k, pivot}
}

/** Visibility of sky cloud `index` for a box `stageH` stage px tall (null while the mask loads, or
 *  when the art never leaves / never enters the box). Exported for the setup page's hint. */
export function useSkyVisibility(c: SkyCloud, index: number, stageH: number): SkyVisibility | null {
    const asset = SKY_CLOUD_ASSETS[index]
    const mask = useOpaqueMask(asset.src)
    return useMemo(() => {
        if (!mask) return null
        const {left, pivot} = skyGeometry(c, asset)
        return skyVisibility(mask, c, left, pivot, stageH)
        // Only the fields that move the art; speed/copies/gap/rotation do not change what is visible.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mask, asset, c.width, c.x, c.y, c.pivotX, c.pivotY, stageH])
}

function mod(v: number, n: number): number {
    return ((v % n) + n) % n
}

type SkyCloudLayerProps = {
    c: SkyCloud
    index: number
    stageH: number
    s: number
    z: number
    timeScale: number
}

/** One sky cloud (plan §4.2): `copies` identical images of the same art chasing each other around
 *  the cloud's pivot, `gap` degrees apart. Deliberately simpler than the middle cloud — no section
 *  offsets, no per-copy state.
 *
 *  A copy does NOT keep circling: its sweep ends at the angle where the art has just left the box
 *  (`exit`, from `useSkyVisibility`), and from there it wraps `copies * gap` degrees back — which is
 *  exactly one gap behind the last copy of the chain. So a copy disappears once it is out of view
 *  and rejoins at the tail. The re-entry is hidden as long as `copies * gap` covers the visible
 *  span; if it does not, the copy reappears already inside the box (raise Copies or Gap).
 *
 *  Fallbacks: one copy, or `copies * gap` of 360 or more, is a plain full turn (a closed ring has no
 *  wrap to hide). While the mask is loading, or when the art is always in view, the sweep starts at
 *  `rotation` instead of ending at `exit`. `rotation` otherwise only sets where the chain is at t=0. */
function SkyCloudLayer({c, index, stageH, s, z, timeScale}: SkyCloudLayerProps) {
    const asset = SKY_CLOUD_ASSETS[index]
    const {left, pivot} = skyGeometry(c, asset)
    const vis = useSkyVisibility(c, index, stageH)
    const copies = Math.max(1, Math.min(SKY_MAX_COPIES, Math.round(c.copies)))
    const gap = copies === 1 ? 360 : c.gap
    const sweep = Math.min(360, copies * gap)
    const start = vis && vis.span > 0 && sweep < 360 ? vis.exit - sweep : c.rotation
    const duration = c.speed > 0 && sweep > 0 ? sweep / c.speed : 0
    return (
        <>
            {Array.from({length: copies}, (_, j) => {
                // Where copy j is in the sweep at t=0: `rotation`, plus j gaps ahead of copy 0.
                const phase = sweep > 0 ? mod(c.rotation + j * gap - start, sweep) : 0
                return (
                    <RotatingImage
                        key={j}
                        asset={asset}
                        width={c.width}
                        x={left}
                        y={c.y}
                        pivotStageX={pivot.x}
                        pivotStageY={pivot.y}
                        fromDeg={start}
                        toDeg={start + sweep}
                        durationSec={duration}
                        delaySec={c.speed > 0 ? -phase / c.speed : 0}
                        staticDeg={start + phase}
                        extraOffsetX={0}
                        extraOffsetY={0}
                        s={s}
                        z={z}
                        timeScale={timeScale}
                    />
                )
            })}
        </>
    )
}

type FrontStripProps = {
    cfg: FrontCloud
    w: number
    s: number
    z: number
    timeScale: number
}

/** A horizontally scrolling strip of overlapping tiles (plan §4.4). */
function FrontStrip({cfg, w, s, z, timeScale}: FrontStripProps) {
    const asset = RIPS_ASSETS.cloudsFront
    const tileW = cfg.width * s
    const pitch = Math.max(1, (cfg.width - cfg.overlap) * s)
    // One tile more than the scroll needs, placed one pitch to the LEFT of the box: every tile's
    // transparent left margin is hidden by the tile before it, and the first visible one needs a
    // predecessor too.
    const n = Math.ceil(w / pitch) + 2
    const animated = cfg.speed > 0 && Number.isFinite(cfg.speed)
    const trackStyle: CSSProperties & Record<string, string | number> = {'--rps-pitch': `${pitch}px`}
    if (animated) {
        trackStyle.animationDuration = `${(cfg.width - cfg.overlap) / cfg.speed / timeScale}s`
        trackStyle.animationDelay = `${-(cfg.offset / cfg.speed) / timeScale}s`
    } else {
        trackStyle.transform = `translateX(${-((cfg.offset * s) % pitch)}px)`
    }
    return (
        <div className="rps-front" style={{top: cfg.y * s, height: (tileW * asset.h) / asset.w, width: '100%', zIndex: z}}>
            <div className={animated ? 'rps-front-track' : 'rps-front-track rps-static'} style={trackStyle}>
                {Array.from({length: n}, (_, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} className="rps-img" src={asset.src} alt="" draggable={false} style={{left: (j - 1) * pitch, top: 0, width: tileW}}/>
                ))}
            </div>
        </div>
    )
}

function glowBackground(g: Glow): string {
    const r = parseInt(g.color.slice(1, 3), 16)
    const gr = parseInt(g.color.slice(3, 5), 16)
    const b = parseInt(g.color.slice(5, 7), 16)
    const a = Math.max(0, Math.min(1, g.strength))
    return `radial-gradient(circle, rgba(${r},${gr},${b},${a}) 0%, rgba(${r},${gr},${b},${a * 0.5}) 40%, rgba(${r},${gr},${b},0) 70%)`
}

export function RipsScene({w, h, recipe, debug}: Props) {
    const s = w / STAGE_W
    const timeScale = debug?.timeScale && debug.timeScale > 0 ? debug.timeScale : 1
    const {background, skyClouds, middleCloud: mc, mountain, frontBack, frontFront, glows} = recipe

    // Sky cloud pivots in stage px, for the debug markers.
    const skyPivots = skyClouds.map((c, i) => skyGeometry(c, SKY_CLOUD_ASSETS[i]).pivot)

    return (
        <div className={debug?.showOverflow ? 'rps-root rps-overflow' : 'rps-root'} style={{width: w, height: h}}>
            {background.enabled && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="rps-img rps-bg" src={RIPS_ASSETS.background.src} alt="" draggable={false} style={{zIndex: Z_BACKGROUND}}/>
            )}

            {skyClouds.map((c, i) =>
                c.enabled ? (
                    <SkyCloudLayer key={`sky${i}`} c={c} index={i} stageH={h / s} s={s} z={Z_SKY_BASE + i} timeScale={timeScale}/>
                ) : null
            )}

            {mc.enabled && <MiddleCloudLayer mc={mc} s={s} timeScale={timeScale}/>}

            {mountain.enabled && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    className="rps-img"
                    src={RIPS_ASSETS.mountain.src}
                    alt=""
                    draggable={false}
                    style={{width: mountain.width * s, left: (w - mountain.width * s) / 2 + mountain.x * s, bottom: mountain.bottom * s, zIndex: Z_MOUNTAIN}}
                />
            )}

            {frontBack.enabled && <FrontStrip cfg={frontBack} w={w} s={s} z={Z_FRONT_BACK} timeScale={timeScale}/>}
            {frontFront.enabled && <FrontStrip cfg={frontFront} w={w} s={s} z={Z_FRONT_FRONT} timeScale={timeScale}/>}

            {glows.map((g, i) => (
                <div
                    key={`glow${i}`}
                    className="rps-glow"
                    style={{
                        left: (g.x - g.radius) * s,
                        top: (g.y - g.radius) * s,
                        width: 2 * g.radius * s,
                        height: 2 * g.radius * s,
                        background: glowBackground(g),
                        mixBlendMode: GLOW_BLEND[g.mode],
                        zIndex: GLOW_Z[g.depth],
                    }}
                />
            ))}

            {debug?.showPivots && (
                <>
                    {skyClouds.map((c, i) =>
                        c.enabled ? (
                            <div key={`pm${i}`} className="rps-pivot-mark" style={{left: skyPivots[i].x * s, top: skyPivots[i].y * s, zIndex: Z_MARKS}}>
                                <span className="rps-pivot-label">sky {i + 1}</span>
                            </div>
                        ) : null
                    )}
                    {mc.enabled && (
                        <div className="rps-pivot-mark" style={{left: tiltedMiddlePivot(mc).x * s, top: tiltedMiddlePivot(mc).y * s, zIndex: Z_MARKS}}>
                            <span className="rps-pivot-label">middle</span>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
