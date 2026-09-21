'use client'

// Transport probe for the OBS pages (obs-browser-event-bus.md). Open the SAME url in several
// places at once — an OBS browser source, an OBS custom browser dock, a plain Chrome tab — each
// with its own ?name=, and every instance shows which of the others can reach it and over what:
//
//   BroadcastChannel  same-origin pages in the same browser profile
//   storage event     same-origin pages in the same browser profile (the localStorage fallback)
//   mob:trigger       obs-browser's emit_event vendor request (one-way, into browser sources)
//
// Every instance heartbeats over the first two every HEARTBEAT_MS, so a browser source with no
// mouse still announces itself. The Ping button is for places that do have a mouse.
//
// It also dumps what `window.obsstudio` exposes here, so the question "does OBS inject any way to
// send OUT of a page" is answered by reading the key list rather than guessing.

import {useEffect, useRef, useState} from 'react'
import '../receiver/receiver.css'

const CHANNEL = 'mob:probe'
const STORAGE_KEY = 'mob:probe'
const HEARTBEAT_MS = 2000
const STALE_MS = 6000
const MAX_LOG = 40

type Transport = 'broadcast' | 'storage' | 'mob:trigger'

type Msg = {
    from: string
    name: string
    seq: number
    kind: 'heartbeat' | 'ping'
    hasObs: boolean
    sentAt: number
}

type Peer = {
    name: string
    hasObs: boolean
    seen: Partial<Record<Transport, { count: number; last: number }>>
}

type LogEntry = { time: string; transport: string; text: string }

function shortId(): string {
    return Math.random().toString(36).slice(2, 6)
}

function describeObsstudio(): { present: boolean; version: string; keys: string[] } {
    const o = (window as unknown as { obsstudio?: Record<string, unknown> }).obsstudio
    if (!o) return {present: false, version: '', keys: []}
    const keys: string[] = []
    for (const k in o) keys.push(`${k}:${typeof o[k]}`)
    return {present: true, version: String(o.pluginVersion ?? '?'), keys}
}

