'use client'

// `birds` effect (obs-scene-element-plan.md §1.2/§6) — periodic flocks of birds flying the full
// width of the box inside a `yMin..yMax` band (art layer, z 40 — effectRegistry.ts's `LAYER_Z`).
//
// Separation: each bird's (y, spawn-stagger) is chosen by rejection sampling (`tryPlaceBird`)
// against every currently-live bird (`liveBirdsRef`) and every bird already placed earlier in the
// same flock, so no two same-direction birds that could be on screen together ever end up within
// `SEPARATION_Y`/`SEPARATION_X` px of each other — a bird that can't find a clear slot within
// `PLACEMENT_TRIES` tries is skipped rather than placed overlapping (§3).
//
// Sprite sheet (obs-scene-element-plan.md §3/§6): `birds.png` is a rebuilt sheet of `frames`
// equal cells (assets.ts — the raw AI delivery was not on a uniform grid; see the comment there).
// `assets.ts`'s `birds.frames` (read here — never hard-coded) is combined with PERCENTAGE
// `background-position-x` stepping: percentages address "cell i of n" as a fraction of the sheet's
// own width, with no dependency on the cell being an integer number of pixels wide.
//
// The frame math, worked out for n = 8 (BirdsEffect.css's `--scene-bird-frames`/
// `--scene-bird-flap-steps` custom properties, set below):
//   - `background-size: calc(n * 100%) 100%` = 800% 100% — the sheet is stretched to 8x the div's
//     own width (so each of the 8 equal-width slices of the STRETCHED image is exactly one frame),
//     height untouched.
//   - `background-position-x` at P% shifts the (oversized) image left by
//     (backgroundAreaWidth - backgroundImageWidth) * P/100 = (W - 8W) * P/100 = -7W * (P/100), W
//     being the div's own width. Frame i (0-indexed, i = 0..7) must sit flush with the div's left
//     edge, i.e. shifted left by exactly `i * W` — solving `-7W * (P/100) = -i*W` gives
//     `P = i * 100 / (n - 1) = i * 100 / 7`. So the 8 frame stops are:
//       i=0: 0%        i=1: 14.2857%   i=2: 28.5714%   i=3: 42.8571%
//       i=4: 57.1429%  i=5: 71.4286%   i=6: 85.7143%   i=7: 100%
//     — exactly 8 equally-spaced values spanning [0%, 100%], both endpoints included.
//   - A `background-position-x` keyframe running linearly from 0% to 100% therefore sweeps through
//     every one of those 8 stops if, and only if, it is quantized to land on each one — that's what
//     `animation-timing-function: steps(n, jump-none)` = `steps(8, jump-none)` does. Per the CSS
//     Easing spec, `steps(k, jump-none)` produces exactly k OUTPUT VALUES at i / (k - 1) for
//     i = 0..k-1 (both endpoints included), so k must equal the number of frames, n = 8, to hit
//     i * 100 / 7 for i = 0..7. (An earlier build used `steps(n - 1, jump-none)`: that yields only
//     7 values at i / 6, so every stop after the first sat ~1/3 of a frame off the cell boundary
//     — verified in Chrome, where the computed position stepped 0% -> 16.67% -> 33.33% ...)

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Box, SceneEffect } from '../../../../schema'
import type { EffectProps } from '../../effectRegistry'
import { SCENE_ASSETS } from '../../assets'
import './BirdsEffect.css'

type BirdsEffectProps = EffectProps<Extract<SceneEffect, { id: 'birds' }>>

// Same custom-property escape hatch every other scene effect stylesheet uses — CSSProperties'
// index signature doesn't allow arbitrary `--*` keys.
type Style = CSSProperties & Record<string, string | number>

type Direction = 'right' | 'left'

// §6: "the rendered height H = 0.09 * box.w" — named per the task spec so the factor is never
// re-typed at a call site.
const BIRD_HEIGHT_FACTOR = 0.09

const DEPTH_SCALE_MIN = 0.3
const DEPTH_SCALE_MAX = 0.7

const FLAP_SEC_MIN = 1
const FLAP_SEC_MAX = 1.6

