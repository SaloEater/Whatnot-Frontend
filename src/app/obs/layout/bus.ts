// Parsing/guarding helpers for the OBS event bus (obs-browser-event-bus.md).
// Per §6: `e.detail` arrives as a plain object, order is NOT preserved, so every payload carries
// a monotonically increasing `seq` and callers must drop anything with seq <= lastSeen.

import type { BusPayload, CuePayload } from './schema'
import { migrateConfig, migrateState, validateConfig, validateDurableCue, validateState, validateTransientCue } from './config'

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function parseBusPayload(detail: unknown): BusPayload | null {
    if (!isPlainObject(detail)) {
        console.warn('[layout/bus] payload is not an object', detail)
        return null
    }

    if (typeof detail.seq !== 'number' || !Number.isFinite(detail.seq)) {
        console.warn('[layout/bus] payload missing a numeric seq', detail)
        return null
    }

    const stateResult = validateState(migrateState(detail.state))
    if (!stateResult.ok) {
        console.warn('[layout/bus] invalid state in payload', stateResult.errors)
        return null
    }

    const configResult = validateConfig(migrateConfig(detail.config))
    if (!configResult.ok) {
        console.warn('[layout/bus] invalid config in payload', configResult.errors)
        return null
    }

    let cue: BusPayload['cue']
    if (detail.cue !== undefined) {
        const cueResult = validateDurableCue(detail.cue)
        if (!cueResult.ok) {
            console.warn('[layout/bus] invalid cue in payload', cueResult.errors)
            return null
        }
        cue = cueResult.cue
    }

    return {
        seq: detail.seq,
        state: stateResult.state,
        config: configResult.config,
        cue,
    }
}

/**
 * The transient cue channel (schema.ts's BUS_CUE_EVENT_NAME): a cue and an ordering number, no
 * state and no config. Same shape of validation as `parseBusPayload`, and the same contract —
 * anything malformed is warned about and dropped rather than half-applied.
 */
export function parseCuePayload(detail: unknown): CuePayload | null {
    if (!isPlainObject(detail)) {
        console.warn('[layout/bus] cue payload is not an object', detail)
        return null
    }
    if (typeof detail.n !== 'number' || !Number.isFinite(detail.n)) {
        console.warn('[layout/bus] cue payload missing a numeric n', detail)
        return null
    }
    const cueResult = validateTransientCue(detail.cue)
    if (!cueResult.ok) {
        console.warn('[layout/bus] invalid cue payload', cueResult.errors)
        return null
    }
    return { n: detail.n, cue: cueResult.cue }
}

// Order is not preserved across emits (obs-browser-event-bus.md §6.5), so the receiver must
// track the highest seq seen and drop anything at or below it, regardless of arrival order.
// Also used for the transient channel's `n` (same problem, different counter).
export function makeSeqGuard(): { accept: (seq: number) => boolean } {
    let last = -Infinity

    return {
        accept(seq: number): boolean {
            if (seq > last) {
                last = seq
                return true
            }
            return false
        },
    }
}
