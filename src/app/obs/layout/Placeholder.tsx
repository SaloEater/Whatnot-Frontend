'use client'

import { registryIdOf } from './registry'
import type { ElementProps } from './registry'

// Deterministic color from a string, so the same registry id always renders the same hue.
function hashColor(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 31 + input.charCodeAt(i)) | 0
    }
    const hue = Math.abs(hash) % 360
    return `hsl(${hue}, 55%, 32%)`
}

// Stand-in for every registry entry's `component` until Phase 2 replaces them one by one.
export function Placeholder({ elementKey, element, box, phase }: ElementProps) {
    const registryId = registryIdOf(element)
    const background = hashColor(registryId)

    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                boxSizing: 'border-box',
                border: '2px dashed rgba(255,255,255,0.65)',
                background,
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                fontFamily: 'monospace',
                textAlign: 'center',
                overflow: 'hidden',
                padding: 8,
            }}
        >
            <div style={{ fontSize: 16, opacity: 0.85 }}>{elementKey}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{registryId}</div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>{phase}</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>
                {Math.round(box.w)}×{Math.round(box.h)}
            </div>
        </div>
    )
}

export default Placeholder
