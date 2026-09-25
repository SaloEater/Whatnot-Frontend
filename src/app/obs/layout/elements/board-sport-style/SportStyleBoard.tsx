'use client'

// The `board:sport_style` registry component (sport-style-board-plan.md §4). The football-field
// background/lines from /obs/setup/sport_style/board (fieldGeometry.ts/turfTexture.ts) with every
// slot drawn as the patch cell from /obs/setup/sport_style/team (PatchCell.tsx) — a live patch for
// an unsold slot, the `sold` grey imprint (sport-style-sold-cell-plan.md) for a sold one. Every
// shared module lives at src/app/obs/sport_style/ (moved there in this same change, plan §1) so
// this component and the two playgrounds render from identical code.
//
// Geometry (plan §4.2): the operator tunes only the box WIDTH and `cols` (cells per row) —
// height/cell-size are derived. `cellPx` is floored from the box width the same way the playground
// derives it, `fieldH` is then `rows*cellPx + 2*edgeGap`, and `fieldGeometry()` is called with
// `boxH: fieldH` so its own `min()` picks the same width-driven `cellPx` and lands `gridTop` at
// exactly `edgeGap` — the field is self-consistent with no change needed to fieldGeometry.ts
// itself. The field block is vertically centred in the box; if `box.h` is shorter than `fieldH` it
// is simply clipped by the layout page's ElementFrame (the settings panel's Fit height button,
// SportStyleBoardSettings.tsx, resizes the box to match).
//
// Slot order (plan §4.2, R1 fix 2, R3.3): TWO operator-chosen `sortMode`s, both dealt into the same
// `cols`-wide grid and both producing `ceil(n/cols)` rows (so `fieldH`/Fit height never depend on
// which mode is active):
//   - 'alphabetical' (default) — cells grouped by `hasLogo` (same test used for the logo itself):
//     real teams first, custom spots after; each group ordered by `team.localeCompare`, then
//     `event.id`; dealt left-to-right/top-to-bottom by plain `idx % cols` / `idx / cols` arithmetic,
//     same as before R3 (which dealt by `event.id` alone — R3.3 calls that "not actually
//     alphabetical" and fixes it). A sold slot keeps its position (the imprint IS the point),
//     nothing re-flows on a sale.
//   - 'centered' — value radiates from the board's CENTRE in three zones (`layoutCentred`,
//     obs/sport_style/centreLayout.ts): cobra_flat's value order (`sortCells`,
//     board-cobra-flat/layout.ts) is reused — with real-logo teams stably pulled ahead of custom
//     spots — but every slot in the whole grid is ranked zone-first (interior-rows × middle-columns,
//     then edge-rows × middle-columns, then everywhere else), then by 2-D distance from the board's
//     centre within a zone, and dealt from that order, so sold cells and custom spots (last in that
//     order) land at the corners/edges. See centreLayout.ts's header for the zone boundaries and a
//     worked example. Rows are FULL from the top (`cols` cells) with only the LAST row short
//     (`ceil(n / cols)` rows total), unlike `splitRows`'s balanced rows. CONSEQUENCE, accepted (plan
//     R3.3): a sale DOES re-flow this board, unlike alphabetical.
// The turf/black-field choice is driven by `edgeMode`, not `sortMode` (task spec part 1): in
// `edgeMode: 'tiered'` the turf is not painted and every white line (strips/ticks/border) is hidden
// too — the field is a flat black fill instead (see the turf effect, `.sps-field-black`, and the
// `.sps-clip-lines`/`.sps-border` guards below) so the neon tier skins read clearly against a plain
// backdrop. `edgeMode: 'plain'` always paints turf, including in 'centered' sortMode.
// Either way, a short last row is CENTRED CELL-WISE (R1 fix 2, revised): it is shifted right by
// `floor((cols - rowLen) / 2)` WHOLE cells, so its cells still sit on the same column formation
// (and column strips) as every other row — only the middle columns are occupied; with an odd number
// of empty cells the extra one is on the right. `rowLen` is that row's own cell count (`cols` for
// every row but possibly the last).
//
// Per-cell placement (R1 fix 1): the patch is centred inside its own `cellPx × cellPx` footprint on
// both axes, not flush with the seam-derived `cellBox` margin fieldGeometry.ts computes — see the
// `x`/`y` maths in the render below.
//
// Palette (plan §4.3): each cell loads its team's palette lazily via `useTeamPalette` (module-level
// cache, teamPalette.ts) and draws with the fallback background until it resolves — no layout
// shift, since cell size is geometry-driven, not palette-driven. R1 fix 4: a spot whose name isn't
// a real team never attempts a palette load at all (`useTeamPalette` returns `null` immediately)
// and draws an initials label instead of a logo — see `SportStyleCell` below.
//
// Randomness (plan §4.4, R1 fix 6): TWO module-level seeds, `seeds.turf`/`seeds.wear`, each rolled
// once per page load (not per mount) — a stage switch or element remount keeps the same field and
// wear, a reload gives new ones. A `seed` inside a pasted turf recipe is ignored on purpose. Either
// seed can be re-rolled independently, without a reload, via a `sport-style-regenerate` transient
// cue fired by the settings panel's "Regenerate turf"/"Regenerate teams" buttons — every mounted
// board subscribes to the cue bus and bumps its own render-forcing counter on a match.

