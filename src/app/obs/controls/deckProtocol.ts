// Wire contract between the OBS layout controls page and the Stream Deck plugin.
//
// MIRROR OF: `ElgatoPlugin/mount-olympus-system-integration/src/protocol.ts` — keep the two in step
// by hand; they live in separate git submodules with no shared build. See `elgato-plugin-plan.md`
// ("Message contract") for the design.
//
// Transport is obs-websocket's `BroadcastCustomEvent` / `CustomEvent` pair, which reaches every
// identified+subscribed client — including the sender, hence `src`. Order is not preserved and
// there is no delivery acknowledgement, hence `id` and the heartbeat below.

export const MOB = 'mob-deck-v1'

// Bumped whenever the meaning of a message changes in a way the other side must understand. The
// plugin and this page ship separately (the page is hosted, the plugin is pulled onto the streaming
// PC), so they WILL be out of step sometimes. MOB stays fixed as the namespace — changing it would
// make each side silently ignore the other, the exact un-diagnosable failure this guards against.
export const PROTOCOL_VERSION = 1

// Commands travel plugin -> this page. Unknown values are ignored, not errors — that is what lets
// a future command ship without breaking an older plugin.
/**
 * `ping` asks this page to re-send its state NOW. It exists because our own heartbeat is a
 * browser timer, and Chrome clamps timers in a hidden tab to roughly once a minute — so this
 * page can be perfectly alive and still look dead to the deck for 54s of every 60. An inbound
 * websocket message is not throttled, so answering works when beating does not.
 */
export type DeckCmd = 'next_stage' | 'prev_stage' | 'scene_event' | 'describe' | 'ping'

export type DeckCommand = {
    mob: typeof MOB
    kind: 'cmd'
    src: string
    id: number
    cmd: DeckCmd
    name?: string
}

export type HeadState = {
    mob: typeof MOB
    kind: 'state'
    src: string
    protocol?: number
    seq: number
    phase: string
    transitioning: boolean
    obsConnected: boolean
    /**
     * On/off state of every LATCHING scene event, keyed by SceneEventName (sceneEvents.ts).
     * Momentary events never appear here.
     *
     * ABSENT IS NOT OFF. A page older than this field sends nothing, which is indistinguishable
     * from "everything is off" unless the receiver keeps the two apart — so treat absent as
     * UNKNOWN and render neutral. That is the same discipline `protocol?` already gets; guessing
     * "off" would paint a confidently wrong key.
     *
     * Deliberately NOT checked by isDeckMessage(), which validates only what it must route on —
     * `transitioning` and `obsConnected` are unvalidated for the same reason. Read defensively.
     */
    active?: Record<string, boolean>
}

export type VocabItem = {
    name: string    // stable id — this is what a key's settings store
    label: string   // display only; safe to rename
    /**
     * Present and true only for latching events. Without this the plugin cannot tell which keys
     * should render as toggles at all — `active` says what is on, this says what CAN be on.
     * Omitted for momentary events, so `vocabRev` only moves when the vocabulary really changes.
     */
    latching?: boolean
}

export type DeckVocab = {
    mob: typeof MOB
    kind: 'vocab'
    src: string
    protocol?: number
    rev: number
    stages: VocabItem[]
    sceneEvents: VocabItem[]
}

export type DeckMessage = DeckCommand | HeadState | DeckVocab

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null
}

function isVocabItems(v: unknown): v is VocabItem[] {
    return Array.isArray(v) && v.every((i) => isRecord(i) && typeof i.name === 'string' && typeof i.label === 'string')
}

export function isDeckMessage(v: unknown): v is DeckMessage {
    if (!isRecord(v) || v.mob !== MOB || typeof v.src !== 'string') return false

    switch (v.kind) {
        case 'cmd':
            return typeof v.id === 'number' && typeof v.cmd === 'string'
        case 'state':
            return typeof v.seq === 'number' && typeof v.phase === 'string'
        case 'vocab':
            return typeof v.rev === 'number' && isVocabItems(v.stages) && isVocabItems(v.sceneEvents)
        default:
            return false
    }
}

export function newSrc(): string {
    return `ctl-${Math.random().toString(36).slice(2, 10)}`
}

// A content hash, so `rev` changes exactly when the vocabulary does and the plugin can skip
// redundant writes. Small inputs, so a cheap string hash is plenty.
export function vocabRev(stages: VocabItem[], sceneEvents: VocabItem[]): number {
    const source = JSON.stringify([stages, sceneEvents])
    let hash = 0
    for (let i = 0; i < source.length; i++) {
        hash = (Math.imul(31, hash) + source.charCodeAt(i)) | 0
    }
    return hash >>> 0
}