const FLIGHT_SEC_MIN = 12
const FLIGHT_SEC_MAX = 20

// Speed modulation (obs-scene-element-plan.md §6 "Speed modulation" note): forward speed along the
// flight path is slaved to the wing-flap cycle instead of being constant. `SPEED_MIN_FACTOR` is the
// trough speed (as a fraction of base) reached at the end of the glide; `SPEED_RESTORE_FRAME` is
// the 0-based sprite-sheet frame index (out of `assets.ts`'s `birds.frames`) at which speed snaps
// back to full — the front-view/downstroke frame. Both are read by `buildFlightPoints` below; never
// hard-code 10 or 0.5 in its place.
const SPEED_MIN_FACTOR = 1
const SPEED_RESTORE_FRAME = 5

const FLOCK_STAGGER_MS_MAX = 1500 // widened from 600ms — gives the placement sampler more room to find non-overlapping start times
const Y_JITTER_PCT = 3 // curve wiggle around a bird's chosen flight line, and its first placement try's depth-bias jitter (§6)

// Guaranteed-separation placement (design doc requirement, not §6): two same-direction birds that
// could be visible at the same time must never end up closer than this.
const SEPARATION_Y_FACTOR = 0.9 // min vertical gap between two birds' centre lines, as a multiple of the taller bird's height
const SEPARATION_X_FACTOR = 1.5 // min horizontal gap (at any shared instant) as a multiple of the wider bird's width
const PLACEMENT_TRIES = 24 // random (y, stagger) samples tried per bird before it is skipped rather than placed overlapping

const INITIAL_SPAWN_DELAY_MS = 2000 // §6: "first flock spawns 2s after mount"
const INTERVAL_JITTER_MIN = 0.7 // §6: "± 30 % jitter"
const INTERVAL_JITTER_MAX = 1.3
// Safety margin added on top of a bird's own animation duration for its fallback removal timer
// (§6's "or a timeout equal to its duration as a fallback") — covers the fixed spawn/flap timer
// overhead so the timeout never fires a hair before `animationend` would have.
const REMOVAL_TIMEOUT_SLACK_MS = 500

// Feature-detected once, at module scope, exactly like every other module-level constant in this
// element family — never recomputed per bird/per render. This module only ever renders bird DOM
// nodes from inside a `setTimeout` scheduled after mount (see the spawn effect below), so there is
// no SSR/hydration mismatch risk from this being environment-dependent: the server-rendered (and
// first client) pass always has zero birds regardless of which branch this resolves to.
const SUPPORTS_OFFSET_PATH = (() => {
    try {
        return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('offset-path', 'path("M0 0")')
    } catch {
        return false
    }
})()

function randRange(min: number, max: number): number {
    return min + Math.random() * (max - min)
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v))
}

// One cubic bezier point, `t` in [0, 1] — used by the `offset-path`-unsupported fallback to derive
// each speed-profile keyframe's (x, y) waypoint from the same curve the primary `offset-path` uses
// (`t` = the keyframe's path-fraction `position`, from `buildFlightPoints`), so the two code paths
// trace visually identical flights.
function cubicAt(t: number, p0: number, p1: number, p2: number, p3: number): number {
    const mt = 1 - t
    return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3
}

type FlightPoint = { offset: number; position: number; easing?: string }

// A cycle's decelerating half (frames 0..SPEED_RESTORE_FRAME-1) is a linearly-decreasing-velocity
// glide (1.0 -> SPEED_MIN_FACTOR); integrating a linear velocity gives a downward-parabola position
// curve. A cubic-bezier easing is tuned to the SAME start/end tangents as that parabola — since the
// average slope of any such curve over [0,1] is always 1, matching just the two endpoint slopes
// pins the bezier without a lookup table:
//   s0 = 2 / (1 + m)      — initial slope (m = SPEED_MIN_FACTOR)
//   s1 = 2m / (1 + m)     — final slope
// Control points sit at x = 1/3, 2/3 (evenly spaced) with y chosen to hit those tangents
// (tangent-at-origin of a cubic bezier is y1/x1; tangent-at-end is (1-y2)/(1-x2)).
function buildDecelEasing(m: number): string {
    const s0 = 2 / (1 + m)
    const s1 = (2 * m) / (1 + m)
    const y1 = s0 / 3
    const y2 = 1 - s1 / 3
    return `cubic-bezier(${(1 / 3).toFixed(4)}, ${y1.toFixed(4)}, ${(2 / 3).toFixed(4)}, ${y2.toFixed(4)})`
}

