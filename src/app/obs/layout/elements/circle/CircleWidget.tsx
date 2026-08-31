'use client'

// The `widget:pick2` / `widget:stashorpass` / `widget:name` / `widget:boxesPerBreak` registry
// component (obs-layout-plan.md §2.6). Ported from
// channel/[id]/widget/series/{circleWidget.tsx,pick2,stashorpass,name,boxes_per_break} — those
// old routes are untouched (byte-identical, copy not move).
//
// One component, four registry entries: it switches on `element.widget` for its per-widget look
// (title lines, neon/glow/background colours, spin duration, value formatting) — the CIRCLE_CONFIGS
// table below holds those verbatim from the four old pages.
//
// Differences from the old `CircleWidget`:
//   - No polling of its own. The old component had a `useEffect`/`setInterval(POLL_MS)` that
//     re-fetched every 5s, with an inline `requestBody` object literal in its dep array — a new
//     identity every render, so the interval was torn down and recreated on every render (the bug
//     flagged at circleWidget.tsx:48). All four values (`pick2`, `stashorpass`, `boxesPerBreak`,
//     `series`) already come from the data spine (useLayoutData()), which is the layout's only
//     backend poller (obs-layout-plan.md §1.3) — so the effect is deleted outright rather than
//     fixed; there is nothing left for it to do.
//   - `name` and `boxesPerBreak` no longer duplicate a useChannel -> useActiveStream -> break_get
//     round trip just to find `series_id`; the spine already has the current break. The "render
//     nothing when there is no series" behaviour of those two old pages is preserved by checking
//     `breakObject?.series_id` directly.
//   - Sizing is box-relative: the old CSS sized the title/value/corner text in `vmin` (of the old
//     route's full-viewport browser source, which WAS the widget). Since `ElementFrame` now sizes
//     this component's root to exactly the element's box in px, `vmin` is reproduced by computing
//     the same fractions of `min(box.w, box.h)` in JS and handing them down as CSS custom
//     properties — see the `basis` calc below.

import type {ElementProps} from '../../registry'
import {useLayoutData} from '../../useLayoutData'
import './CircleWidget.css'

type CircleWidgetId = 'pick2' | 'stashorpass' | 'name' | 'boxesPerBreak' | 'boxesLeft' | 'chasersLeft'

type CircleConfig = {
    lines: [string, string]
    neonColor: string
    neonGlowMid: string
    circleBackground: string
    // Carried over verbatim from the old pages for parity; dead in the old component too — it was
    // accepted as a prop and never read by any render or keyframe.
    spinDuration: number
    formatValue: (value: string | number) => string
}

const CIRCLE_CONFIGS: Record<CircleWidgetId, CircleConfig> = {
    pick2: {
        lines: ['SPIN 2', 'CHOOSE 1'],
        neonColor: '#76d7d8',
        neonGlowMid: '#9bd7d8',
        circleBackground: '#293d56',
        spinDuration: 24,
        formatValue: (p) => `$${p}`,
    },
    stashorpass: {
        lines: ['STASH', 'OR PASS'],
        neonColor: '#67e85f',
        neonGlowMid: '#98e895',
        circleBackground: '#233a13',
        spinDuration: 24.5,
        formatValue: (p) => `$${p}`,
    },
    name: {
        lines: ['CURRENT', 'SERIES'],
        neonColor: '#d93957',
        neonGlowMid: '#d9203e',
        circleBackground: '#293d56',
        spinDuration: 24,
        formatValue: (v) => String(v),
    },
    boxesPerBreak: {
        lines: ['Boxes', 'per break'],
        neonColor: '#ffffa0',
        neonGlowMid: '#ffffd4',
        circleBackground: '#3d3d10',
        spinDuration: 25,
        formatValue: (v) => String(v),
    },
    // The two count cells (obs-layout-plan.md §2.7). Folded in here rather than kept as their own
    // component so they behave identically to the other circle widgets by construction — same
    // shell, same half-height header, same box-relative type scale — instead of a parallel
    // implementation that has to be kept in step by hand. Their titles become two lines like every
    // other widget's, which is also what stops a single long label overflowing its cell.
    // Colours are countCell.css's `--unsold`/`--available` modifiers.
    boxesLeft: {
        lines: ['Boxes', 'left'],
        neonColor: '#ffffa0',
        neonGlowMid: '#ffffd4',
        circleBackground: '#808050',
        spinDuration: 24,
        formatValue: (v) => String(v),
    },
    chasersLeft: {
        lines: ['Chasers', 'left'],
        neonColor: '#d93957',
        neonGlowMid: '#d9203e',
        // Shares `name`'s background rather than countCell.css's own `--unsold` value: it drives
        // both the lower half's radial gradient and the corner dot, and the two widgets already
        // share the same neon, so matching it keeps them a pair.
        circleBackground: '#293d56',
        spinDuration: 24,
        formatValue: (v) => String(v),
    },
}