import {useEffect, useMemo, useRef, useState} from 'react'
import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import {useCueBus} from '../../cueBus'
import {usePublishAnchors} from '../../anchors'
import type {Event} from '@/app/entity/entities'
import {TeamIconSrc} from '@/app/common/teams'
import {getSpotAbbreviation} from '@/app/common/spot_label'
import {fieldGeometry} from '@/app/obs/sport_style/fieldGeometry'
import {renderTurf} from '@/app/obs/sport_style/turfTexture'
import PatchCell, {type GeneralSettings, type PatchStyle} from '@/app/obs/sport_style/PatchCell'
import {mix, resolveStitch, type RGB} from '@/app/obs/sport_style/patchColors'
import {wearParamsFor} from '@/app/obs/sport_style/wearRandom'
import {hasLogo, useTeamPalette} from '@/app/obs/sport_style/teamPalette'
import {patchSizeFor, scalePatchStyle} from '@/app/obs/sport_style/scalePatchStyle'
import {DEFAULT_COLS, DEFAULT_PATCH, DEFAULT_TURF, FIELD, PATCH_REFERENCE_SIZE} from '@/app/obs/sport_style/fieldConstants'
import {EDGE_TIER_BY_TIER, type EdgeTier} from '@/app/obs/sport_style/tierSkins'
import {
    assignTiers,
    BEST_THRESHOLD,
    DEFAULT_PRICE,
    GOOD_THRESHOLD,
    MID_THRESHOLD,
    type TeamCell,
    type Tier,
} from '../board-cobra/pricing'
import type {FlatCell} from '../board-cobra-flat/layout'
import {layoutCentred} from '@/app/obs/sport_style/centreLayout'
import './SportStyleBoard.css'

function rollSeed(): number {
    return Math.floor(Math.random() * 2 ** 31)
}

// Two independently reroll-able seeds (R1 fix 6, replacing the old single `PAGE_SEED`), both
// randomised once at module load — every mounted instance and every remount reads the same pair
// until either is re-rolled by a `sport-style-regenerate` cue or the page itself reloads.
const seeds = {turf: rollSeed(), wear: rollSeed()}

// Team page's own "no palette yet" fallback (test/team's `effectiveAutoStitch`/`autoBackground`
// defaults) — drawn for a cell whose palette hasn't resolved yet.
const FALLBACK_BACKGROUND: RGB = [40, 40, 40]
const FALLBACK_STITCH: RGB = [230, 230, 230]

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// sport-style-board-plan.md R2.1: elliptical-corner radii for `field`, both whole px, guarded
// against a zero-sized field. Identical to /obs/setup/sport_style/board's own helper (not shared
// via fieldGeometry.ts per the plan's file list for this revision).
function fieldCornerRadii(fieldW: number, fieldH: number, cornerWidth: number, cornerRoundness: number): {rx: number; ry: number} {
    const rx = fieldW > 0 ? Math.min(cornerWidth, Math.floor(fieldW / 2)) : 0
    const ry = fieldH > 0 ? Math.min(Math.round((cornerRoundness * fieldH) / 2), Math.floor(fieldH / 2)) : 0
    return {rx, ry}
}