// Computed once at module scope — depends only on the fixed SPEED_MIN_FACTOR constant, never
// recomputed per bird.
const DECEL_EASING = buildDecelEasing(SPEED_MIN_FACTOR)

const FLIGHT_POINT_EPSILON = 1e-6
// Hard safety net against float edge cases landing exactly on a phase boundary (see the `continue`
// branch below) — a real flight (~29 cycles max) never gets remotely close to this.
const FLIGHT_POINT_MAX_ITERATIONS = 1000

/**
 * Builds a WAAPI keyframe timeline — as abstract `{offset (time fraction 0..1), position (path
 * fraction 0..1)}` points, `easing` on a point describing the segment INTO the NEXT point — for one
 * bird's whole flight, per the "Speed modulation" behaviour (obs-scene-element-plan.md §6): full
 * speed at the start of every flap cycle, decelerating to `SPEED_MIN_FACTOR` * base by the
 * `SPEED_RESTORE_FRAME`-th frame, then snapping back to full speed for the rest of the cycle.
 * `phaseOffsetSec` is the SAME offset used for the flap's negative `animation-delay` (0..flapSec,
 * "seconds already elapsed in the cycle at t=0") — sharing it is what keeps "frame
 * SPEED_RESTORE_FRAME starts" and "speed restores" on the same instant (see `buildBird` below,
 * which derives both from one `flapPhaseDelaySec`). The whole profile is first scaled so the
 * average speed over a cycle equals the old constant (pre-modulation) speed, then the result is
 * re-normalised so `position` reaches exactly 1 at `offset` 1 (durationSec) — the bird still
 * crosses the full path in `durationSec` regardless of how many whole/partial cycles fit in it.
 */
function buildFlightPoints(durationSec: number, flapSec: number, phaseOffsetSec: number, frames: number): FlightPoint[] {
    const restoreFraction = clamp(SPEED_RESTORE_FRAME / Math.max(1, frames), 0.01, 0.99)
    const restoreSec = restoreFraction * flapSec
    const avgFactor = restoreFraction * ((1 + SPEED_MIN_FACTOR) / 2) + (1 - restoreFraction) * 1
    const speedUnit = 1 / durationSec // path-fraction/sec the old constant-speed flight used
    const fullSpeed = speedUnit / avgFactor
    const minSpeed = SPEED_MIN_FACTOR * fullSpeed

    const points: FlightPoint[] = [{ offset: 0, position: 0 }]
    let t = 0
    let cumulative = 0
    let cycleT = phaseOffsetSec % flapSec // position within the (possibly pre-mount) flap cycle at t=0

    let iterations = 0
    while (t < durationSec - FLIGHT_POINT_EPSILON && iterations < FLIGHT_POINT_MAX_ITERATIONS) {
        iterations += 1
        const inDecel = cycleT < restoreSec
        const phaseEndCycleT = inDecel ? restoreSec : flapSec
        const segDuration = phaseEndCycleT - cycleT
        const nextT = Math.min(t + segDuration, durationSec)
        const actualDuration = nextT - t

        if (actualDuration <= FLIGHT_POINT_EPSILON) {
            // Boundary landed exactly on a phase edge (float edge case) — flip phase, no new point.
            cycleT = phaseEndCycleT % flapSec
            continue
        }

        let segDistance: number
        if (inDecel) {
            const speedAtStart = fullSpeed - (fullSpeed - minSpeed) * (cycleT / restoreSec)
            const speedAtEnd = fullSpeed - (fullSpeed - minSpeed) * ((cycleT + actualDuration) / restoreSec)
            segDistance = ((speedAtStart + speedAtEnd) / 2) * actualDuration
        } else {
            segDistance = fullSpeed * actualDuration
        }

        cumulative += segDistance
        points[points.length - 1].easing = inDecel ? DECEL_EASING : 'linear'
        points.push({ offset: nextT / durationSec, position: cumulative })

        t = nextT
        cycleT = t >= durationSec ? phaseEndCycleT : (cycleT + actualDuration) % flapSec
    }

    // Normalise so the total reaches exactly 1 (100%) at offset 1 — see the function doc above.
    const total = points[points.length - 1].position || 1
    for (const p of points) p.position /= total
    const last = points[points.length - 1]
    last.offset = 1
    last.position = 1
    return points
}

