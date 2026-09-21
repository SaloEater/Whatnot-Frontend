'use client'

// The `ticker` registry component (obs-ticker-plan.md) — a static `curve.png` band texture with
// one line of "label: value" parts, compiled from the six circle widgets' data, sliding forever
// along the band's own centreline like a stock ticker. The circle widgets themselves are NOT
// placed here — this only reuses their data sources (useLayoutData()) and, in the settings panel
// (controls/elements/TickerSettings.tsx), their existing settings panels.
//
// `widgetValue`/the series-dependent guard below are COPIED from
// `../circle/CircleWidget.tsx` (never imported/refactored out — ADDING_AN_ELEMENT.md's copy rule,
// same as PriceSign's `formatRange`) — same four series-dependent widgets (`name`, `boxesPerBreak`,
// `boxesLeft`, `chasersLeft`) render nothing without a `breakObject.series_id`, same
// `chasersLeft` "show_percentage && pct above a threshold" rule — except the threshold is the
// slot's own `showPctMin` here instead of CircleWidget's hard-coded 15.
//
// Motion (obs-ticker-plan.md §5.3): a single `requestAnimationFrame` loop, started once on mount
// (or whenever it crosses the static <-> moving boundary), computes `offset` from the ELAPSED WALL
// TIME since that start and writes it straight onto the `<textPath>` DOM node via
// `setAttribute('startOffset', …)` — no React state per frame. `speed`/`direction`/the texture-scale
// factor `s` are read through refs that are kept in sync every render, so a mid-flight change to any
// of them (a settings-panel edit, or `s` changing because the box was resized) takes effect on the
// very next frame without tearing down and restarting the loop — which is also what keeps the
// current animation PHASE when the compiled parts change (a price update): only `unitLen` (read via
// its own ref, `unitLenRef`) changes, the elapsed-time clock does not reset.

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ElementProps } from '../../registry'
import { useLayoutData } from '../../useLayoutData'
import type { LayoutData } from '../../useLayoutData'
import type { TickerDirection, TickerSlot, WidgetId } from '../../schema'
import { WIDGET_IDS } from '../../schema'
import { TICKER_ASSET, TICKER_PATH_D } from './assets'
import './TickerElement.css'

// Registry defaults (registry.ts `makeElement()` seeds `slots` but leaves every other ticker field
// unset, so these apply) — also imported by TickerSettings.tsx so the controls UI shows/edits the
// same values a brand-new element actually renders at.
export const DEFAULT_TICKER_SEPARATOR = '   •   '
export const DEFAULT_TICKER_FONT_SIZE = 48
export const DEFAULT_TICKER_SPEED = 90
export const DEFAULT_TICKER_DIRECTION: TickerDirection = 'left'
export const DEFAULT_LABEL_COLOR = '#9fd6ff'
export const DEFAULT_VALUE_COLOR = '#ffffff'

// Default label text per widget id (obs-ticker-plan.md §3) — a slot's own `label`, when set,
// overrides this per element instance.
export const DEFAULT_TICKER_LABELS: Record<WidgetId, string> = {
    pick2: 'Pick 2',
    stashorpass: 'Stash or Pass',
    name: 'Series',
    boxesPerBreak: 'Boxes per break',
    boxesLeft: 'Boxes left',
    chasersLeft: 'Chasers left',
}

// Same four widgets as CircleWidget.tsx's `needsSeries` — they render nothing without a current
// break/series.
const SERIES_DEPENDENT_WIDGETS: readonly WidgetId[] = ['name', 'boxesPerBreak', 'boxesLeft', 'chasersLeft']

// COPIED from CircleWidget.tsx's `switch (widget)` value resolution + `formatValue` table (never
// imported/refactored out — see this file's header). Returns `null` exactly where CircleWidget
// would render an empty value: a series-dependent widget with no current series, or missing data.
// Default "Show %" line for chasersLeft. CircleWidget hides the percentage unless pct > 15; with
// integer percentages and an at-or-above rule, 16 reproduces that exactly.
export const DEFAULT_SHOW_PCT_MIN = 16