// R2.2: `inset(top right bottom left round rx / ry)`, `field` expressed as offsets from each edge
// of the `boxW × boxH` reference box (here, the `.sps-inner` block: `innerW × innerH`).
function fieldClipPath(field: {x: number; y: number; w: number; h: number}, boxW: number, boxH: number, rx: number, ry: number): string {
    const top = field.y
    const right = boxW - (field.x + field.w)
    const bottom = boxH - (field.y + field.h)
    const left = field.x
    return `inset(${top}px ${right}px ${bottom}px ${left}px round ${rx}px / ${ry}px)`
}

// `turf = {...DEFAULT_TURF, ...(element.turf as object)}` (plan §4.1) — a shallow merge is enough,
// every `TurfParams`/`enabled` field is a scalar. Never throws on a non-object/malformed value; an
// odd-typed field (e.g. a string where a number belongs) is deliberately NOT validated (plan §5:
// "no content validation") — it rides through as-is and whatever downstream reads it copes or not.
// Widened per R2.4 to carry the three oval-field knobs (`cornerWidth`/`cornerRoundness`/
// `borderWidth`) alongside `enabled`/`edgeGap` — `typeof DEFAULT_TURF` already has them all.
type TurfConfig = typeof DEFAULT_TURF

function mergeTurf(raw: unknown): TurfConfig {
    const partial = isPlainObject(raw) ? (raw as Partial<TurfConfig>) : undefined
    return {...DEFAULT_TURF, ...partial}
}

// `patch = deepMerge(DEFAULT_PATCH, element.patch)` (plan §4.1) — `style` is merged one level down
// so a partial pasted `style` object (e.g. just a couple of tweaked knobs) doesn't wipe every other
// style default; every other top-level key (`mixEnabled`, `stitchMode`, …) is a plain override. Same
// "no content validation" rule as `mergeTurf` above.
function mergePatch(raw: unknown): GeneralSettings {
    const partial = isPlainObject(raw) ? (raw as Partial<GeneralSettings> & {style?: unknown}) : undefined
    const rawStyle = partial?.style
    return {
        ...DEFAULT_PATCH,
        ...partial,
        style: {
            ...DEFAULT_PATCH.style,
            ...(isPlainObject(rawStyle) ? (rawStyle as Partial<PatchStyle>) : {}),
        } as PatchStyle,
    }
}

type CellProps = {
    event: Event
    x: number
    y: number
    patchSize: number
    patch: GeneralSettings
    // R3.2 tiered edge — `undefined` for a plain edge (edgeMode 'plain', or a 'regular'-tier team).
    edgeTier?: EdgeTier
}

/** One patch cell, in its own component so `useTeamPalette` (a hook) can be called once per event
 *  regardless of how many cells the current break has — calling it inline in a `.map()` in the
 *  parent would break the rules of hooks whenever the event count changes between renders. */
function SportStyleCell({event, x, y, patchSize, patch, edgeTier}: CellProps) {
    // R1 fix 4: a spot without real logo art gets an initials label instead — `useTeamPalette`
    // already skips loading an image for one of these (teamPalette.ts), so `palette` naturally
    // stays `null` and the cell falls through to the fallback background/stitch below.
    const withLogo = hasLogo(event.team)
    const palette = useTeamPalette(event.team)
    const sold = event.customer !== ''

    const autoBackground = palette
        ? (patch.mixEnabled ? mix(palette.background, palette.secondary, patch.mixRatio) : palette.background)
        : FALLBACK_BACKGROUND
    const stitch = palette
        ? resolveStitch(patch.stitchMode, palette.candidates, autoBackground, {
              minContrast: patch.stitchMinContrast,
              minLuminance: patch.stitchMinLuminance,
          })
        : FALLBACK_STITCH

    const factor = PATCH_REFERENCE_SIZE > 0 ? patchSize / PATCH_REFERENCE_SIZE : 1
    const wear = wearParamsFor(seeds.wear, event.team)
    const style = scalePatchStyle({...patch.style, ...wear}, factor)
    const label = withLogo ? undefined : getSpotAbbreviation(event.team)

    return (
        <div className="sps-cell" style={{left: x, top: y, width: patchSize, height: patchSize}}>
            <PatchCell
                background={autoBackground}
                stitch={stitch}
                logoSrc={withLogo ? TeamIconSrc(event.team) : ''}
                style={style}
                size={patchSize}
                label={label}
                sold={sold}
                edgeTier={edgeTier}
            />
        </div>
    )
}

