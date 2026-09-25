// The `obsToggle` registry entry's stage hook (obs-visibility-toggle-plan.md): enables every OBS
// scene item (source) named in `element.sources` when a stage containing this element becomes
// present on the stage being entered, disables them all when it stops being present on the stage
// being left. Runs on the CONTROLS page only (controls/useStageHooks.ts is the runner) — see
// stageHooks.ts for the contract this implements. Copied from `elements/camera-shelf/mount.ts`
// (obs-camera-shelf-plan.md §6, since removed — obs-visibility-toggle-plan.md §11) and generalised
// from two fixed fields to a dynamic list; per ADDING_AN_ELEMENT.md's copy rule this is a copy, not
// a shared import.
//
// No config is ever written here — this is purely a side effect against the live OBS connection.
// Removing this element from the config does NOT disable its sources: teardown fires no events
// (same gap as the shelf had) — a re-sync ("Re-sync elements" on the controls page) or the operator
// handles it by hand.

import type { MountFn } from '../../stageHooks'

export const mountObsToggle: MountFn = ({ element, bus, obs, isConnected, log, elementKey }) => {
    if (element.kind !== 'obsToggle') return
    const sources = Array.from(
        new Set((element.sources ?? []).map((s) => s.trim()).filter((s) => s !== ''))
    )
    if (sources.length === 0) return

    // Resolved scene items, cached per mount so a repeated enable/disable doesn't re-resolve the
    // names every time — an entry is dropped (forcing a re-resolve) whenever its call actually
    // fails, so a source renamed or re-added in OBS while this element stays mounted is picked up
    // on the next event rather than staying wrong until the config changes and the element
    // re-mounts.
    const cached = new Map<string, { scene: string; id: number }>()

    async function setOneEnabled(source: string, enabled: boolean) {
        const o = obs()
        if (!o) return
        try {
            let item = cached.get(source) ?? null
            if (!item) {
                item = await o.findSceneItemInProgramScene(source)
                if (!item) {
                    log(`[obsToggle ${elementKey}] source "${source}" not in the program scene`)
                    return
                }
                cached.set(source, item)
            }
            await o.setSceneItemEnabled(item.scene, item.id, enabled)
        } catch (e) {
            // Drop the cache so a renamed/re-added item is re-resolved next time, then re-throw —
            // the runner (controls/useStageHooks.ts) is what logs `[hooks] <key> <type>: <message>`
            // and applies the 5s timeout, so this function stays a plain async action.
            cached.delete(source)
            throw e
        }
    }

    async function setEnabled(enabled: boolean) {
        // OBS being disconnected is the common case and is NOT logged (obs-camera-shelf-plan.md
        // §5.2) — the OBS badge already shows it, and logging here on every stage change while
        // disconnected would just be noise.
        if (!obs() || !isConnected()) return
        await Promise.all(sources.map((source) => setOneEnabled(source, enabled)))
    }

    // An element on BOTH stages does nothing on Out (no blink) and re-asserts enabled on In. An
    // element on neither does nothing either way. Two elements naming the same source both act;
    // the last write wins, and Out is always emitted before In by the page, so the element present
    // on the NEW stage wins (see the settings panel's help text).
    const offOut = bus.on('stageOut', (e) => {
        if (e.presentInFrom && !e.presentInTo) return setEnabled(false)
    })
    const offIn = bus.on('stageIn', (e) => {
        if (e.presentInTo) return setEnabled(true)
    })

    return () => {
        offOut()
        offIn()
    }
}