function widgetValue(widget: WidgetId, data: LayoutData, showPctMin: number = DEFAULT_SHOW_PCT_MIN): string | null {
    if (SERIES_DEPENDENT_WIDGETS.includes(widget) && !data.breakObject?.series_id) {
        return null
    }

    switch (widget) {
        case 'pick2':
            return data.pick2?.price != null ? `$${data.pick2.price}` : null
        case 'stashorpass':
            return data.stashorpass?.price != null ? `$${data.stashorpass.price}` : null
        case 'name':
            return data.series?.name ?? null
        case 'boxesPerBreak':
            return data.boxesPerBreak?.amount != null ? String(data.boxesPerBreak.amount) : null
        case 'boxesLeft':
            return data.seriesCount ? String(data.seriesCount.total_cards - data.seriesCount.used_cards) : null
        case 'chasersLeft': {
            const seriesCount = data.seriesCount
            if (!seriesCount) return null
            const available = seriesCount.total_cards - seriesCount.used_cards
            const pct = available > 0 ? Math.round((seriesCount.unsold_count / available) * 100) : 0
            return data.countSettings?.show_percentage && pct >= showPctMin
                ? `${seriesCount.unsold_count} / ${pct}%`
                : String(seriesCount.unsold_count)
        }
        default: {
            const _exhaustive: never = widget
            throw new Error(`widgetValue: unhandled widget ${JSON.stringify(_exhaustive)}`)
        }
    }
}

// A run of value text in one colour. A value is normally one segment; chasersLeft's
// "<count> / <pct>%" is split into three so the "/" can take the slot's own `slashColor`.
type ValueSegment = { text: string; color: string }

type TickerPart = {
    label: string
    value: string // plain text, for width measurement only
    segments: ValueSegment[]
    labelColor: string
}

const SLASH = ' / '

function valueSegments(id: WidgetId, value: string, valueColor: string, slashColor: string | undefined): ValueSegment[] {
    const at = value.indexOf(SLASH)
    if (id !== 'chasersLeft' || !slashColor || at < 0) return [{ text: value, color: valueColor }]
    return [
        { text: value.slice(0, at), color: valueColor },
        { text: SLASH, color: slashColor },
        { text: value.slice(at + SLASH.length), color: valueColor },
    ]
}

// Walks WIDGET_IDS in canonical order; a disabled slot or a slot whose value is null is DROPPED,
// not rendered as a blank (obs-ticker-plan.md §5.2).
function compileParts(data: LayoutData, slots: Record<WidgetId, TickerSlot>): TickerPart[] {
    const parts: TickerPart[] = []
    for (const id of WIDGET_IDS) {
        const slot = slots[id]
        if (!slot?.enabled) continue
        const value = widgetValue(id, data, slot.showPctMin ?? DEFAULT_SHOW_PCT_MIN)
        if (value === null) continue
        parts.push({
            label: slot.label || DEFAULT_TICKER_LABELS[id],
            value,
            segments: valueSegments(id, value, slot.valueColor ?? DEFAULT_VALUE_COLOR, slot.slashColor),
            labelColor: slot.labelColor ?? DEFAULT_LABEL_COLOR,
        })
    }
    return parts
}

// The plain-text form of one "unit" (all parts once, each ending in the separator — see
// compileParts' header) — used only to measure `unitLen` via a hidden `<text>`'s
// `getComputedTextLength()`. Colours don't affect layout width, so a flat string is enough.
function unitString(parts: TickerPart[], separator: string): string {
    return parts.map((p) => `${p.label}: ${p.value}${separator}`).join('')
}

