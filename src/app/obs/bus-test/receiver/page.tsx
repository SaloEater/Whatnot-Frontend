'use client'

import {useEffect, useState} from "react";
import './receiver.css'

interface LogEntry {
    time: string
    source: string
    typeOf: string
    text: string
    totalLength: number
}

const MAX_ENTRIES = 50
const TRUNCATE_AT = 500

function formatDetail(detail: unknown): { typeOf: string, text: string, totalLength: number } {
    const typeOf = typeof detail
    let full: string
    try {
        full = JSON.stringify(detail) ?? String(detail)
    } catch (e) {
        full = `<unserializable: ${e}>`
    }
    const truncated = full.length > TRUNCATE_AT ? full.slice(0, TRUNCATE_AT) + '…' : full
    return {typeOf, text: truncated, totalLength: full.length}
}

export default function Page() {
    const [mountedAt, setMountedAt] = useState('')
    const [entries, setEntries] = useState<LogEntry[]>([])
    const [receivedCount, setReceivedCount] = useState(0)

    useEffect(() => {
        setMountedAt(new Date().toISOString())
        function pushEntry(source: string, detail: unknown) {
            const {typeOf, text, totalLength} = formatDetail(detail)
            setReceivedCount(c => c + 1)
            const entry: LogEntry = {
                time: new Date().toISOString(),
                source,
                typeOf,
                text,
                totalLength,
            }
            setEntries(prev => [entry, ...prev].slice(0, MAX_ENTRIES))
        }

        function onTrigger(e: Event) {
            const detail = (e as CustomEvent).detail
            pushEntry('obs', detail)
        }

        window.addEventListener('mob:trigger', onTrigger)

        let bc: BroadcastChannel | null = null
        try {
            bc = new BroadcastChannel('mob:bus')
            bc.onmessage = (e: MessageEvent) => {
                pushEntry('[dev]', e.data)
            }
        } catch (e) {
            console.log('BroadcastChannel unavailable', e)
        }

        return () => {
            window.removeEventListener('mob:trigger', onTrigger)
            if (bc) {
                bc.onmessage = null
                bc.close()
            }
        }
    }, []);

    return <div className='bt-page'>
        <div className='bt-header'>
            <div>mounted at {mountedAt}</div>
            <div>received: {receivedCount}</div>
        </div>
        <div className='bt-log'>
            {entries.map((entry, i) => (
                <div key={i} className='bt-entry'>
                    <div className='bt-entry-meta'>
                        [{entry.source}] {entry.time} typeof={entry.typeOf} len={entry.totalLength}
                    </div>
                    <div className='bt-entry-text'>{entry.text}</div>
                </div>
            ))}
        </div>
    </div>
}