export function CircleWidget({element, box}: ElementProps) {
    const {breakObject, pick2, stashorpass, boxesPerBreak, series, seriesCount, countSettings} = useLayoutData()

    // `element` is typed as the full `Element` union; this component is only ever mounted for a
    // `widget` element whose `widget` is one of the four ids below (registry.ts maps each 1:1),
    // but narrow defensively rather than assert, same convention as ThinResults/ResultsElement.
    const widget = element.kind === 'widget' ? element.widget : null
    const config = widget && widget in CIRCLE_CONFIGS ? CIRCLE_CONFIGS[widget as CircleWidgetId] : null

    // `name` and `boxesPerBreak` each resolved their own series_id via a duplicated
    // useChannel/useActiveStream/break_get chain in the old pages and rendered nothing without
    // one; the spine already carries the current break, so read series_id straight off it.
    const seriesId = breakObject?.series_id ?? null
    const needsSeries =
        widget === 'name' ||
        widget === 'boxesPerBreak' ||
        widget === 'boxesLeft' ||
        widget === 'chasersLeft'

    if (!config || (needsSeries && !seriesId)) return null

    let value: string | number | null = null
    switch (widget) {
        case 'pick2':
            value = pick2?.price ?? null
            break
        case 'stashorpass':
            value = stashorpass?.price ?? null
            break
        case 'name':
            value = series?.name ?? null
            break
        case 'boxesPerBreak':
            value = boxesPerBreak?.amount ?? null
            break
        case 'boxesLeft':
            value = seriesCount ? seriesCount.total_cards - seriesCount.used_cards : null
            break
        case 'chasersLeft': {
            // Same rule as the old chaser_left page: the percentage rides along only when the
            // channel asks for it AND the chance is worth showing.
            if (seriesCount) {
                const available = seriesCount.total_cards - seriesCount.used_cards
                const pct = available > 0 ? Math.round((seriesCount.unsold_count / available) * 100) : 0
                value =
                    countSettings?.show_percentage && pct > 15
                        ? `${seriesCount.unsold_count} / ${pct}%`
                        : seriesCount.unsold_count
            }
            break
        }
    }

    // Reproduces the old CSS's `vmin` sizing (obs-layout-plan.md §2.6): `vmin` was 1% of the old
    // route's full-viewport browser source, which WAS this widget's box, so the same fractions of
    // `min(box.w, box.h)` computed here reproduce it exactly for a box of any size/aspect ratio.
    const basis = Math.min(box.w, box.h)
    const titleFontPx = basis * 0.18
    const valueFontPx = basis * 0.3
    const cornerSizePx = basis * 0.12
    const valuePaddingPx = basis * 0.03

    return (
        <div
            className="circ-root"
            style={
                {
                    '--neon': config.neonColor,
                    '--neon-mid': config.neonGlowMid,
                    '--circle-bg': config.circleBackground,
                    '--circ-title-fs': `${titleFontPx}px`,
                    '--circ-value-fs': `${valueFontPx}px`,
                    '--circ-corner-size': `${cornerSizePx}px`,
                    '--circ-value-pad': `${valuePaddingPx}px`,
                } as React.CSSProperties
            }
        >
            <div className="circ-cell">
                <div className="circ-title">
                    <span>{config.lines[0]}</span>
                    <span>{config.lines[1]}</span>
                </div>
                <div className="circ-content">
                    <span>
                        {value !== null ? config.formatValue(value) : ''}
                    </span>
                </div>
                <div className="circ-corner" />
            </div>
        </div>
    )
}

export default CircleWidget