export function TickerElement({ element, box }: ElementProps) {
    const data = useLayoutData()
    // useId() gives a stable, DOM-safe-ish id containing colons (":r0:") — strip them so it's a
    // valid SVG `id`/URL-fragment target for `href="#…"` (obs-ticker-plan.md §5.1: "unique path id
    // per mounted element via useId()", so two tickers on one canvas never share a <defs> target).
    const reactId = useId().replace(/[^a-zA-Z0-9-]/g, '')
    const pathId = `tkr-path-${reactId}`
    const maskId = `tkr-mask-${reactId}`
    const gradientId = `tkr-fade-${reactId}`

    const isTicker = element.kind === 'ticker'
    const slots = isTicker ? element.slots : null
    const separator = isTicker ? element.separator ?? DEFAULT_TICKER_SEPARATOR : DEFAULT_TICKER_SEPARATOR
    const fontSize = isTicker ? element.fontSize ?? DEFAULT_TICKER_FONT_SIZE : DEFAULT_TICKER_FONT_SIZE
    const speed = isTicker ? element.speed ?? DEFAULT_TICKER_SPEED : DEFAULT_TICKER_SPEED
    const direction = isTicker ? element.direction ?? DEFAULT_TICKER_DIRECTION : DEFAULT_TICKER_DIRECTION

    const parts = useMemo(() => (slots ? compileParts(data, slots) : []), [data, slots])
    const text = useMemo(() => unitString(parts, separator), [parts, separator])

    // Texture -> canvas scale (obs-ticker-plan.md §5.1): the path/image/text all live in the
    // texture's own 2170x725 coordinate system, so one factor scales everything together for any
    // box size/aspect (`preserveAspectRatio="xMidYMid meet"` letterboxes the rest).
    const s = Math.min(box.w / TICKER_ASSET.w, box.h / TICKER_ASSET.h)
    const svgFontSize = fontSize / s

    const pathElRef = useRef<SVGPathElement | null>(null)
    const measureRef = useRef<SVGTextElement | null>(null)
    const textPathRef = useRef<SVGTextPathElement | null>(null)
    // The values-only glow layer drawn under the main text (see the render below). The rAF loop
    // writes the same offset to both so the glow never drifts off its glyphs.
    const glowPathRef = useRef<SVGTextPathElement | null>(null)
    const unitLenRef = useRef(0)
    const startRef = useRef<number | null>(null)

    // `pathLen`/`unitLen` are held in STATE (not just a ref) so the repeat count `n` below — which
    // is rendered JSX, not an imperative write — updates once the measurement lands, instead of
    // being stuck at its initial 0 forever (a ref mutation alone triggers no re-render). `unitLenRef`
    // mirrors the state for the rAF loop, which reads it every frame without needing to restart when
    // it changes.
    const [pathLen, setPathLen] = useState(0)
    const [unitLen, setUnitLen] = useState(0)

    // `pathLen` is a constant for this fixed `d` (obs-ticker-plan.md §5.3: "≈2189 for this d, but
    // measure, don't hard-code") — measured once on mount.
    useLayoutEffect(() => {
        setPathLen(pathElRef.current?.getTotalLength() ?? 0)
    }, [])

    // Re-measure `unitLen` whenever the parts/separator/font size change (obs-ticker-plan.md §5.3
    // step 1) — imperative DOM measurement via a hidden `<text>`'s `getComputedTextLength()`.
    useLayoutEffect(() => {
        const len = measureRef.current?.getComputedTextLength() ?? 0
        unitLenRef.current = len
        setUnitLen(len)
    }, [text, svgFontSize])

    // Latest speed/direction/scale, read by the persistent rAF loop below without needing to
    // restart it (a settings-panel edit or a box resize takes effect on the next frame instead of
    // resetting the animation's phase).
    const speedRef = useRef(speed)
    const directionRef = useRef(direction)
    const sRef = useRef(s)
    speedRef.current = speed
    directionRef.current = direction
    sRef.current = s

    // `speed === 0` (or nothing to show) is the only thing that (re)starts/stops the loop — every
    // other change is picked up through the refs above on the next already-running frame.
    const isStatic = speed === 0 || parts.length === 0

    useEffect(() => {
        if (isStatic) {
            textPathRef.current?.setAttribute('startOffset', '0')
            glowPathRef.current?.setAttribute('startOffset', '0')
            return
        }

        startRef.current = null
        let raf = 0
        function frame(now: number) {
            if (startRef.current === null) startRef.current = now
            const t = (now - startRef.current) / 1000
            const unitLen = unitLenRef.current
            const node = textPathRef.current
            if (unitLen > 0 && node) {
                const distance = (t * speedRef.current) / sRef.current
                const mod = ((distance % unitLen) + unitLen) % unitLen
                const offset = directionRef.current === 'left' ? -mod : -unitLen + mod
                node.setAttribute('startOffset', String(offset))
                glowPathRef.current?.setAttribute('startOffset', String(offset))
            }
            raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)
        return () => cancelAnimationFrame(raf)
    }, [isStatic])

    if (!isTicker) return null

    // Repeat the unit enough times to cover the path plus one extra unit, so the wrap is seamless
    // (obs-ticker-plan.md §5.3 step 1: "smallest n such that n × unitLen ≥ pathLen + unitLen").
    const n = parts.length > 0 && unitLen > 0 ? Math.max(1, Math.ceil((pathLen + unitLen) / unitLen)) : 0

    return (
        <div className="tkr-root">
            <svg
                className="tkr-svg"
                viewBox={`0 0 ${TICKER_ASSET.w} ${TICKER_ASSET.h}`}
                preserveAspectRatio="xMidYMid meet"
                width={box.w}
                height={box.h}
            >
                <image href={TICKER_ASSET.src} x={0} y={0} width={TICKER_ASSET.w} height={TICKER_ASSET.h} />
                <defs>
                    <path ref={pathElRef} id={pathId} d={TICKER_PATH_D} />
                    {/* Edge fade (obs-ticker-plan.md §5.4): transparent -> opaque over the first/last
                        6% of the viewBox width, applied to the <text> only — the image is not
                        masked. objectBoundingBox is the mask's own rect below, not the whole SVG,
                        so the rect spans the full viewBox and the gradient's 0%/6%/94%/100% stops
                        line up with that width. */}
                    <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#fff" stopOpacity="0" />
                        <stop offset="6%" stopColor="#fff" stopOpacity="1" />
                        <stop offset="94%" stopColor="#fff" stopOpacity="1" />
                        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                    <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={TICKER_ASSET.w} height={TICKER_ASSET.h}>
                        <rect x={0} y={0} width={TICKER_ASSET.w} height={TICKER_ASSET.h} fill={`url(#${gradientId})`} />
                    </mask>
                </defs>

                {/* Hidden — measures one unit's rendered length (getComputedTextLength) so the rAF
                    loop and the repeat count `n` above can work in the same units the real
                    <textPath> render uses. Off-canvas AND opacity:0 (TickerElement.css) so it never
                    paints, on-canvas or off. */}
                <text ref={measureRef} className="tkr-text tkr-text-measure" fontSize={svgFontSize} x={-100000} y={0}>
                    {text}
                </text>

                {/* Values-only glow layer. SVG cannot apply a filter to a single <tspan>, so the whole
                    line is drawn twice: this copy underneath carries the drop-shadow, with labels
                    and separators painted fully transparent so only the VALUE glyphs cast a glow;
                    the main copy on top has no filter at all, so labels are glow-free. Both copies
                    share font metrics and receive the same startOffset every frame. */}
                {parts.length > 0 && (
                    <text
                        className="tkr-text tkr-glow"
                        fontSize={svgFontSize}
                        dominantBaseline="middle"
                        mask={`url(#${maskId})`}
                        aria-hidden="true"
                    >
                        <textPath ref={glowPathRef} href={`#${pathId}`} startOffset={0}>
                            {Array.from({ length: n }).map((_, i) =>
                                parts.map((part, j) => (
                                    <tspan key={`${i}-${j}`}>
                                        <tspan fill="transparent">{part.label}: </tspan>
                                        {part.segments.map((seg, k) => (
                                            <tspan key={k} fill={seg.color}>
                                                {seg.text}
                                            </tspan>
                                        ))}
                                        <tspan fill="transparent">{separator}</tspan>
                                    </tspan>
                                ))
                            )}
                        </textPath>
                    </text>
                )}

                {parts.length > 0 && (
                    <text className="tkr-text" fontSize={svgFontSize} dominantBaseline="middle" mask={`url(#${maskId})`}>
                        <textPath ref={textPathRef} href={`#${pathId}`} startOffset={0}>
                            {Array.from({ length: n }).map((_, i) =>
                                parts.map((part, j) => (
                                    <tspan key={`${i}-${j}`}>
                                        <tspan fill={part.labelColor}>{part.label}: </tspan>
                                        {part.segments.map((seg, k) => (
                                            <tspan key={k} fill={seg.color}>
                                                {seg.text}
                                            </tspan>
                                        ))}
                                        <tspan className="tkr-sep" fill={part.labelColor} fillOpacity={0.6}>
                                            {separator}
                                        </tspan>
                                    </tspan>
                                ))
                            )}
                        </textPath>
                    </text>
                )}
            </svg>
        </div>
    )
}

export default TickerElement
