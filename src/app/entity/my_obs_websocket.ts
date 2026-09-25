import {Logger} from "@/app/entity/logger";
import OBSWebSocket, {EventSubscription, OBSRequestTypes} from "obs-websocket-js";
import {ObsItem, ObsScene, RawObsItem} from "@/app/entity/entities";

// obs-websocket rejects with an Error for a refused socket and with its own {code, message} shape
// for a protocol-level refusal (bad password, unsupported RPC version); JSON.stringify of an Error
// is "{}", which is exactly the useless message this avoids.
function describeObsError(e: unknown): string {
    if (e instanceof Error) return e.message
    if (typeof e === 'object' && e !== null) {
        const r = e as {code?: unknown; message?: unknown}
        if (typeof r.message === 'string') {
            return typeof r.code === 'number' ? `(${r.code}) ${r.message}` : r.message
        }
    }
    return String(e)
}

interface ObsItemToHide {
    item: ObsItem
    scene: ObsScene
    callback: () => void
}

export class MyOBSWebsocket {
    url: string
    webSocket : OBSWebSocket
    logger: Logger
    _isConnected: boolean = false
    _setIsConnected: undefined|((isConnected: boolean) => void) = undefined
    // Why the last failure was, in plain text, for a UI that retries forever. `connect()` swallows
    // its errors into the logger, which is fine for a manual Connect button (you clicked, nothing
    // happened, you look at the log) but useless once connecting is automatic: an operator staring
    // at a permanently amber "reconnecting" needs to know whether OBS is closed, the port is wrong,
    // or the browser blocked ws:// from an https:// page. Cleared on every success.
    lastError: string|null = null
    mediaSourcesHideAfterPlayback: ObsItemToHide[] = []

    constructor(url: string, log: Logger, setIsConnected: (isConnected: boolean) => void) {
        this.url = url
        this.logger = log
        this.webSocket = new OBSWebSocket()
        this._setIsConnected = setIsConnected
    }


    connect(): Promise<void> {
        let password = undefined
        try {
            return this.webSocket.connect(this.url, password, {
                eventSubscriptions: EventSubscription.All,
            }).then(_ => {
                this.log('Connection established')
                this.lastError = null
                this.setConnected()
                this.webSocket.on('ConnectionOpened', () => this.log('Connection opened'))
                this.webSocket.on('ConnectionClosed', (e) => {
                    this.setDisconnect()
                    this.log(`Connection closed ${e.message}`)
                })
                this.webSocket.on('ConnectionError', (e) => {
                    this.setDisconnect()
                    this.lastError = `(${e.code}) ${e.message}`
                    this.log(`Connection error: (${e.code}) ${e.message}`)
                })
                this.webSocket.on('Hello', () => {
                    this.log(`Greet server`)
                })
                this.webSocket.on('Identified', () => {
                    this.log(`Client is identified, set to connected state`)
                })
                this.webSocket.on('MediaInputPlaybackEnded', r => this.mediaSourcePlaybackEnded(r.inputName, r.inputUuid))
            }).catch(e => {
                this.lastError = describeObsError(e)
                this.log(`Connect error: ${JSON.stringify(e)}`)
            })
        } catch (error) {
            this.lastError = describeObsError(error)
            this.log(`Failed to connect: ${JSON.stringify(error)}`);
            return Promise.resolve()
        }
    }

    disconnect(): Promise<void> {
        return this.webSocket.disconnect().then(_ => {
            this.log('Disconnected')
            this.setDisconnect()
        })
    }

    emitBrowserEvent(eventName: string, data: unknown): Promise<void> {
        this.guardIsConnected()
        this.log(`Emit browser event ${eventName}: ${JSON.stringify(data)}`)
        return this.webSocket.call('CallVendorRequest', {
            vendorName: 'obs-browser',
            requestType: 'emit_event',
            requestData: {
                event_name: eventName,
                event_data: data,
            } as OBSRequestTypes['CallVendorRequest']['requestData'],
        }).then(_ => {})
    }

    /**
     * Broadcasts to every OTHER obs-websocket client (the Stream Deck plugin, another controls
     * tab) via `BroadcastCustomEvent`. This is NOT the same channel as `emitBrowserEvent`:
     * `emit_event` reaches OBS browser sources only and never a plain Chrome tab, while this
     * reaches every identified+subscribed websocket client — including this one, which is why
     * payloads carry a `src`. See `elgato-plugin-plan.md` ("Why this transport is sound").
     */
    broadcastCustomEvent(data: object): Promise<void> {
        this.guardIsConnected()
        return this.webSocket.call('BroadcastCustomEvent', {
            eventData: data as OBSRequestTypes['BroadcastCustomEvent']['eventData'],
        }).then(_ => {})
    }

