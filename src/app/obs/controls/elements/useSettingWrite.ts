'use client'

// RULE: changing any element setting pushes an update to OBS immediately.
//
// Every settings panel under obs/controls/elements writes to the backend and, historically, then
// just sat there waiting for the data spine's own poll (useLayoutData.tsx) to notice — up to
// 120s for some sources. That reads as lag to the operator even though the write itself
// succeeded instantly. `CardsSettings`' mark-sold flow already fixed this for itself by firing a
// `photos-changed` cue right after its write; this hook generalises that pattern to every panel
// instead of leaving each one to remember to do it.
//
// The cue is fired as PART OF `save()`, not as a separate call a panel makes afterwards, for the
// same reason mark-sold's cue lived right next to its write: a push that isn't structurally
// coupled to the save is a push someone eventually forgets to add to a new/edited panel. Bundling
// it into the helper means "converted to useSettingWrite" and "pushes to OBS" are the same fact.
//
// Opt-out: pass `null` as the spine key. That is the explicit, deliberate way to say "this write
// should not push anything" — every call site names a real key or spells `null`, so nothing can
// silently forget which one it meant. The key is typed against `LayoutDataSourceKey`, the spine's
// actual set of registered fetchers (useLayoutData.tsx), so aiming at a source that doesn't exist
// is a compile error rather than a cue nobody ever receives.

import {useCallback, useState} from 'react'
import type {Cue} from '@/app/obs/layout/schema'
import type {LayoutDataSourceKey} from '@/app/obs/layout/useLayoutData'

export type SettingWriteStatus = 'idle' | 'ok' | 'error'

export type SettingWriteResult<T> = { ok: true; data: T } | { ok: false }

// Same shape as useLayoutData.tsx's isErrorResponse: post()/get() never throw for HTTP/network
// failures, they resolve `{error: ...}` instead (lib/backend.ts). A write that "succeeded" with
// that shape must not be treated as ok, and must not push a cue.
function isErrorResponse(v: unknown): boolean {
    return typeof v === 'object' && v !== null && 'error' in (v as Record<string, unknown>)
}

/**
 * `const {save, saving, status} = useSettingWrite(onFireCue)`
 *
 * `save(key, write)` runs `write()`, tracks `saving`/`status` for the panel, and — only on a
 * genuine success — fires `{kind: 'refetch', key}` through `onFireCue` so the spine refetches that
 * source immediately instead of waiting for its next poll. Pass `key: null` to opt out of the push
 * entirely (the write still happens).
 */
export function useSettingWrite(onFireCue?: (cue: Cue) => void) {
    const [saving, setSaving] = useState(false)
    const [status, setStatus] = useState<SettingWriteStatus>('idle')

    const save = useCallback(
        async <T,>(key: LayoutDataSourceKey | null, write: () => Promise<T>): Promise<SettingWriteResult<T>> => {
            setSaving(true)
            setStatus('idle')
            try {
                const data = await write()
                if (isErrorResponse(data)) {
                    setStatus('error')
                    return {ok: false}
                }
                setStatus('ok')
                if (key !== null) {
                    onFireCue?.({kind: 'refetch', key})
                }
                return {ok: true, data}
            } catch {
                setStatus('error')
                return {ok: false}
            } finally {
                setSaving(false)
            }
        },
        [onFireCue]
    )

    // Clears a stale 'ok'/'error' badge left over from the previous save — e.g. while the operator
    // is typing a new value into a field that only saves on an explicit button press.
    const reset = useCallback(() => setStatus('idle'), [])

    return {save, saving, status, reset}
}
