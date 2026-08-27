'use client'

import {useEffect, useRef, useState} from "react";
import {WebSocketUrlComponent} from "@/app/obs/manage/[id]/web_socket_url_component";
import {ConnectedComponent} from "@/app/obs/manage/[id]/connected_component";
import {LogComponent} from "@/app/obs/manage/[id]/logComponent";
import {useOSBWebhook} from "@/app/component/useOSBWebhook";
import {ComponentLogger} from "@/app/entity/logger";

const OBS_WS_URL = 'OBS_WS_URL';
const EVENT_NAME = 'mob:trigger';

export default function Page() {
    const [url, setUrl] = useState('ws://localhost:4455')
    const [logger] = useState(new ComponentLogger())
    const [isConnected, setIsConnected] = useState(false)
    const obs = useOSBWebhook(url, logger, setIsConnected)
    const [counter, setCounter] = useState(0)
    const [customJson, setCustomJson] = useState('{\n  "kind": "custom"\n}')
    const [customError, setCustomError] = useState<string | null>(null)
    const bcRef = useRef<BroadcastChannel | null>(null)

    useEffect(() => {
        setUrl((old) => localStorage.getItem(OBS_WS_URL) ?? old)
    }, []);

    useEffect(() => {
        localStorage.setItem(OBS_WS_URL, url)
    }, [url]);

    useEffect(() => {
        try {
            bcRef.current = new BroadcastChannel('mob:bus')
        } catch (e) {
            logger.add(`BroadcastChannel unavailable: ${e}`)
        }
        return () => {
            bcRef.current?.close()
            bcRef.current = null
        }
    }, []);

    function connect() {
        obs.connect()
    }

    function broadcastDev(payload: unknown) {
        try {
            bcRef.current?.postMessage(payload)
        } catch (e) {
            logger.add(`[dev] broadcast failed: ${e}`)
        }
    }

    function emit(label: string, payload: unknown) {
        broadcastDev(payload)
        if (!isConnected) {
            logger.add(`${label}: SKIPPED (not connected) payload=${safeStringify(payload)}`)
            return
        }
        logger.add(`${label}: sending payload=${safeStringify(payload)}`)
        obs.emitBrowserEvent(EVENT_NAME, payload)
            .then(() => logger.add(`${label}: OK`))
            .catch((e: unknown) => logger.add(`${label}: ERROR ${describeError(e)}`))
    }

    function safeStringify(value: unknown): string {
        try {
            const s = JSON.stringify(value) ?? String(value)
            return s.length > 200 ? s.slice(0, 200) + `…(${s.length} chars)` : s
        } catch (e) {
            return `<unserializable: ${e}>`
        }
    }

    function describeError(e: unknown): string {
        if (e instanceof Error) return e.message
        try {
            return JSON.stringify(e)
        } catch {
            return String(e)
        }
    }

    function onEmitObject() {
        const n = counter + 1
        setCounter(n)
        emit('emit object', {kind: 'ping', n, at: new Date().toISOString()})
    }

    function onEmitString() {
        emit('emit string', 'ping')
    }

    function onEmitBig() {
        const n = counter + 1
        setCounter(n)
        emit('emit big', {kind: 'big', n, blob: 'x'.repeat(20000)})
    }

    function onEmit10Fast() {
        logger.add(`emit 10 fast: sending 10 payloads with no awaits${isConnected ? '' : ' (SKIPPING obs emit, not connected)'}`)
        for (let n = 1; n <= 10; n++) {
            const payload = {kind: 'fast', n}
            broadcastDev(payload)
            if (!isConnected) {
                continue
            }
            obs.emitBrowserEvent(EVENT_NAME, payload)
                .then(() => logger.add(`emit 10 fast [n=${n}]: OK`))
                .catch((e: unknown) => logger.add(`emit 10 fast [n=${n}]: ERROR ${describeError(e)}`))
        }
    }

    function onEmitCustom() {
        setCustomError(null)
        let parsed: unknown
        try {
            parsed = JSON.parse(customJson)
        } catch (e) {
            setCustomError(e instanceof Error ? e.message : String(e))
            return
        }
        emit('emit custom', parsed)
    }

    return <div className='d-flex'>
        <div className='w-75 p-3'>
            <h4>OBS Bus Test Sender</h4>
            <WebSocketUrlComponent url={url} setUrl={setUrl}/>
            <div className='my-2'>
                <ConnectedComponent isConnected={isConnected} connect={connect}/>
            </div>
            {!isConnected && (
                <div className='alert alert-warning' role='alert'>
                    Not connected to OBS WebSocket — emits will be skipped (dev BroadcastChannel still fires).
                </div>
            )}
            <div className='d-flex flex-column gap-2 my-3' style={{maxWidth: 500}}>
                <button className='btn btn-primary' onClick={onEmitObject}>emit object</button>
                <button className='btn btn-primary' onClick={onEmitString}>emit string</button>
                <button className='btn btn-primary' onClick={onEmitBig}>emit big</button>
                <button className='btn btn-primary' onClick={onEmit10Fast}>emit 10 fast</button>
            </div>
            <div className='my-3' style={{maxWidth: 500}}>
                <div>emit custom (JSON):</div>
                <textarea
                    className='form-control'
                    rows={5}
                    value={customJson}
                    onChange={e => setCustomJson(e.target.value)}
                />
                {customError && <div className='text-danger'>Parse error: {customError}</div>}
                <button className='btn btn-secondary mt-2' onClick={onEmitCustom}>emit custom</button>
            </div>
        </div>
        <div className='w-25 p-3'>
            <LogComponent logger={logger}/>
        </div>
    </div>
}
