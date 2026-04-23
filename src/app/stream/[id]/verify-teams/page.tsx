'use client'

import React, {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {getEndpoints, post} from "@/app/lib/backend";
import {Event, WNBreak} from "@/app/entity/entities";
import {sortBreaksById} from "@/app/common/breaks";

const COL_TITLE = 1
const COL_TEAM = 2
const COL_USERNAME = 4

interface ParsedRow {
    breakName: string
    team: string
    username: string
}

interface BreakMatch {
    csvName: string
    rows: ParsedRow[]
    matchedBreakId: number
}

interface TeamMismatch {
    breakName: string
    event: Event
    team: string
    csvCustomer: string
    dbCustomer: string
}

function parseCsv(content: string): ParsedRow[] {
    let lines = content.split('\n').filter(l => l.trim() !== '')
    if (lines.length < 2) return []
    lines = lines.slice(1)
    return lines.map(line => {
        const cols = line.split(',')
        const breakName = (cols[COL_TITLE] ?? '').trim()
        const team = (cols[COL_TEAM] ?? '').trim()
        const username = (cols[COL_USERNAME] ?? '').trim()
        return {breakName, team, username}
    }).filter(r => r.breakName !== '' && r.team !== '')
}

function groupByBreak(rows: ParsedRow[]): {csvName: string; rows: ParsedRow[]}[] {
    const map = new Map<string, ParsedRow[]>()
    for (const row of rows) {
        if (!map.has(row.breakName)) map.set(row.breakName, [])
        map.get(row.breakName)!.push(row)
    }
    return Array.from(map.entries()).map(([csvName, rows]) => ({csvName, rows}))
}

function tryMatch(csvName: string, breaks: WNBreak[]): WNBreak | null {
    const lower = csvName.toLowerCase()
    return breaks.find(b => b.name.toLowerCase() === lower) ?? null
}

export default function Page({params}: {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [breaks, setBreaks] = useState<WNBreak[]>([])
    const [matches, setMatches] = useState<BreakMatch[] | null>(null)
    const [mismatches, setMismatches] = useState<TeamMismatch[] | null>(null)
    const [progress, setProgress] = useState<string | null>(null)
    const [fixDone, setFixDone] = useState(false)

    useEffect(() => {
        post(getEndpoints().stream_breaks, {id: streamId})
            .then((b: WNBreak[]) => setBreaks(sortBreaksById(b)))
    }, [])

    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const content = ev.target?.result as string
            const rows = parseCsv(content)
            const groups = groupByBreak(rows)
            const initial: BreakMatch[] = groups.map(g => ({
                csvName: g.csvName,
                rows: g.rows,
                matchedBreakId: tryMatch(g.csvName, breaks)?.id ?? 0,
            }))
            setMatches(initial)
            setMismatches(null)
            setFixDone(false)
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    function setMatchBreak(csvName: string, breakId: number) {
        setMatches(old => old!.map(m => m.csvName === csvName ? {...m, matchedBreakId: breakId} : m))
    }

    const allMatched = matches !== null && matches.every(m => m.matchedBreakId !== 0)

    async function handleVerify() {
        if (!matches) return
        const results: TeamMismatch[] = []
        for (let i = 0; i < matches.length; i++) {
            const m = matches[i]
            setProgress(`Verifying ${i + 1} of ${matches.length}: ${m.csvName}…`)
            const resp: {events: Event[]} = await post(getEndpoints().break_events, {break_id: m.matchedBreakId})
            const dbEvents = (resp.events ?? []).filter(e => !e.is_giveaway)
            for (const row of m.rows.filter(r => r.team !== 'Miscellaneous')) {
                const dbEvent = dbEvents.find(e => e.team === row.team)
                if (!dbEvent) continue
                if (dbEvent.customer !== row.username) {
                    results.push({
                        breakName: m.csvName,
                        event: dbEvent,
                        team: row.team,
                        csvCustomer: row.username,
                        dbCustomer: dbEvent.customer,
                    })
                }
            }
        }
        setProgress(null)
        setMismatches(results)
    }

    async function handleAutoFix() {
        if (!mismatches) return
        for (let i = 0; i < mismatches.length; i++) {
            const mm = mismatches[i]
            setProgress(`Fixing ${i + 1} of ${mismatches.length}: ${mm.team}…`)
            await post(getEndpoints().event_update, {...mm.event, customer: mm.csvCustomer})
        }
        setProgress(null)
        setFixDone(true)
    }

    return (
        <main className="d-flex justify-content-center mt-4">
            <div style={{minWidth: 600}}>
                <h4>Verify teams</h4>

                {!matches && (
                    <div className="mb-3">
                        <input type="file" accept=".csv" ref={fileInputRef} className="d-none" onChange={handleFileSelected}/>
                        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                            Upload CSV
                        </button>
                    </div>
                )}

                {matches && mismatches === null && (
                    <>
                        <table className="table table-bordered mt-3">
                            <thead>
                                <tr>
                                    <th>CSV break</th>
                                    <th>Matched to</th>
                                </tr>
                            </thead>
                            <tbody>
                                {matches.map(m => (
                                    <tr key={m.csvName}>
                                        <td>{m.csvName}</td>
                                        <td>
                                            {m.matchedBreakId !== 0
                                                ? <span className="text-success">
                                                    ✓ {breaks.find(b => b.id === m.matchedBreakId)?.name}
                                                  </span>
                                                : <select
                                                    className="form-select form-select-sm"
                                                    value=""
                                                    onChange={e => setMatchBreak(m.csvName, parseInt(e.target.value))}
                                                >
                                                    <option value="">— select break —</option>
                                                    {breaks.map(b => (
                                                        <option key={b.id} value={b.id}>{b.name}</option>
                                                    ))}
                                                  </select>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {progress && <div className="alert alert-info">{progress}</div>}

                        <div className="d-flex gap-2">
                            <button
                                className="btn btn-primary"
                                disabled={!allMatched || !!progress}
                                onClick={handleVerify}
                            >
                                Verify
                            </button>
                            <button className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}`)}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                {mismatches !== null && (
                    <>
                        {mismatches.length === 0 && !fixDone && (
                            <div className="alert alert-success">All teams match!</div>
                        )}

                        {fixDone && (
                            <div className="alert alert-success">Fixed successfully.</div>
                        )}

                        {mismatches.length > 0 && !fixDone && (
                            <>
                                <table className="table table-bordered mt-3">
                                    <thead>
                                        <tr>
                                            <th>Break</th>
                                            <th>Team</th>
                                            <th>CSV customer</th>
                                            <th>Your customer</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mismatches.map((mm, i) => (
                                            <tr key={i}>
                                                <td>{mm.breakName}</td>
                                                <td>{mm.team}</td>
                                                <td className="text-success">{mm.csvCustomer || <em className="text-muted">empty</em>}</td>
                                                <td className="text-danger">{mm.dbCustomer || <em className="text-muted">empty</em>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {progress && <div className="alert alert-info">{progress}</div>}

                                <div className="d-flex gap-2">
                                    <button
                                        className="btn btn-warning"
                                        disabled={!!progress}
                                        onClick={handleAutoFix}
                                    >
                                        Auto-fix {mismatches.length} mismatch{mismatches.length !== 1 ? 'es' : ''}
                                    </button>
                                    <button className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}`)}>
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}

                        {(mismatches.length === 0 || fixDone) && (
                            <button className="btn btn-primary mt-2" onClick={() => router.push(`/stream/${streamId}`)}>
                                Back to stream
                            </button>
                        )}
                    </>
                )}

                {!matches && (
                    <button className="btn btn-secondary mt-2" onClick={() => router.push(`/stream/${streamId}`)}>
                        Cancel
                    </button>
                )}
            </div>
        </main>
    )
}
