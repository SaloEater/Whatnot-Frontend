'use client'

import React, {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {IsTeam, Teams} from "@/app/common/teams";
import {sortBreaksById} from "@/app/common/breaks";
import {getEndpoints, post} from "@/app/lib/backend";
import {AddBreakResponse, Event, GetChannelsChannel, GiveawayTypeNone, WNBreak} from "@/app/entity/entities";

const COL_ORDER_ID = 0
const COL_TITLE = 1
const COL_TEAM = 2
const COL_USERNAME = 4
const COL_PRICE = 6

interface ParsedRow {
    orderId: string
    breakName: string
    team: string
    username: string
    price: number
}

interface BreakValidation {
    breakName: string
    valid: boolean
    missingTeams: string[]
    teamsWithoutBuyer: {team: string; orderId: string}[]
    customSpotCount: number
    buyerCount: number
    rows: ParsedRow[]
    targetBreakId: number
}

function parseCsv(content: string): ParsedRow[] {
    let lines = content.split('\n').filter(l => l.trim() !== '')
    if (lines.length < 2) return []
    lines = lines.slice(1)
    return lines.map(line => {
        const cols = line.split(',')
        const orderId = (cols[COL_ORDER_ID] ?? '').trim()
        const breakName = (cols[COL_TITLE] ?? '').trim()
        const team = (cols[COL_TEAM] ?? '').trim()
        const username = (cols[COL_USERNAME] ?? '').trim()
        const priceStr = (cols[COL_PRICE] ?? '').replace('$', '').trim()
        const price = parseFloat(priceStr) || 0
        return {orderId, breakName, team, username, price}
    }).filter(r => r.breakName !== '' && r.team !== '')
}

function tryMatch(csvName: string, breaks: WNBreak[]): WNBreak | null {
    const lower = csvName.toLowerCase()
    return breaks.find(b => b.name.toLowerCase() === lower) ?? null
}

function validateBreaks(rows: ParsedRow[], breaks: WNBreak[]): BreakValidation[] {
    const grouped = new Map<string, ParsedRow[]>()
    for (const row of rows) {
        if (!grouped.has(row.breakName)) grouped.set(row.breakName, [])
        grouped.get(row.breakName)!.push(row)
    }

    const results: BreakValidation[] = []
    for (const [breakName, breakRows] of Array.from(grouped)) {
        const presentTeams = new Set(breakRows.filter(r => IsTeam(r.team)).map(r => r.team))
        const missingTeams = Teams.filter(t => !presentTeams.has(t))
        const teamsWithoutBuyer = breakRows.filter(r => IsTeam(r.team) && r.username === '').map(r => ({team: r.team, orderId: r.orderId}))
        const customSpotCount = breakRows.filter(r => !IsTeam(r.team)).length
        const uniqueBuyers = new Set(breakRows.filter(r => r.username !== '').map(r => r.username))
        results.push({
            breakName,
            valid: missingTeams.length === 0 && teamsWithoutBuyer.length === 0,
            missingTeams,
            teamsWithoutBuyer,
            customSpotCount,
            buyerCount: uniqueBuyers.size,
            rows: breakRows,
            targetBreakId: tryMatch(breakName, breaks)?.id ?? 0,
        })
    }
    return results
}

function getDuplicateTargetIds(validations: BreakValidation[]): Set<number> {
    const counts = new Map<number, number>()
    for (const v of validations) {
        if (v.targetBreakId === 0) continue
        counts.set(v.targetBreakId, (counts.get(v.targetBreakId) ?? 0) + 1)
    }
    const dup = new Set<number>()
    for (const [id, count] of Array.from(counts)) {
        if (count > 1) dup.add(id)
    }
    return dup
}

export default function Page({params}: {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [selectedType, setSelectedType] = useState('')
    const [breaks, setBreaks] = useState<WNBreak[]>([])
    const [validations, setValidations] = useState<BreakValidation[] | null>(null)
    const [progress, setProgress] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [highBidTeam, setHighBidTeam] = useState('')

    useEffect(() => {
        post(getEndpoints().channel_by_stream, {stream_id: streamId}).then((data: GetChannelsChannel) => {
            if (data) setHighBidTeam(data.default_high_bid_team ?? '')
        })
        post(getEndpoints().stream_breaks, {id: streamId}).then((b: WNBreak[]) => setBreaks(sortBreaksById(b)))
    }, []);

    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const content = ev.target?.result as string
            const rows = parseCsv(content)
            setValidations(validateBreaks(rows, breaks))
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    function setTargetBreak(breakName: string, breakId: number) {
        setValidations(old => old!.map(v => v.breakName === breakName ? {...v, targetBreakId: breakId} : v))
    }

    function getEffectiveMissingTeams(v: BreakValidation): string[] {
        if (!highBidTeam) return v.missingTeams
        return v.missingTeams.filter(t => t !== highBidTeam)
    }

    function isEffectivelyValid(v: BreakValidation): boolean {
        return getEffectiveMissingTeams(v).length === 0 && v.teamsWithoutBuyer.length === 0
    }

    async function handleContinue() {
        if (!validations) return
        const date = (new Date()).toISOString()

        for (let i = 0; i < validations.length; i++) {
            const v = validations[i]

            if (v.targetBreakId === 0) {
                setProgress(`Creating break ${i + 1} of ${validations.length}: ${v.breakName}…`)

                const breakBody: WNBreak = {
                    id: 0,
                    day_id: streamId,
                    name: v.breakName,
                    start_date: date,
                    end_date: date,
                    is_deleted: false,
                    high_bid_floor: 0,
                    high_bid_team: '',
                    giveaway_team: '',
                }

                const response: AddBreakResponse = await post(getEndpoints().break_add, breakBody)
                const breakId = response.id

                const teamRows = v.rows.filter(r => IsTeam(r.team))
                const customSpotRows = v.rows.filter(r => !IsTeam(r.team))

                for (let j = 0; j < Teams.length; j++) {
                    const teamName = Teams[j]
                    const teamRow = teamRows.find(r => r.team === teamName)
                    const eventBody: Event = {
                        id: 0,
                        index: j,
                        giveaway_type: GiveawayTypeNone,
                        break_id: breakId,
                        customer: teamRow?.username ?? '',
                        price: teamRow?.price ?? 0,
                        team: teamName,
                        is_giveaway: false,
                        note: '',
                        quantity: 0,
                    }
                    await post(getEndpoints().event_add, eventBody)
                }

                for (let j = 0; j < customSpotRows.length; j++) {
                    const row = customSpotRows[j]
                    const eventBody: Event = {
                        id: 0,
                        index: Teams.length + j,
                        giveaway_type: GiveawayTypeNone,
                        break_id: breakId,
                        customer: row.username,
                        price: row.price,
                        team: row.team,
                        is_giveaway: false,
                        note: '',
                        quantity: 0,
                    }
                    await post(getEndpoints().event_add, eventBody)
                }
            } else {
                setProgress(`Importing into existing break ${i + 1} of ${validations.length}: ${v.breakName}…`)

                const breakId = v.targetBreakId
                const resp: {events: Event[]} = await post(getEndpoints().break_events, {break_id: breakId})
                const existingEvents = (resp.events ?? []).filter(e => !e.is_giveaway)

                const queue = new Map<string, Event[]>()
                for (const ev of existingEvents) {
                    if (!queue.has(ev.team)) queue.set(ev.team, [])
                    queue.get(ev.team)!.push(ev)
                }
                for (const list of Array.from(queue.values())) {
                    list.sort((a, b) => a.index - b.index)
                }

                let nextIndex = existingEvents.length > 0
                    ? Math.max(...existingEvents.map(e => e.index)) + 1
                    : Teams.length

                for (const row of v.rows) {
                    const list = queue.get(row.team)
                    const existing = list && list.length > 0 ? list.shift() : undefined

                    if (existing) {
                        if (existing.customer !== row.username || existing.price !== row.price) {
                            await post(getEndpoints().event_update, {...existing, customer: row.username, price: row.price})
                        }
                    } else {
                        const eventBody: Event = {
                            id: 0,
                            index: nextIndex,
                            giveaway_type: GiveawayTypeNone,
                            break_id: breakId,
                            customer: row.username,
                            price: row.price,
                            team: row.team,
                            is_giveaway: false,
                            note: '',
                            quantity: 0,
                        }
                        nextIndex++
                        await post(getEndpoints().event_add, eventBody)
                    }
                }
            }
        }

        setProgress(null)
        setDone(true)
    }

    const duplicateTargetIds = validations ? getDuplicateTargetIds(validations) : new Set<number>()
    const hasDuplicateTargets = duplicateTargetIds.size > 0
    const allValid = validations !== null && validations.every(v => isEffectivelyValid(v)) && !hasDuplicateTargets

    if (done) {
        return (
            <main className="d-flex justify-content-center mt-4">
                <div className="text-center">
                    <div className="alert alert-success">All breaks imported successfully.</div>
                    <button className="btn btn-primary" onClick={() => router.push(`/stream/${streamId}`)}>
                        Back to stream
                    </button>
                </div>
            </main>
        )
    }

    return (
        <main className="d-flex justify-content-center mt-4">
            <div style={{minWidth: 500}}>
                <h4>Import livestream</h4>

                <div className="mb-3">
                    <label className="form-label">Select type</label>
                    <select
                        className="form-select"
                        value={selectedType}
                        onChange={e => {
                            setSelectedType(e.target.value)
                            setValidations(null)
                        }}
                    >
                        <option value="">— select —</option>
                        <option value="whatnot">WhatNot</option>
                    </select>
                </div>

                {selectedType === 'whatnot' && !validations && (
                    <div className="mb-3">
                        <input type="file" accept=".csv" ref={fileInputRef} className="d-none" onChange={handleFileSelected}/>
                        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                            Upload CSV
                        </button>
                    </div>
                )}

                {validations && (
                    <>
                        <table className="table table-bordered mt-3">
                            <thead>
                                <tr>
                                    <th>Break</th>
                                    <th>Status</th>
                                    <th>Buyers</th>
                                    <th>Custom spots</th>
                                    <th>High bid team</th>
                                    <th>Import into</th>
                                </tr>
                            </thead>
                            <tbody>
                                {validations.map(v => (
                                    <tr key={v.breakName}>
                                        <td>{v.breakName}</td>
                                        <td>
                                            {isEffectivelyValid(v)
                                                ? <span className="text-success">Valid</span>
                                                : <span className="text-danger">Invalid</span>
                                            }
                                        </td>
                                        <td>{v.buyerCount}</td>
                                        <td>{v.customSpotCount}</td>
                                        <td>
                                            {highBidTeam && v.missingTeams.includes(highBidTeam)
                                                ? highBidTeam
                                                : '—'
                                            }
                                        </td>
                                        <td>
                                            <select
                                                className={`form-select form-select-sm ${v.targetBreakId !== 0 && duplicateTargetIds.has(v.targetBreakId) ? 'is-invalid' : ''}`}
                                                value={v.targetBreakId}
                                                onChange={e => setTargetBreak(v.breakName, parseInt(e.target.value))}
                                            >
                                                <option value={0}>— Create new break —</option>
                                                {breaks.map(b => (
                                                    <option key={b.id} value={b.id}>{b.name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {hasDuplicateTargets && (
                            <div className="text-danger small mb-2">
                                Multiple CSV breaks are targeting the same existing break. Each existing break can only be targeted by one CSV break.
                            </div>
                        )}

                        {!allValid && (() => {
                            const errors = validations.flatMap(v => [
                                ...getEffectiveMissingTeams(v).map(t => ({orderId: '', error: `${v.breakName}: missing team "${t}"`})),
                                ...v.teamsWithoutBuyer.map(t => ({orderId: t.orderId, error: `${v.breakName}: no buyer for "${t.team}"`})),
                            ])
                            if (errors.length === 0) return null
                            return (
                                <table className="table table-bordered table-sm mt-2">
                                    <thead>
                                        <tr><th>Order ID</th><th>Error</th></tr>
                                    </thead>
                                    <tbody>
                                        {errors.map((e, i) => (
                                            <tr key={i} className="text-danger">
                                                <td>{e.orderId || '—'}</td>
                                                <td>{e.error}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )
                        })()}

                        {progress && (
                            <div className="alert alert-info">{progress}</div>
                        )}

                        <div className="d-flex gap-2">
                            <button
                                className="btn btn-primary"
                                disabled={!allValid || !!progress}
                                onClick={handleContinue}
                            >
                                Continue
                            </button>
                            <button className="btn btn-secondary" onClick={() => router.push(`/stream/${streamId}`)}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}
            </div>
        </main>
    )
}
