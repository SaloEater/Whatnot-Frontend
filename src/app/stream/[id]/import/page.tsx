'use client'

import React, {useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {Teams} from "@/app/common/teams";
import {getEndpoints, post} from "@/app/lib/backend";
import {AddBreakResponse, Event, GiveawayTypeNone, WNBreak} from "@/app/entity/entities";

const COL_TITLE = 1
const COL_TEAM = 2
const COL_USERNAME = 4
const COL_PRICE = 6

interface ParsedRow {
    breakName: string
    team: string
    username: string
    price: number
}

interface BreakValidation {
    breakName: string
    valid: boolean
    missingTeams: string[]
    miscCount: number
    buyerCount: number
    rows: ParsedRow[]
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
        const priceStr = (cols[COL_PRICE] ?? '').replace('$', '').trim()
        const price = parseFloat(priceStr) || 0
        return {breakName, team, username, price}
    }).filter(r => r.breakName !== '' && r.team !== '')
}

function validateBreaks(rows: ParsedRow[]): BreakValidation[] {
    const grouped = new Map<string, ParsedRow[]>()
    for (const row of rows) {
        if (!grouped.has(row.breakName)) grouped.set(row.breakName, [])
        grouped.get(row.breakName)!.push(row)
    }

    const results: BreakValidation[] = []
    for (const [breakName, breakRows] of grouped) {
        const presentTeams = new Set(breakRows.filter(r => r.team !== 'Miscellaneous').map(r => r.team))
        const missingTeams = Teams.filter(t => !presentTeams.has(t))
        const miscCount = breakRows.filter(r => r.team === 'Miscellaneous').length
        const uniqueBuyers = new Set(breakRows.filter(r => r.username !== '').map(r => r.username))
        results.push({
            breakName,
            valid: missingTeams.length === 0,
            missingTeams,
            miscCount,
            buyerCount: uniqueBuyers.size,
            rows: breakRows,
        })
    }
    return results
}

export default function Page({params}: {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [selectedType, setSelectedType] = useState('')
    const [validations, setValidations] = useState<BreakValidation[] | null>(null)
    const [progress, setProgress] = useState<string | null>(null)
    const [done, setDone] = useState(false)

    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const content = ev.target?.result as string
            const rows = parseCsv(content)
            setValidations(validateBreaks(rows))
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    async function handleContinue() {
        if (!validations) return
        const date = (new Date()).toISOString()

        for (let i = 0; i < validations.length; i++) {
            const v = validations[i]
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

            const teamRows = v.rows.filter(r => r.team !== 'Miscellaneous')
            const miscRows = v.rows.filter(r => r.team === 'Miscellaneous')

            let chain = Promise.resolve()
            Teams.forEach((teamName, j) => {
                chain = chain.then(() => {
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
                    return post(getEndpoints().event_add, eventBody).then(() => {})
                })
            })
            miscRows.forEach((row, j) => {
                chain = chain.then(() => {
                    const eventBody: Event = {
                        id: 0,
                        index: Teams.length + j,
                        giveaway_type: GiveawayTypeNone,
                        break_id: breakId,
                        customer: row.username,
                        price: row.price,
                        team: 'Miscellaneous',
                        is_giveaway: false,
                        note: '',
                        quantity: 0,
                    }
                    return post(getEndpoints().event_add, eventBody).then(() => {})
                })
            })

            await chain
        }

        setProgress(null)
        setDone(true)
    }

    const allValid = validations !== null && validations.every(v => v.valid)

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
                                    <th>Misc spots</th>
                                </tr>
                            </thead>
                            <tbody>
                                {validations.map(v => (
                                    <tr key={v.breakName}>
                                        <td>{v.breakName}</td>
                                        <td>
                                            {v.valid
                                                ? <span className="text-success">Valid</span>
                                                : <span className="text-danger">
                                                    Invalid — missing: {v.missingTeams.join(', ')}
                                                  </span>
                                            }
                                        </td>
                                        <td>{v.buyerCount}</td>
                                        <td>{v.miscCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

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