function flightPointsToOffsetDistanceKeyframes(points: FlightPoint[]): Keyframe[] {
    return points.map((p) => ({
        offsetDistance: `${(p.position * 100).toFixed(4)}%`,
        offset: p.offset,
        easing: p.easing,
    }))
}

function flightPointsToTransformKeyframes(
    points: FlightPoint[],
    startX: number,
    c1X: number,
    c2X: number,
    endX: number,
    startY: number,
    c1Y: number,
    c2Y: number,
    endY: number
): Keyframe[] {
    return points.map((p) => ({
        transform: `translate(${cubicAt(p.position, startX, c1X, c2X, endX).toFixed(2)}px, ${cubicAt(p.position, startY, c1Y, c2Y, endY).toFixed(2)}px)`,
        offset: p.offset,
        easing: p.easing,
    }))
}

type Bird = {
    key: string
    outerStyle: Style
    innerStyle: Style
    flightKeyframes: Keyframe[] // WAAPI timeline for the outer path div — see `buildFlightPoints`
    durationSec: number // WAAPI animation `duration` (ms after *1000) — the mount effect's basis
    staggerMs: number // WAAPI animation `delay` — the mount effect's basis
    totalDurationMs: number // stagger delay + flight duration — the fallback removal timer's basis
}

// Bookkeeping for one alive bird (spawned, not yet finished/removed), enough to run the separation
// checks against future placements without re-deriving anything from its (already-built) styles.
// `yCenterPx`/`startX`/`endX` describe the flight's straight start->end line — the S-curve's control
// points bow off that line a little, which the linear approximation in `isTooClose` intentionally
// ignores (design doc: "acceptable to approximate the flight as linear").
type LiveBird = {
    key: string
    direction: Direction
    yCenterPx: number
    heightPx: number
    widthPx: number
    startTimeMs: number // performance.now() at animation start, i.e. spawn time + staggerMs
    durationSec: number
    startX: number
    endX: number
}

let birdSeq = 0

// Everything about a bird that does NOT depend on where/when it ends up flying — rolled once per
// bird slot, then handed to `tryPlaceBird` (which may need to re-sample y/stagger several times
// for the SAME physical bird) and finally to `finalizeBird`.
type BirdPhysicals = {
    direction: Direction
    depthT: number // 0 (far/small) .. 1 (near/large) — see `rollBirdPhysicals`
    height: number
    width: number
    durationSec: number
    flapSec: number
    flapPhaseDelaySec: number
    phaseOffsetSec: number
    frames: number
    startX: number
    endX: number
}