export default function Page() {
    const [me] = useState(() => shortId())
    const [name, setName] = useState('')
    const [obs, setObs] = useState<{ present: boolean; version: string; keys: string[] } | null>(null)
    const [controlLevel, setControlLevel] = useState<string>('—')
    const [peers, setPeers] = useState<Record<string, Peer>>({})
    const [log, setLog] = useState<LogEntry[]>([])
    const [now, setNow] = useState(0)
    const seqRef = useRef(0)
    const bcRef = useRef<BroadcastChannel | null>(null)
    const nameRef = useRef('')

    function pushLog(transport: string, text: string) {
        setLog((prev) => [{time: new Date().toISOString().slice(11, 23), transport, text}, ...prev].slice(0, MAX_LOG))
    }

    function notePeer(transport: Transport, m: Msg) {
        if (m.from === me) return
        setPeers((prev) => {
            const p: Peer = prev[m.from] ?? {name: m.name, hasObs: m.hasObs, seen: {}}
            const s = p.seen[transport] ?? {count: 0, last: 0}
            return {...prev, [m.from]: {...p, name: m.name, hasObs: m.hasObs, seen: {...p.seen, [transport]: {count: s.count + 1, last: Date.now()}}}}
        })
        if (m.kind === 'ping') pushLog(transport, `PING from ${m.name || m.from}`)
    }

    function send(kind: Msg['kind']) {
        const m: Msg = {from: me, name: nameRef.current, seq: ++seqRef.current, kind, hasObs: !!obs?.present, sentAt: Date.now()}
        try { bcRef.current?.postMessage(m) } catch (e) { pushLog('broadcast', `send failed: ${e}`) }
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(m)) } catch (e) { pushLog('storage', `write failed: ${e}`) }
        if (kind === 'ping') pushLog('self', `sent PING #${m.seq}`)
    }

    useEffect(() => {
        const n = new URLSearchParams(window.location.search).get('name') ?? me
        setName(n)
        nameRef.current = n
        const o = describeObsstudio()
        setObs(o)
        if (o.present) {
            const api = (window as unknown as { obsstudio: { getControlLevel?: (cb: (l: number) => void) => void } }).obsstudio
            try { api.getControlLevel?.((l) => setControlLevel(String(l))) } catch (e) { setControlLevel(`err ${e}`) }
        }

        try {
            const bc = new BroadcastChannel(CHANNEL)
            bc.onmessage = (e: MessageEvent) => notePeer('broadcast', e.data as Msg)
            bcRef.current = bc
        } catch (e) {
            pushLog('broadcast', `unavailable: ${e}`)
        }

        function onStorage(e: StorageEvent) {
            if (e.key !== STORAGE_KEY || !e.newValue) return
            try { notePeer('storage', JSON.parse(e.newValue) as Msg) } catch { /* ignore */ }
        }
        window.addEventListener('storage', onStorage)

        function onTrigger(e: Event) {
            const d = (e as CustomEvent).detail
            let text: string
            try { text = JSON.stringify(d) } catch { text = String(d) }
            pushLog('mob:trigger', text)
            setPeers((prev) => {
                const p: Peer = prev['obs-websocket'] ?? {name: 'emit_event', hasObs: false, seen: {}}
                const s = p.seen['mob:trigger'] ?? {count: 0, last: 0}
                return {...prev, 'obs-websocket': {...p, seen: {...p.seen, 'mob:trigger': {count: s.count + 1, last: Date.now()}}}}
            })
        }
        window.addEventListener('mob:trigger', onTrigger)

        const hb = setInterval(() => send('heartbeat'), HEARTBEAT_MS)
        const tick = setInterval(() => setNow(Date.now()), 500)
        send('heartbeat')

        return () => {
            clearInterval(hb)
            clearInterval(tick)
            window.removeEventListener('storage', onStorage)
            window.removeEventListener('mob:trigger', onTrigger)
            bcRef.current?.close()
            bcRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
    }, [])

    const ago = (t: number) => t ? `${((now - t) / 1000).toFixed(1)}s` : '—'
    const fresh = (t: number) => t && now - t < STALE_MS

    return (
        <div className="bt-page" style={{fontSize: '22px'}}>
            <div className="bt-header">
                <span>PROBE <b>{name}</b> ({me})</span>
                <span>obsstudio: {obs === null ? '…' : obs.present ? `YES v${obs.version} level=${controlLevel}` : 'NO (plain browser)'}</span>
                <button onClick={() => send('ping')} style={{fontSize: '22px', padding: '4px 16px'}}>Ping</button>
            </div>

            <div style={{marginBottom: 12, opacity: 0.8, fontSize: '16px'}}>
                obsstudio keys: {obs?.keys.length ? obs.keys.join('  ') : '(none)'}
            </div>

            <table style={{borderCollapse: 'collapse', marginBottom: 12}}>
                <thead>
                    <tr style={{borderBottom: '1px solid #33ff66'}}>
                        <th align="left">peer</th><th align="left">env</th>
                        <th align="left">broadcast</th><th align="left">storage</th><th align="left">mob:trigger</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(peers).map(([id, p]) => (
                        <tr key={id}>
                            <td style={{paddingRight: 24}}>{p.name} ({id})</td>
                            <td style={{paddingRight: 24}}>{id === 'obs-websocket' ? 'obs' : p.hasObs ? 'OBS' : 'browser'}</td>
                            {(['broadcast', 'storage', 'mob:trigger'] as Transport[]).map((t) => {
                                const s = p.seen[t]
                                return (
                                    <td key={t} style={{paddingRight: 24, color: s ? (fresh(s.last) ? '#33ff66' : '#999') : '#f44'}}>
                                        {s ? `${s.count}× ${ago(s.last)}` : 'none'}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                    {Object.keys(peers).length === 0 && <tr><td colSpan={5}>no peers seen yet</td></tr>}
                </tbody>
            </table>

            <div className="bt-log" style={{fontSize: '16px'}}>
                {log.map((e, i) => <div key={i}>{e.time} [{e.transport}] {e.text}</div>)}
            </div>
        </div>
    )
}
