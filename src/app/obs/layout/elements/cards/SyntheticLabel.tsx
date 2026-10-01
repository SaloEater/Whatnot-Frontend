import React from 'react'
import type { LabelText } from '@/app/entity/entities'

// Synthetic PSA-style label (photo-art-label-plan.md §8): font-size = row height, no measuring,
// overflowing text is clipped by the cell. Look reference: /obs/test/team/label.

const snap = (v: number, step: number) => Math.round(v / step) * step
const RED = '#e2231a'
const LEFT_SHARE = 0.7

export interface LabelGeometry {
    border: number
    padding: number
    inner: { x: number; y: number; w: number; h: number }
    fontSize: number
    leftW: number
    rightW: number
    rows: { top: number; height: number }[]
}

export function labelRowGeometry(width: number, height: number): LabelGeometry {
    const border = snap(height * 0.075, 0.25) // 7.5% of the slot height (was 2.5%; tripled 2026-09-30)
    const padding = snap(height * 0.04, 0.25)
    const off = border + padding
    const inner = { x: off, y: off, w: Math.max(0, width - 2 * off), h: Math.max(0, height - 2 * off) }
    const rowH = inner.h / 4
    const rows = [0, 1, 2, 3].map((i) => {
        const top = Math.round(inner.y + i * rowH)
        const bottom = Math.round(inner.y + (i + 1) * rowH)
        return { top, height: bottom - top }
    })
    const leftW = snap(inner.w * LEFT_SHARE, 0.25)
    return { border, padding, inner, fontSize: snap(rowH, 0.25), leftW, rightW: inner.w - leftW, rows }
}

export function SyntheticLabel({ text, width, height }: { text: LabelText; width: number; height: number }) {
    const g = labelRowGeometry(width, height)
    const cell: React.CSSProperties = {
        position: 'absolute', overflow: 'hidden', whiteSpace: 'nowrap',
        fontSize: `${g.fontSize}px`, lineHeight: 1,
    }
    return (
        <div className="crd-label" style={{ width: `${width}px`, height: `${height}px`, borderWidth: `${g.border}px` }}>
            {g.rows.map((r, i) => {
                const [l, rt] = text.rows[i] ?? ['', '']
                return (
                    <React.Fragment key={i}>
                        <div style={{ ...cell, left: `${g.inner.x - g.border}px`, top: `${r.top - g.border}px`, width: `${g.leftW}px`, height: `${r.height}px`, textAlign: 'left' }}>{l}</div>
                        <div style={{ ...cell, left: `${g.inner.x - g.border + g.leftW}px`, top: `${r.top - g.border}px`, width: `${g.rightW}px`, height: `${r.height}px`, textAlign: 'right' }}>{rt}</div>
                    </React.Fragment>
                )
            })}
        </div>
    )
}