function rollBirdPhysicals(box: Box, direction: Direction): BirdPhysicals {
    const asset = SCENE_ASSETS.birds
    const frames = asset.frames ?? 1
    const cellAspect = asset.w / frames / asset.h // width:height of one sprite-sheet cell

    // Depth cue (§6): 0.5..1.0 scale, smaller birds read as farther away.
    const depthScale = randRange(DEPTH_SCALE_MIN, DEPTH_SCALE_MAX)
    const depthT = (depthScale - DEPTH_SCALE_MIN) / (DEPTH_SCALE_MAX - DEPTH_SCALE_MIN)

    const height = BIRD_HEIGHT_FACTOR * box.w * depthScale
    const width = height * cellAspect
    // §6: "smaller birds get Y nearer yMin and the longer durations" — far/small birds (low
    // depthT) fly high in the band and slowly; near/large birds (high depthT) fly low and fast.
    const durationSec = FLIGHT_SEC_MAX - depthT * (FLIGHT_SEC_MAX - FLIGHT_SEC_MIN)

    const offLeftX = -width
    const offRightX = box.w + width
    const startX = direction === 'right' ? offLeftX : offRightX
    const endX = direction === 'right' ? offRightX : offLeftX

    const flapSec = randRange(FLAP_SEC_MIN, FLAP_SEC_MAX)
    // Negative delay starts the flap mid-cycle immediately (rather than every bird beginning frame
    // 0 in lockstep), which is what makes flap cycles read as desynchronised from the first frame.
    const flapPhaseDelaySec = -randRange(0, flapSec)
    // Same offset, sign-flipped into "seconds already elapsed in the cycle at t=0" — fed to
    // `buildFlightPoints` so the speed profile shares the flap's phase exactly (Speed modulation,
    // §6's synchronisation requirement).
    const phaseOffsetSec = -flapPhaseDelaySec

    return { direction, depthT, height, width, durationSec, flapSec, flapPhaseDelaySec, phaseOffsetSec, frames, startX, endX }
}

// Linear-flight approximation of a bird's x position (box px) at absolute time `tMs`, clamped to
// the [start, start+duration] window (so a not-yet-started or already-finished bird reads as
// parked at its off-screen start/end point rather than extrapolating past it).
function birdXAt(startX: number, endX: number, startTimeMs: number, durationSec: number, tMs: number): number {
    const progress = clamp((tMs - startTimeMs) / (durationSec * 1000), 0, 1)
    return startX + (endX - startX) * progress
}

// Separation rule: TRUE only when the candidate and `other` (a) could be on screen at the same
// instant, (b) fly close enough vertically (< SEPARATION_Y of the taller bird's height), AND (c)
// come within SEPARATION_X horizontally at the candidate's start/mid/end sample times. Birds
// flying opposite directions are exempt entirely — their one path crossing is a natural, brief
// pass-by rather than an overlap (design doc: "they pass, that looks natural").
function isTooClose(candidate: LiveBird, other: LiveBird): boolean {
    if (candidate.direction !== other.direction) return false

    const candEndMs = candidate.startTimeMs + candidate.durationSec * 1000
    const otherEndMs = other.startTimeMs + other.durationSec * 1000
    if (candEndMs < other.startTimeMs || otherEndMs < candidate.startTimeMs) return false // never on screen together

    const heightMax = Math.max(candidate.heightPx, other.heightPx)
    if (Math.abs(candidate.yCenterPx - other.yCenterPx) >= SEPARATION_Y_FACTOR * heightMax) return false

    const widthMax = Math.max(candidate.widthPx, other.widthPx)
    const sepX = SEPARATION_X_FACTOR * widthMax
    const sampleTimes = [candidate.startTimeMs, candidate.startTimeMs + (candidate.durationSec * 1000) / 2, candEndMs]
    return sampleTimes.some(
        (t) =>
            Math.abs(
                birdXAt(candidate.startX, candidate.endX, candidate.startTimeMs, candidate.durationSec, t) -
                    birdXAt(other.startX, other.endX, other.startTimeMs, other.durationSec, t)
            ) < sepX
    )
}