    /**
     * Subscribes to `CustomEvent`, the receiving half of `broadcastCustomEvent`. Returns an
     * unsubscribe function. Does not require the connection to be up yet — `CustomEvent` is in the
     * General category, which `EventSubscription.All` (used in connect()) already covers.
     */
    onCustomEvent(cb: (data: unknown) => void): () => void {
        // The payload arrives DIRECTLY: obs-websocket passes BroadcastCustomEvent's `eventData`
        // through as the event's whole data, so there is no `{eventData}` wrapper. Verified
        // against OBS 31.1.2 / obs-websocket 5. Unwrapping here silently drops every message.
        const handler = (d: unknown) => cb(d)
        this.webSocket.on('CustomEvent', handler)
        return () => { this.webSocket.off('CustomEvent', handler) }
    }

    private log(value: string) {
        this.logger.add(value)
    }

    isConnected() {
        return this._isConnected;
    }

    private setConnected() {
        this._isConnected = true
        if (this._setIsConnected) {
            this._setIsConnected(true)
        }
    }

    private setDisconnect() {
        this._isConnected = false
        if (this._setIsConnected) {
            this._setIsConnected(false)
        }
    }

    private guardIsConnected() {
        if (!this.isConnected()) {
            this.log('obs websocket is not connect but called')
            throw new Error('obs websocket is not connect')
        }
    }

    /**
     * Calls `cb` when OBS reports that the media input `inputName` finished playing.
     * Returns an unsubscribe function. Does not require the connection to be up yet.
     */
    onMediaPlaybackEnded(inputName: string, cb: () => void): () => void {
        const handler = (r: { inputName: string }) => {
            if (r.inputName === inputName) cb()
        }
        this.webSocket.on('MediaInputPlaybackEnded', handler)
        return () => { this.webSocket.off('MediaInputPlaybackEnded', handler) }
    }

    /** Names of every media (ffmpeg_source) input in OBS, regardless of scene. */
    getMediaInputNames(): Promise<string[]> {
        return this.getInputNames('ffmpeg_source')
    }

    /** Names of every input of one kind (`GetInputList`'s `inputKind`), regardless of scene. */
    getInputNames(inputKind: string): Promise<string[]> {
        this.guardIsConnected()

        return this.webSocket.call('GetInputList', {inputKind})
            .then(r => r.inputs.map(i => (i.inputName ?? '').toString()).filter(n => n !== ''))
    }

    getSceneItemList(scene: ObsScene): Promise<RawObsItem[]> {
        this.guardIsConnected()

        return this.webSocket.call('GetSceneItemList', {'sceneName': scene.name})
            .then(r => {
                return r.sceneItems.map(i => {
                    return {
                        inputKind: (i.inputKind ?? '').toString(),
                        name: (i.sourceName ?? '').toString(),
                        uuid: (i.sceneItemId ?? '').toString()
                    }
                })
            })
    }

    getSceneList(): Promise<ObsScene[]> {
        this.guardIsConnected()
        return this.webSocket.call('GetSceneList')
            .then(r => {
                let scenes: ObsScene[] = r.scenes.map(i => {
                    return {
                        name: (i.sceneName ?? '').toString(),
                        uuid: (i.sceneUuid ?? '').toString()
                    }
                })
                return scenes
            })
    }

    // Restarts a media source by name, with no scene context needed — used by the controls page
    // to play a transition video before applying a stage change (obs-layout-plan.md §1.7).
    playMedia(sourceName: string): Promise<void> {
        this.guardIsConnected()
        return this.webSocket.call('TriggerMediaInputAction', {
            inputName: sourceName,
            mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'
        }).then(_ => {})
    }

    playSource(scene: ObsScene, sourceName: string, sourceUuid: string): Promise<boolean> {
        this.guardIsConnected()
        return this.webSocket.call('TriggerMediaInputAction', {
            inputUuid: sourceUuid,
            inputName: sourceName,
            mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART'
        }).then(r  => {
           return this.webSocket.call('GetMediaInputStatus', {
               inputUuid: sourceUuid,
               inputName: sourceName,
            }).then(r => {
                return r.mediaState == 'OBS_MEDIA_STATE_PLAYING'
            })
        })
    }

    showAndHideMediaSource(scene: ObsScene, item: ObsItem, callback: () => void): Promise<void> {
        this.guardIsConnected()
        return this.setSceneItemEnabled(scene.name, parseInt(item.uuid), true).then(_ => {
            this.addItemToHide(scene, item, callback)
        })
    }

    /**
     * Enables/disables a scene item by scene name + numeric item id (`SetSceneItemEnabled`) — the
     * shape the camera-shelf stage hook uses (obs-camera-shelf-plan.md §6:
     * `elements/camera-shelf/mount.ts`), and also what `showAndHideMediaSource`/
     * `mediaSourcePlaybackEnded` below reduce their `ObsScene`/`ObsItem` args to. Public (was a
     * private `(scene: ObsScene, item: ObsItem, isEnabled)` overload of the same name before this)
     * — every caller in this class now goes through this one signature instead of keeping two
     * methods with the same name and incompatible parameter shapes.
     */
    setSceneItemEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void> {
        this.guardIsConnected()
        return this.webSocket.call('SetSceneItemEnabled', {
            sceneName,
            sceneItemId,
            sceneItemEnabled: enabled,
        }).then(_ => {})
    }

