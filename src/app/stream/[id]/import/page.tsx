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
            valid: teamsWithoutBuyer.length === 0,
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

type PlannedAction = 'create' | 'update' | 'unchanged'

interface PlannedEvent {
    action: PlannedAction
    team: string
    index: number
    customer: string
    price: number
    prevCustomer: string
    prevPrice: number
    existing: Event | null
}

interface BreakPlan {
    breakName: string
    targetBreakId: number
    targetBreakName: string
    events: PlannedEvent[]
}

function planNewBreak(v: BreakValidation): PlannedEvent[] {
    const teamRows = v.rows.filter(r => IsTeam(r.team))
    const customSpotRows = v.rows.filter(r => !IsTeam(r.team))

    const events: PlannedEvent[] = Teams.map((teamName, j) => {
        const teamRow = teamRows.find(r => r.team === teamName)
        return {
            action: 'create' as PlannedAction,
            team: teamName,
            index: j,
            customer: teamRow?.username ?? '',
            price: teamRow?.price ?? 0,
            prevCustomer: '',
            prevPrice: 0,
            existing: null,
        }
    })

    customSpotRows.forEach((row, j) => {
        events.push({
            action: 'create',
            team: row.team,
            index: Teams.length + j,
            customer: row.username,
            price: row.price,
            prevCustomer: '',
            prevPrice: 0,
            existing: null,
        })
    })

    return events
}