// Rejection sampling (design doc §3): tries up to PLACEMENT_TRIES random (y, stagger) pairs and
// accepts the first that isn't `isTooClose` to any bird in `occupied` (already-live birds plus
// birds already placed earlier in this same flock). Returns null — "skip this bird" — if none of
// the tries clears every occupant.
function tryPlaceBird(
    physicals: BirdPhysicals,
    box: Box,
    yMin: number,
    yMax: number,
    nowMs: number,
    occupied: LiveBird[]
): { yPct: number; yCenterPx: number; staggerMs: number; startTimeMs: number } | null {
    const baseYPct = yMin + physicals.depthT * (yMax - yMin)

    for (let attempt = 0; attempt < PLACEMENT_TRIES; attempt += 1) {
        // First try keeps the original small depth-biased jitter (§6's depth cue); later tries widen
        // to the full band so a busy band still has somewhere left to search — the band constraint
        // (not the depth bias) is what actually has to hold.
        const yPct = attempt === 0 ? clamp(baseYPct + randRange(-Y_JITTER_PCT, Y_JITTER_PCT), yMin, yMax) : randRange(yMin, yMax)
        const staggerMs = randRange(0, FLOCK_STAGGER_MS_MAX)
        const startTimeMs = nowMs + staggerMs
        const yCenterPx = (yPct / 100) * box.h

        const candidate: LiveBird = {
            key: '',
            direction: physicals.direction,
            yCenterPx,
            heightPx: physicals.height,
            widthPx: physicals.width,
            startTimeMs,
            durationSec: physicals.durationSec,
            startX: physicals.startX,
            endX: physicals.endX,
        }

        if (!occupied.some((other) => isTooClose(candidate, other))) {
            return { yPct, yCenterPx, staggerMs, startTimeMs }
        }
    }

    return null // §3: skip this bird rather than force an overlapping placement
}

function finalizeBird(box: Box, physicals: BirdPhysicals, yMin: number, yMax: number, yPct: number, staggerMs: number): Bird {
    const { direction, height, width, durationSec, flapSec, flapPhaseDelaySec, phaseOffsetSec, frames, startX, endX } = physicals

    // Curve wiggle around the chosen flight line, clamped back into the configured band — when
    // yMin === yMax the clamp collapses this back to exactly that one value, which is what keeps
    // "every bird flies at the same height" true for that degenerate band (§6's Test list).
    const c1YPct = clamp(yPct + randRange(-Y_JITTER_PCT, Y_JITTER_PCT), yMin, yMax)
    const c2YPct = clamp(yPct + randRange(-Y_JITTER_PCT, Y_JITTER_PCT), yMin, yMax)

    const c1X = startX + (endX - startX) / 3
    const c2X = startX + (endX - startX) * (2 / 3)

    const toY = (pct: number) => (pct / 100) * box.h
    const startY = toY(yPct)
    const c1Y = toY(c1YPct)
    const c2Y = toY(c2YPct)
    const endY = toY(yPct)

    const flightPoints = buildFlightPoints(durationSec, flapSec, phaseOffsetSec, frames)

    const outerStyle: Style = {
        width,
        height,
    }

    let flightKeyframes: Keyframe[]

    if (SUPPORTS_OFFSET_PATH) {
        outerStyle.offsetPath = `path("M ${startX} ${startY} C ${c1X} ${c1Y}, ${c2X} ${c2Y}, ${endX} ${endY}")`
        outerStyle.offsetRotate = '0deg'
        outerStyle.offsetAnchor = '0% 0%'
        outerStyle.offsetDistance = '0%' // base value, matches flightPoints[0] — no pre-WAAPI flash
        flightKeyframes = flightPointsToOffsetDistanceKeyframes(flightPoints)
    } else {
        // Fallback (§6/§4's "both paths must keep transform/offset-distance as the only animated
        // properties"): each flight-point's (x, y) is read off the SAME cubic curve `offset-path`
        // would have used, via `cubicAt` — one `translate()` waypoint per speed-profile keyframe
        // rather than the old fixed start/mid/end trio. Base `transform` matches flightPoints[0]
        // (the start point) so there's no flash before the mount effect's WAAPI call attaches.
        outerStyle.transform = `translate(${startX}px, ${startY}px)`
        flightKeyframes = flightPointsToTransformKeyframes(flightPoints, startX, c1X, c2X, endX, startY, c1Y, c2Y, endY)
    }

    const innerStyle: Style = {
        backgroundImage: `url(${SCENE_ASSETS.birds.src})`,
        '--scene-bird-frames': frames,
        '--scene-bird-flap-steps': Math.max(1, frames),
        animationDuration: `${flapSec}s`,
        animationDelay: `${flapPhaseDelaySec}s`,
        transform: `scaleX(${direction === 'left' ? -1 : 1})`,
    }

    birdSeq += 1
    return {
        key: `bird-${birdSeq}`,
        outerStyle,
        innerStyle,
        flightKeyframes,
        durationSec,
        staggerMs,
        totalDurationMs: staggerMs + durationSec * 1000,
    }
}

