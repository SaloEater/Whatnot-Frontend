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


    connect() {
        let password = undefined
        try {
            this.webSocket.connect(this.url, password, {
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
        }
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