function planExistingBreak(v: BreakValidation, existingEvents: Event[]): PlannedEvent[] {
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

    const events: PlannedEvent[] = []
    for (const row of v.rows) {
        const list = queue.get(row.team)
        const existing = list && list.length > 0 ? list.shift() : undefined

        if (existing) {
            const changed = existing.customer !== row.username || existing.price !== row.price
            events.push({
                action: changed ? 'update' : 'unchanged',
                team: row.team,
                index: existing.index,
                customer: row.username,
                price: row.price,
                prevCustomer: existing.customer,
                prevPrice: existing.price,
                existing,
            })
        } else {
            events.push({
                action: 'create',
                team: row.team,
                index: nextIndex,
                customer: row.username,
                price: row.price,
                prevCustomer: '',
                prevPrice: 0,
                existing: null,
            })
            nextIndex++
        }
    }
    return events
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
    const [plan, setPlan] = useState<BreakPlan[] | null>(null)
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
            setPlan(null)
            setValidations(validateBreaks(rows, breaks))
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    function setTargetBreak(breakName: string, breakId: number) {
        setPlan(null)
        setValidations(old => old!.map(v => v.breakName === breakName ? {...v, targetBreakId: breakId} : v))
    }

    function isEffectivelyValid(v: BreakValidation): boolean {
        return v.teamsWithoutBuyer.length === 0
    }

    async function handlePrepare() {
        if (!validations) return
        setProgress('Preparing import…')

        const plans: BreakPlan[] = []
        for (let i = 0; i < validations.length; i++) {
            const v = validations[i]

            if (v.targetBreakId === 0) {
                plans.push({
                    breakName: v.breakName,
                    targetBreakId: 0,
                    targetBreakName: '',
                    events: planNewBreak(v),
                })
                continue
            }

            setProgress(`Reading existing break ${i + 1} of ${validations.length}: ${v.breakName}…`)
            const resp: {events: Event[]} = await post(getEndpoints().break_events, {break_id: v.targetBreakId})
            const existingEvents = (resp.events ?? []).filter(e => !e.is_giveaway)
            plans.push({
                breakName: v.breakName,
                targetBreakId: v.targetBreakId,
                targetBreakName: breaks.find(b => b.id === v.targetBreakId)?.name ?? `#${v.targetBreakId}`,
                events: planExistingBreak(v, existingEvents),
            })
        }

        setProgress(null)
        setPlan(plans)
    }

    async function handleContinue() {
        if (!plan) return
        const date = (new Date()).toISOString()

        for (let i = 0; i < plan.length; i++) {
            const p = plan[i]

            let breakId = p.targetBreakId
            if (breakId === 0) {
                setProgress(`Creating break ${i + 1} of ${plan.length}: ${p.breakName}…`)

                const breakBody: WNBreak = {
                    id: 0,
                    day_id: streamId,
                    name: p.breakName,
                    start_date: date,
                    end_date: date,
                    is_deleted: false,
                    high_bid_floor: 0,
                    high_bid_team: '',
                    giveaway_team: '',
                }

                const response: AddBreakResponse = await post(getEndpoints().break_add, breakBody)
                breakId = response.id
            } else {
                setProgress(`Importing into existing break ${i + 1} of ${plan.length}: ${p.breakName}…`)
            }

            for (const e of p.events) {
                if (e.action === 'unchanged') continue

                if (e.action === 'update' && e.existing) {
                    await post(getEndpoints().event_update, {...e.existing, customer: e.customer, price: e.price})
                    continue
                }

                const eventBody: Event = {
                    id: 0,
                    index: e.index,
                    giveaway_type: GiveawayTypeNone,
                    break_id: breakId,
                    customer: e.customer,
                    price: e.price,
                    team: e.team,
                    is_giveaway: false,
                    note: '',
                    quantity: 0,
                }
                await post(getEndpoints().event_add, eventBody)
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
                            setPlan(null)
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
                            const errors = validations.flatMap(v =>
                                v.teamsWithoutBuyer.map(t => ({orderId: t.orderId, error: `${v.breakName}: no buyer for "${t.team}"`})),
                            )
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

                        {plan && (
                            <div className="mt-4">
                                <h5>Import report</h5>
                                <p className="text-muted small">
                                    Review the changes below. Nothing has been written yet — press Continue to apply them.
                                </p>

                                {plan.map(p => {
                                    const creates = p.events.filter(e => e.action === 'create')
                                    const updates = p.events.filter(e => e.action === 'update')
                                    const unchanged = p.events.filter(e => e.action === 'unchanged')
                                    const emptyCreates = creates.filter(e => e.customer === '')
                                    const shown = [...updates, ...creates.filter(e => e.customer !== '')]
                                        .sort((a, b) => a.index - b.index)

                                    return (
                                        <div key={p.breakName} className="mb-4">
                                            <div className="fw-bold">
                                                {p.targetBreakId === 0
                                                    ? <>Create new break &quot;{p.breakName}&quot;</>
                                                    : <>Import &quot;{p.breakName}&quot; into existing break &quot;{p.targetBreakName}&quot;</>
                                                }
                                            </div>
                                            <div className="small text-muted mb-2">
                                                {creates.length} added, {updates.length} updated, {unchanged.length} unchanged
                                            </div>

                                            {shown.length > 0 && (
                                                <table className="table table-bordered table-sm">
                                                    <thead>
                                                        <tr>
                                                            <th>Team / spot</th>
                                                            <th>Action</th>
                                                            <th>Customer</th>
                                                            <th>Price</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {shown.map((e, i) => (
                                                            <tr key={`${e.team}-${e.index}-${i}`}>
                                                                <td>{e.team}</td>
                                                                <td>{e.action === 'create' ? 'Add' : 'Update'}</td>
                                                                <td>
                                                                    {e.action === 'update' && e.prevCustomer !== e.customer
                                                                        ? <>{e.prevCustomer || '—'} → <b>{e.customer || '—'}</b></>
                                                                        : (e.customer || '—')
                                                                    }
                                                                </td>
                                                                <td>
                                                                    {e.action === 'update' && e.prevPrice !== e.price
                                                                        ? <>${e.prevPrice} → <b>${e.price}</b></>
                                                                        : <>${e.price}</>
                                                                    }
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}

                                            {emptyCreates.length > 0 && (
                                                <div className="small text-muted">
                                                    + {emptyCreates.length} empty slot{emptyCreates.length === 1 ? '' : 's'} with no customer
                                                    ({emptyCreates.map(e => e.team).join(', ')})
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {progress && (
                            <div className="alert alert-info">{progress}</div>
                        )}

                        <div className="d-flex gap-2">
                            {!plan ? (
                                <button
                                    className="btn btn-primary"
                                    disabled={!allValid || !!progress}
                                    onClick={handlePrepare}
                                >
                                    Prepare import
                                </button>
                            ) : (
                                <button
                                    className="btn btn-primary"
                                    disabled={!!progress}
                                    onClick={handleContinue}
                                >
                                    Continue
                                </button>
                            )}
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