export function BirdsEffect({ box, effect, quality }: BirdsEffectProps) {
    const [birds, setBirds] = useState<Bird[]>([])

    // Latest-value refs (obs-scene-element-plan.md §5's `LightningEffect` pattern extended): the
    // spawn timer chain below only RESTARTS on `intervalSec`/`countMin`/`countMax`/`quality` change (§6), but a
    // live `yMin`/`yMax`/box-resize edit must still be picked up by the NEXT scheduled spawn
    // without tearing down the whole chain (which would also reset the 2s "just mounted" delay).
    const boxRef = useRef(box)
    boxRef.current = box
    const effectRef = useRef(effect)
    effectRef.current = effect

    const removalTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())

    // Every currently-alive bird (spawned, not yet finished/removed) keyed by `Bird.key` — the
    // occupancy set the placement sampler checks new candidates against. Added in `spawnFlock` right
    // after a placement is accepted; removed here in `removeBird`, which is the single funnel for
    // BOTH removal paths (`BirdView`'s `animation.onfinish` and the fallback timeout below), so every
    // add always has exactly one matching delete regardless of which path fires first.
    const liveBirdsRef = useRef<Map<string, LiveBird>>(new Map())

    const removeBird = useCallback((key: string) => {
        liveBirdsRef.current.delete(key)
        setBirds((prev) => prev.filter((b) => b.key !== key))
    }, [])

    const spawnFlock = useCallback(
        (flockCount: number, direction: Direction) => {
            const currentBox = boxRef.current
            const { yMin, yMax } = effectRef.current
            const nowMs = performance.now()

            // §3 Placement by rejection sampling: each bird is rolled (physicals), then placed against
            // every bird already alive PLUS every bird already placed earlier in this same flock — so
            // two birds within one flock can never collide with each other either. A bird that can't
            // find a clear (y, stagger) within PLACEMENT_TRIES tries is skipped (never force-placed).
            const alreadyLive = Array.from(liveBirdsRef.current.values())
            const placedThisFlock: LiveBird[] = []
            const newBirds: Bird[] = []

            for (let i = 0; i < flockCount; i += 1) {
                const physicals = rollBirdPhysicals(currentBox, direction)
                const placement = tryPlaceBird(physicals, currentBox, yMin, yMax, nowMs, [...alreadyLive, ...placedThisFlock])
                if (!placement) continue // skip — no clear slot found

                const bird = finalizeBird(currentBox, physicals, yMin, yMax, placement.yPct, placement.staggerMs)
                newBirds.push(bird)

                const liveBird: LiveBird = {
                    key: bird.key,
                    direction,
                    yCenterPx: placement.yCenterPx,
                    heightPx: physicals.height,
                    widthPx: physicals.width,
                    startTimeMs: placement.startTimeMs,
                    durationSec: physicals.durationSec,
                    startX: physicals.startX,
                    endX: physicals.endX,
                }
                placedThisFlock.push(liveBird)
                liveBirdsRef.current.set(bird.key, liveBird)
            }

            if (newBirds.length === 0) return

            setBirds((prev) => [...prev, ...newBirds])

            for (const bird of newBirds) {
                const timeoutId = setTimeout(() => {
                    removalTimeoutsRef.current.delete(timeoutId)
                    removeBird(bird.key)
                }, bird.totalDurationMs + REMOVAL_TIMEOUT_SLACK_MS)
                removalTimeoutsRef.current.add(timeoutId)
            }
        },
        [removeBird]
    )

    // The spawn timer chain (§6: "spawn timer as a setTimeout chain with jitter … cleared on
    // unmount and when intervalSec/countMin/countMax/quality change"). A plain `setTimeout` chain (not
    // `setInterval`) so re-jittering after every flock never drifts onto a fixed grid.
    useEffect(() => {
        let cancelled = false
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        let flockIndex = 0

        function scheduleNext(delayMs: number) {
            timeoutId = setTimeout(() => {
                if (cancelled) return
                // Flock size re-rolled per flock, integer in [countMin, countMax] inclusive; `reduced`
                // halves it (rounded up, so a 1-bird flock stays 1).
                const lo = Math.min(effect.countMin, effect.countMax)
                const hi = Math.max(effect.countMin, effect.countMax)
                const rolled = lo + Math.floor(Math.random() * (hi - lo + 1))
                const flockCount = quality === 'reduced' ? Math.ceil(rolled / 2) : rolled
                // Alternate flock direction (§6); a left-flying flock's path is built right-to-left
                // and its sprite mirrored, both handled inside `rollBirdPhysicals`/`finalizeBird`.
                const direction: Direction = flockIndex % 2 === 0 ? 'right' : 'left'
                flockIndex += 1
                spawnFlock(flockCount, direction)
                scheduleNext(effect.intervalSec * 1000 * randRange(INTERVAL_JITTER_MIN, INTERVAL_JITTER_MAX))
            }, delayMs)
        }

        scheduleNext(INITIAL_SPAWN_DELAY_MS)

        return () => {
            cancelled = true
            if (timeoutId !== null) clearTimeout(timeoutId)
        }
    }, [effect.intervalSec, effect.countMin, effect.countMax, quality, spawnFlock])

    // Unmount-only cleanup for every still-pending per-bird removal timeout — the spawn effect's
    // own cleanup above only ever cancels the SPAWN chain, never these. The ref's Set object
    // identity never changes (it is created once, in the initial `useRef` call, and only ever
    // mutated in place), so capturing it here is capturing the SAME live Set the rest of this
    // component keeps adding to/deleting from — not a stale snapshot. `liveBirdsRef` is cleared the
    // same way so no bird can be seen as "still alive" past unmount (harmless in practice, since the
    // whole ref is discarded with the component, but keeps the invariant explicit).
    useEffect(() => {
        const pendingTimeouts = removalTimeoutsRef.current
        const liveBirds = liveBirdsRef.current
        return () => {
            pendingTimeouts.forEach((timeoutId) => clearTimeout(timeoutId))
            pendingTimeouts.clear()
            liveBirds.clear()
        }
    }, [])

    return (
        <>
            {birds.map((bird) => (
                <BirdView key={bird.key} bird={bird} onDone={removeBird} />
            ))}
        </>
    )
}

