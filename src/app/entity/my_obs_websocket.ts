import {Logger} from "@/app/entity/logger";
import OBSWebSocket, {EventSubscription, OBSRequestTypes} from "obs-websocket-js";
import {ObsItem, ObsScene, RawObsItem} from "@/app/entity/entities";

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
                this.setConnected()
                this.webSocket.on('ConnectionOpened', () => this.log('Connection opened'))
                this.webSocket.on('ConnectionClosed', (e) => {
                    this.setDisconnect()
                    this.log(`Connection closed ${e.message}`)
                })
                this.webSocket.on('ConnectionError', (e) => {
                    this.setDisconnect()
                    this.log(`Connection error: (${e.code}) ${e.message}`)
                })
                this.webSocket.on('Hello', () => {
                    this.log(`Greet server`)
                })
                this.webSocket.on('Identified', () => {
                    this.log(`Client is identified, set to connected state`)
                })
                this.webSocket.on('MediaInputPlaybackEnded', r => this.mediaSourcePlaybackEnded(r.inputName, r.inputUuid))
            }).catch(e => this.log(`Connect error: ${JSON.stringify(e)}`))
        } catch (error) {
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
        return this.setSceneItemEnabled(scene, item, true).then(_ => {
            this.addItemToHide(scene, item, callback)
        })
    }

    private setSceneItemEnabled(scene: ObsScene, item: ObsItem, isEnabled: boolean) {
        return this.webSocket.call('SetSceneItemEnabled', {
            sceneName: scene.name,
            sceneItemId: parseInt(item.uuid),
            sceneItemEnabled: isEnabled,
        });
    }

    private mediaSourcePlaybackEnded(name: string, uuid: string) {
        let item = this.mediaSourcesHideAfterPlayback.find(i => i.item.name == name)

        if (item) {
            this.setSceneItemEnabled(item.scene, item.item, false).then(_ => item.callback())
        }
    }

    private addItemToHide(scene: ObsScene, item: ObsItem, callback: () => void) {
        this.mediaSourcesHideAfterPlayback.push({scene: scene, item: item, callback: callback})
    }
}