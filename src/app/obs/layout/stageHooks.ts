// Stage hooks (obs-camera-shelf-plan.md §5) — a generic, controls-side element lifecycle: any
// element type may run code when a stage is left/entered, without storing anything in the config.
// Runs on the CONTROLS page only (controls/useStageHooks.ts is the runner) — it is the one page
// that holds the obs-websocket connection and knows when a stage change was actually applied; the
// layout page may be open several times (including dev tabs) and has no single "the stage just
// changed" moment to hook.
//
// Types only, no runtime imports — same convention as elementId.ts: `RegistryEntry.mount` (below,
// via registry.ts) is read by controls/useStageHooks.ts, which must not need to import every
// element component to do it, so this module stays free of any runtime dependency (`Element`/
// `Phase`/`MyOBSWebsocket` are all `import type`, erased at compile).

import type { Element, Phase } from './schema'
import type { MyOBSWebsocket } from '@/app/entity/my_obs_websocket'

export type StageHookEvent = {
    type: 'stageOut' | 'stageIn'
    from: Phase | null // null on page load / reconnect / re-sync ("stageIn" only)
    to: Phase
    presentInFrom: boolean // this element resolves a box on `from` AND is effectively visible
    presentInTo: boolean // same for `to`
}

export type StageHookBus = {
    on(type: StageHookEvent['type'], handler: (e: StageHookEvent) => void | Promise<void>): () => void
}

export type MountContext = {
    elementKey: string
    element: Element // the element as of mount time; re-mounted whenever config changes
    bus: StageHookBus
    obs: () => MyOBSWebsocket | null // getters, not values: the connection object may change after mount
    isConnected: () => boolean
    log: (line: string) => void // lands in the OBS tab's log
}

/** Returns a teardown function, or nothing if there is nothing to unsubscribe. Nothing checks that
 *  a `mount` actually unsubscribes on teardown — see ADDING_AN_ELEMENT.md's convention item 9. */
export type MountFn = (ctx: MountContext) => (() => void) | void