export function SportStyleBoard({elementKey, element, box}: ElementProps) {
    const {stream, events: rawEvents, series, priceRanges, teamPrices} = useLayoutData()

    // Only ever rendered for a `board` element (the registry maps this component 1:1 to
    // `board:sport_style`) — narrowed so `cols`/`turf`/`patch` are readable at all, since those
    // fields live only on the `board` branch of the `Element` union.
    const boardElement = element.kind === 'board' ? element : null

    const cols = Math.max(1, Math.round(boardElement?.cols ?? DEFAULT_COLS))
    // R3.4: two selects in SportStyleBoardSettings, no validation — narrowed with defaults exactly
    // like `cols`/`turf`/`patch` above.
    const edgeMode = boardElement?.edgeMode === 'tiered' ? 'tiered' : 'plain'
    const sortMode = boardElement?.sortMode === 'centered' ? 'centered' : 'alphabetical'
    // Two nested insets. `margin` (R1 fix 5, board field, default 0) is a transparent band between
    // the element's edge and the painted field; `edgeGap` (the turf blob's own key, default
    // FIELD.edgeGap) is the field's band between its edge and the outer strips. Within that band,
    // `ticksAreaHeight` (also a turf-blob key, default FIELD.ticksAreaHeight) is how far the column
    // strips extend beyond the outer row strips, where the hash ticks live; `turfMargin` (also a
    // turf-blob key, default FIELD.turfMargin) is how much further the painted turf itself extends
    // beyond that band on every side — same knobs the board playground exports with its recipe.
    const margin = Math.max(0, boardElement?.margin ?? 0)
    const turf = useMemo(() => mergeTurf(boardElement?.turf), [boardElement?.turf])
    const edgeGap = Number.isFinite(turf.edgeGap) ? Math.max(0, turf.edgeGap) : FIELD.edgeGap
    const ticksAreaHeight = Number.isFinite(turf.ticksAreaHeight) ? Math.max(0, turf.ticksAreaHeight) : FIELD.ticksAreaHeight
    const turfMargin = Number.isFinite(turf.turfMargin) ? Math.max(0, turf.turfMargin) : FIELD.turfMargin
    const tickHFactor = Number.isFinite(turf.tickHFactor) ? Math.max(0, turf.tickHFactor) : FIELD.tickHFactor
    const seamTickHFactor = Number.isFinite(turf.seamTickHFactor) ? Math.max(0, turf.seamTickHFactor) : FIELD.seamTickHFactor
    // Whether the interior-row-seam hash ticks (`geometry.seamTicks`) render — a turf-blob boolean,
    // not a `FieldInput`/geometry field (fieldGeometry.ts's header explains why).
    const seamTicksEnabled = typeof turf.seamTicks === 'boolean' ? turf.seamTicks : FIELD.seamTicks
    const patch = useMemo(() => mergePatch(boardElement?.patch), [boardElement?.patch])

    // cobra_flat's rule (plan §4.1): every real slot, sold or not — not cobra's unsold-only view.
    // Order itself is `sortMode`'s job (R3.3, below), not this filter's.
    const events = useMemo(
        () => rawEvents.filter((e) => !e.is_giveaway && !e.note),
        [rawEvents]
    )

    // R3.1 tier assignment — copied verbatim from CobraFlatBoard.tsx (same inputs, same threshold
    // fallbacks) so a team lands on the same tier here as on the cobra boards. Computed always (it's
    // cheap): `edgeMode` decides whether it's DRAWN, `sortMode` whether it ORDERS (plan R3.1).
    const unsoldTeamNames = useMemo(
        () => events.filter((e) => e.customer === '').map((e) => e.team),
        [events]
    )
    const defaultPrice = series?.default_price || DEFAULT_PRICE
    const bestThreshold = priceRanges.find((r) => r.tier_id === 'best')?.price_from ?? BEST_THRESHOLD
    const goodThreshold = priceRanges.find((r) => r.tier_id === 'good')?.price_from ?? GOOD_THRESHOLD
    const midThreshold  = priceRanges.find((r) => r.tier_id === 'mid')?.price_from  ?? MID_THRESHOLD
    const teamCells: TeamCell[] = useMemo(
        () => assignTiers(unsoldTeamNames, teamPrices, defaultPrice, {bestThreshold, goodThreshold, midThreshold}),
        [unsoldTeamNames, teamPrices, defaultPrice, bestThreshold, goodThreshold, midThreshold]
    )
    const tierByTeam = useMemo(() => {
        const m = new Map<string, Tier>()
        for (const c of teamCells) if (!m.has(c.team)) m.set(c.team, c.tier)
        return m
    }, [teamCells])
    const priceLeftByTeam = useMemo(
        () => new Map(teamPrices.map((p) => [p.team, p.price_left])),
        [teamPrices]
    )

    // One placed event per slot: `row`/`col` (0-based within the `cols`-wide grid) plus `rowLen`
    // (that row's own cell count — `cols` for every row but possibly the last), consumed by the
    // render loop below for the same cell-wise last-row centring regardless of `sortMode`.
    type PlacedEvent = {event: Event; row: number; col: number; rowLen: number}
    const placedEvents: PlacedEvent[] = useMemo(() => {
        if (events.length === 0) return []
        const rowCount = Math.ceil(events.length / cols)
        if (sortMode === 'centered') {
            // R3.3 'centered' (reworked) — build FlatCell[], hand it to layoutCentred() (2-D
            // centre-out dealing, sold pushed to the outer edges/corners), then read each
            // PlacedCell's own row/col straight off the result.
            const eventById = new Map(events.map((e) => [e.id, e]))
            const flatCells: FlatCell[] = events.map((e) => ({
                eventId: e.id,
                team: e.team,
                tier: tierByTeam.get(e.team) ?? 'regular',
                sold: e.customer !== '',
                priceLeft: priceLeftByTeam.get(e.team) ?? 0,
            }))
            const placedRows = layoutCentred(flatCells, cols)
            return placedRows.flatMap((row) =>
                row.map((pc) => ({event: eventById.get(pc.cell.eventId)!, row: pc.row, col: pc.col, rowLen: row.length}))
            )
        }
        // R3.3 'alphabetical' (default) — real teams (`hasLogo`, same test used for the logo below)
        // sort first, A→Z by name then event.id; custom spots (no logo) sort after, also A→Z by
        // name then event.id. Dealt left-to-right/top-to-bottom, same fixed positions as before R3
        // (a sold slot never re-flows).
        const ordered = events.slice().sort((a, b) => {
            const aIsTeam = hasLogo(a.team)
            const bIsTeam = hasLogo(b.team)
            if (aIsTeam !== bIsTeam) return aIsTeam ? -1 : 1
            const byName = a.team.localeCompare(b.team)
            return byName !== 0 ? byName : a.id - b.id
        })
        return ordered.map((event, idx) => {
            const row = Math.floor(idx / cols)
            const rowLen = row === rowCount - 1 ? ordered.length - row * cols : cols
            return {event, row, col: idx % cols, rowLen}
        })
    }, [events, cols, sortMode, tierByTeam, priceLeftByTeam])

    const rows = events.length > 0 ? Math.ceil(events.length / cols) : 0
    // The painted field is the box less `margin` on every side; the grid sits `edgeGap` inside that.
    const innerW = Math.max(1, box.w - 2 * margin)
    const cellPx = rows > 0 ? Math.max(1, Math.floor((innerW - 2 * edgeGap) / cols)) : 0
    const innerH = rows > 0 ? rows * cellPx + 2 * edgeGap : 0
    const fieldH = rows > 0 ? innerH + 2 * margin : 0

    const geometry = useMemo(() => {
        if (rows === 0) return null
        const base = {
            boxW: innerW,
            boxH: innerH,
            cols,
            rows,
            edgeGap,
            lineWFactor: FIELD.lineWFactor,
            tickHFactor,
            seamTickHFactor,
            ticksPerColumn: FIELD.ticksPerColumn,
            ticksAreaHeight,
            turfMargin,
        }
        // Probe once for `lineW` (tickW has no effect on lineW/strips), then feed the real tickW
        // in — FIELD.tickWSameAsLine is frozen `true` (fieldConstants.ts), so tickW always equals
        // the probed lineW, same convention the board playground uses for its own default.
        const lineWProbe = fieldGeometry({...base, tickW: 1}).lineW
        return fieldGeometry({...base, tickW: lineWProbe})
    }, [innerW, innerH, cols, rows, edgeGap, ticksAreaHeight, turfMargin, tickHFactor, seamTickHFactor])

    // Every cell shares one padding-derived size (R1 fix 3) — constant across the board, so it's
    // computed once here rather than per cell.
    const patchSize = geometry ? Math.max(1, patchSizeFor(geometry.cellPx, patch.style.padding)) : 0

    const lineColor = `rgba(255,255,255,${FIELD.lineOpacity})`

    // R2.1/R2.2: oval-field shape, computed from the same `geometry.field` the canvas/strips/ticks
    // already use, so the playground and the element render identical shapes for the same recipe.
    const {rx: fieldRx, ry: fieldRy} = geometry
        ? fieldCornerRadii(geometry.field.w, geometry.field.h, turf.cornerWidth, turf.cornerRoundness)
        : {rx: 0, ry: 0}
    const fieldClip = geometry ? fieldClipPath(geometry.field, innerW, innerH, fieldRx, fieldRy) : ''

    // board-anchors-plan.md §3.5: publish two anchors, in CANVAS coordinates, so a boxless overlay
    // (e.g. `animation:stashOrPassSportStyle`) can hug the painted field/grid instead of this
    // element's placement box. The DOM: `.sps-root` (== `box`, centred flex) -> `.sps-field`
    // (`box.w x fieldH`, vertically centred by the flex) -> `.sps-inner` at `(margin, margin)`,
    // `innerW x innerH` -> everything `geometry` computes is relative to `.sps-inner`'s origin.
    // Hooks stay unconditional (rules of hooks) even though this is only meaningful once `geometry`
    // exists — the `rows === 0` branches below publish `{}`, which clears whatever this key had
    // published before (AnchorStore.publish, anchors.tsx).
    // Centred in whole px (not flex centring) so an odd `box.h - fieldH` doesn't land the whole
    // field on a half pixel and soften every patch. May be < box.y if the field overflows the box.
    const fieldOffsetY = Math.floor((box.h - fieldH) / 2)
    const fieldTop = box.y + fieldOffsetY
    const originX = box.x + margin
    const originY = fieldTop + margin
    usePublishAnchors(
        elementKey,
        geometry
            ? {
                  // The painted (clipped) turf area, with its elliptical corners.
                  field: {
                      x: originX + geometry.field.x,
                      y: originY + geometry.field.y,
                      w: geometry.field.w,
                      h: geometry.field.h,
                      rx: fieldRx,
                      ry: fieldRy,
                  },
                  // The cell grid only (inside the edge gap), square. `FieldGeometry` doesn't carry
                  // gridW/gridH as its own fields — derived the same way fieldGeometry.ts computes
                  // them internally (`cols`/`rows` are already in scope above).
                  grid: {
                      x: originX + geometry.gridLeft,
                      y: originY + geometry.gridTop,
                      w: cols * geometry.cellPx,
                      h: rows * geometry.cellPx,
                      rx: 0,
                      ry: 0,
                  },
              }
            : {}
    )

    const canvasRef = useRef<HTMLCanvasElement>(null)
    const turfKey = useMemo(() => JSON.stringify(turf), [turf])
    // Task spec part 1: `edgeMode: 'tiered'` never paints turf, regardless of the recipe's own
    // `enabled` flag — the field is a flat black fill instead (the `.sps-field-black` div below,
    // same clip group as the canvas) so the neon tier skins read against a plain backdrop. This is
    // an `edgeMode` decision, not a `sortMode` one — 'centered' paints turf again like any other mode
    // when `edgeMode` is 'plain'.
    // TEMPORARY (revert me): turf + white lines are forced ON in tiered mode too, to compare the
    // neon tier skins against the football field. Restore the three `edgeMode` guards marked
    // "TEMPORARY" in this file to go back to the black field with no lines.
    const TEMP_FIELD_IN_TIERED = true
    const paintTurf = turf.enabled && (TEMP_FIELD_IN_TIERED || edgeMode !== 'tiered')

    // R1 fix 6: re-rolling `seeds.turf`/`seeds.wear` (module state) doesn't by itself trigger a
    // re-render — each mounted board keeps its own counter, bumped when a matching cue arrives, so
    // its own effects/render re-run and pick up the new seed.
    const [regenTick, setRegenTick] = useState({turf: 0, wear: 0})
    const cueBus = useCueBus()
    useEffect(() => {
        return cueBus.subscribe((cue) => {
            if (cue.kind !== 'sport-style-regenerate') return
            if (cue.target === 'turf') {
                seeds.turf = rollSeed()
                setRegenTick((t) => ({...t, turf: t.turf + 1}))
            } else {
                seeds.wear = rollSeed()
                setRegenTick((t) => ({...t, wear: t.wear + 1}))
            }
        })
    }, [cueBus])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas || !geometry) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        if (!paintTurf) {
            ctx.clearRect(0, 0, innerW, innerH)
            return
        }
        // `enabled`/`edgeGap`/`ticksAreaHeight`/`turfMargin`/`tickHFactor`/`seamTickHFactor`/
        // `seamTicks` are recipe-level keys the painter doesn't take (geometry/rendering consumed
        // them above); `cornerWidth`/`cornerRoundness`/`borderWidth` (R2.4) are the oval-field shape
        // knobs, consumed below for the clip/border, not by the turf painter.
        const {enabled: _enabled, edgeGap: _edgeGap, ticksAreaHeight: _ticksAreaHeight, turfMargin: _turfMargin, tickHFactor: _tickHFactor, seamTickHFactor: _seamTickHFactor, seamTicks: _seamTicks, cornerWidth: _cornerWidth, cornerRoundness: _cornerRoundness, borderWidth: _borderWidth, ...params} = turf
        renderTurf(ctx, {
            width: innerW,
            height: innerH,
            cellPx: geometry.cellPx,
            gridLeft: geometry.gridLeft,
            cols,
            seed: seeds.turf,
            params,
            field: geometry.field,
        })
        // `turfKey` (a JSON snapshot of `turf`) stands in for `turf` itself so this effect doesn't
        // re-run on every render just because `mergeTurf` returns a fresh object — same trick
        // /obs/setup/sport_style/board's own turf effect uses via `geometry.field.*` primitives.
        // `regenTick.turf` re-runs this effect on a "Regenerate turf" cue, without a reload.
        // `edgeMode` is a dep so switching into/out of 'tiered' re-runs this effect even when the
        // recipe (`turfKey`) hasn't changed (`paintTurf` above).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [innerW, innerH, cols, geometry, turfKey, regenTick.turf, edgeMode])

    const waitingFontSize = Math.max(16, box.h * 0.03)

    if (!stream) {
        return (
            <div className="sps-root">
                <span className="sps-waiting" style={{fontSize: `${waitingFontSize}px`}}>No active stream</span>
            </div>
        )
    }

    if (!stream.active_break_id) {
        return (
            <div className="sps-root">
                <span className="sps-waiting" style={{fontSize: `${waitingFontSize}px`}}>No active break</span>
            </div>
        )
    }

    return (
        <div className="sps-root">
            {geometry && (
                <div className="sps-field" style={{width: box.w, height: fieldH, top: fieldOffsetY}}>
                  {/* Everything painted lives in the inner field, inset by `margin` — its own origin, so
                      fieldGeometry's integer rects (computed for innerW × innerH) apply unchanged. */}
                  <div className="sps-inner" style={{left: margin, top: margin, width: innerW, height: innerH}}>
                    {/* Layer 1 — clip group A: turf canvas (or, in `edgeMode: 'tiered'`, a flat
                        black fill instead) only, clipped to the oval field. */}
                    <div className="sps-clip-turf" style={{clipPath: fieldClip, WebkitClipPath: fieldClip}}>
                        <canvas ref={canvasRef} className="sps-turf-canvas" width={innerW} height={innerH} />
                        {/* TEMPORARY: `&& !TEMP_FIELD_IN_TIERED` keeps the black fill off while the field is forced on. */}
                        {edgeMode === 'tiered' && !TEMP_FIELD_IN_TIERED && (
                            <div
                                className="sps-field-black"
                                style={{left: geometry.field.x, top: geometry.field.y, width: geometry.field.w, height: geometry.field.h}}
                            />
                        )}
                    </div>

                    {/* Layer 2 — cells, unclipped by the oval. */}
                    {placedEvents.map(({event, row, col, rowLen}) => {
                        // A short last row (`rowLen < cols`) always lands ON the column formation —
                        // whole cells, every edge mode — and takes the most central ones, so the
                        // empty columns are split as evenly as possible between the two sides. With
                        // an odd number of empty columns an exact split is impossible on a cell
                        // grid; the spare column then sits on the right.
                        const emptyCols = cols - rowLen
                        const colShift = Math.floor(emptyCols / 2)
                        const footprintX = geometry.gridLeft + (col + colShift) * geometry.cellPx
                        const footprintY = geometry.gridTop + row * geometry.cellPx
                        // R1 fix 1: the patch is centred inside its own `cellPx × cellPx`
                        // footprint, not flush with fieldGeometry.ts's seam-derived `cellBox`.
                        const x = footprintX + Math.floor((geometry.cellPx - patchSize) / 2)
                        const y = footprintY + Math.floor((geometry.cellPx - patchSize) / 2)
                        // R3.2: tiered edge only when the operator has switched edgeMode on — every
                        // tier, including 'regular', now has its own neon skin (EDGE_TIER_BY_TIER is
                        // a total map), so every cell gets a skin in tiered mode. A custom spot with
                        // no tier resolves to 'regular' as today.
                        const edgeTier = edgeMode === 'tiered' ? EDGE_TIER_BY_TIER[tierByTeam.get(event.team) ?? 'regular'] : undefined
                        return (
                            <SportStyleCell
                                key={event.id}
                                event={event}
                                x={x}
                                y={y}
                                patchSize={patchSize}
                                patch={patch}
                                edgeTier={edgeTier}
                            />
                        )
                    })}

                    {/* Layer 3 — clip group B: column/row strips + hash ticks + seam ticks, above
                        the cells, clipped to the same oval field as clip group A above. Task spec
                        part 2: every white line is hidden in `edgeMode: 'tiered'` — the black field
                        and the cells are all that remain. */}
                    {/* TEMPORARY: `TEMP_FIELD_IN_TIERED ||` forces the white lines on in tiered mode. */}
                    {(TEMP_FIELD_IN_TIERED || edgeMode !== 'tiered') && (
                        <div className="sps-clip-lines" style={{clipPath: fieldClip, WebkitClipPath: fieldClip}}>
                            {geometry.vStrips.map((s, i) => (
                                <div key={`v-${i}`} className="sps-strip" style={{left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: lineColor}} />
                            ))}
                            {geometry.hStrips.map((s, i) => (
                                <div key={`h-${i}`} className="sps-strip" style={{left: s.x, top: s.y, width: s.w, height: s.h, backgroundColor: lineColor}} />
                            ))}

                            {geometry.ticks.map((t, i) => (
                                <div key={`t-${i}`} className="sps-tick" style={{left: t.x, top: t.y, width: t.w, height: t.h, backgroundColor: lineColor}} />
                            ))}

                            {seamTicksEnabled && geometry.seamTicks.map((t, i) => (
                                <div key={`st-${i}`} className="sps-tick" style={{left: t.x, top: t.y, width: t.w, height: t.h, backgroundColor: lineColor}} />
                            ))}
                        </div>
                    )}

                    {/* Layer 4 — border, above the lines and the cells; omitted at width 0. Drawn in
                        every edge mode — tiered hides the strips and ticks but keeps this ring. */}
                    {turf.borderWidth > 0 && (
                        <div className="sps-border" style={{
                            left: geometry.field.x, top: geometry.field.y,
                            width: geometry.field.w, height: geometry.field.h,
                            border: `${turf.borderWidth}px solid ${lineColor}`,
                            borderRadius: `${fieldRx}px / ${fieldRy}px`,
                        }} />
                    )}
                  </div>
                </div>
            )}
        </div>
    )
}

export default SportStyleBoard