    private mediaSourcePlaybackEnded(name: string, uuid: string) {
        let item = this.mediaSourcesHideAfterPlayback.find(i => i.item.name == name)

        if (item) {
            this.setSceneItemEnabled(item.scene.name, parseInt(item.item.uuid), false).then(_ => item.callback())
        }
    }

    /** Current program scene's name (`GetCurrentProgramScene`). `currentProgramSceneName` is the
     *  request's newer field; `sceneName` is kept as a fallback for an older obs-websocket server
     *  that only ever sent the deprecated name (obs-camera-shelf-plan.md §6). */
    getCurrentProgramSceneName(): Promise<string> {
        this.guardIsConnected()
        return this.webSocket.call('GetCurrentProgramScene').then(r => r.currentProgramSceneName || r.sceneName)
    }

    /**
     * Resolves an OBS source name to its scene item id WITHIN THE CURRENT PROGRAM SCENE
     * (obs-camera-shelf-plan.md §6) — `null` if no item of that exact name sits directly in it.
     * Items inside groups or nested scenes are not searched (a stated limitation, surfaced in
     * CameraShelfSettings' OBS source help text: "the camera must be a direct item of the program
     * scene").
     */
    findSceneItemInProgramScene(sourceName: string): Promise<{ scene: string; id: number } | null> {
        this.guardIsConnected()
        return this.getCurrentProgramSceneName().then(scene =>
            this.webSocket.call('GetSceneItemList', { sceneName: scene }).then(r => {
                const match = r.sceneItems.find(i => (i.sourceName ?? '').toString() === sourceName)
                if (!match) return null
                return { scene, id: parseInt((match.sceneItemId ?? '').toString(), 10) }
            })
        )
    }

    /** A scene item's RENDERED aspect ratio (w/h), source minus crop then scaled/bounded — what
     *  CameraShelfSettings' "Read from OBS" button reads into `cameraAspect` (obs-camera-shelf-plan.md
     *  §7) so the settings panel can show the gap-fill readout without the operator eyeballing it.
     *
     *  `boundsType`:
     *  - `OBS_BOUNDS_NONE` — aspect = (cw * scaleX) / (ch * scaleY).
     *  - `OBS_BOUNDS_SCALE_INNER` — the cropped source's own aspect (cw / ch): it is fit INSIDE the
     *    bounds box, so the bounds box's own aspect is irrelevant to what's actually drawn.
     *  - anything else (`SCALE_OUTER`/`STRETCH`/`MAX_ONLY`/`SCALE_TO_WIDTH`/`SCALE_TO_HEIGHT`) —
     *    approximated as boundsWidth / boundsHeight (documented as approximate in the settings help
     *    text). */
    getSceneItemRenderedAspect(sceneName: string, sceneItemId: number): Promise<number> {
        this.guardIsConnected()
        return this.webSocket.call('GetSceneItemTransform', { sceneName, sceneItemId }).then(r => {
            const t = r.sceneItemTransform as Record<string, unknown>
            const n = (k: string, d = 0) => { const v = Number(t[k]); return Number.isFinite(v) ? v : d }
            const cw = n('sourceWidth') - n('cropLeft') - n('cropRight')
            const ch = n('sourceHeight') - n('cropTop') - n('cropBottom')
            const bounds = String(t.boundsType ?? 'OBS_BOUNDS_NONE')

            if (bounds === 'OBS_BOUNDS_NONE') {
                const w = cw * n('scaleX', 1)
                const h = ch * n('scaleY', 1)
                return h > 0 ? w / h : 0
            }
            if (bounds === 'OBS_BOUNDS_SCALE_INNER') {
                return ch > 0 ? cw / ch : 0
            }
            const bw = n('boundsWidth')
            const bh = n('boundsHeight')
            return bh > 0 ? bw / bh : 0
        })
    }

    /** Names of every scene item directly in the current program scene — for the camera-shelf
     *  settings panel's OBS-source dropdown (obs-camera-shelf-plan.md §7). */
    getProgramSceneItemNames(): Promise<string[]> {
        this.guardIsConnected()
        return this.getCurrentProgramSceneName().then(scene =>
            this.webSocket.call('GetSceneItemList', { sceneName: scene }).then(r =>
                r.sceneItems.map(i => (i.sourceName ?? '').toString()).filter(n => n !== '')
            )
        )
    }

    private addItemToHide(scene: ObsScene, item: ObsItem, callback: () => void) {
        this.mediaSourcesHideAfterPlayback.push({scene: scene, item: item, callback: callback})
    }
}