// One bird's whole speed-modulated flight timeline (`bird.flightKeyframes`, from `buildBird` ->
// `buildFlightPoints`) is handed to the Web Animations API here rather than a CSS `@keyframes`
// rule, since a single CSS keyframe list can't vary its easing per flap cycle the way per-cycle
// deceleration/restore does. `bird` is immutable for the component's whole life (a fresh React key
// per flock member, from `buildBird`'s `birdSeq`) so this effect's empty-ish `[bird, onDone]` deps
// only ever re-run for the SAME bird if `onDone` identity changes (it doesn't — `removeBird` is a
// stable `useCallback`), making this effectively a mount/unmount pair. `animation.cancel()` on
// cleanup is the "cancel on unmount" requirement (also covers React StrictMode's dev
// mount-unmount-remount); `animation.onfinish` (in place of the old `animationend` DOM event, which
// WAAPI's `Element.animate()` does not dispatch) is the primary removal trigger, with the parent's
// `setTimeout` in `spawnFlock` still standing by as the fallback.
function BirdView({ bird, onDone }: { bird: Bird; onDone: (key: string) => void }) {
    const elRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => {
        const el = elRef.current
        if (!el) return undefined

        const animation = el.animate(bird.flightKeyframes, {
            duration: bird.durationSec * 1000,
            delay: bird.staggerMs,
            iterations: 1,
            fill: 'both',
            easing: 'linear', // overridden per-segment by each keyframe's own `easing` (see above)
        })
        animation.onfinish = () => onDone(bird.key)

        return () => animation.cancel()
    }, [bird, onDone])

    return (
        <div ref={elRef} className="scene-bird" style={bird.outerStyle}>
            <div className="scene-bird-sprite" style={bird.innerStyle} />
        </div>
    )
}

export default BirdsEffect
