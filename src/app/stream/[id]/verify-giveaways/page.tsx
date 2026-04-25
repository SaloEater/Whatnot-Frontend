'use client'

import React, {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import Papa from "papaparse";
import {getEndpoints, post} from "@/app/lib/backend";
import {Event, WNBreak} from "@/app/entity/entities";
import {getGiveawayType, isGiveaway} from "@/app/utils/whatnot_product";
import {sortBreaksById} from "@/app/common/breaks";

const GAP_THRESHOLD_MS = 10 * 60 * 1000

interface GiveawayRow {
    productName: string
    buyer: string
    placedAt: Date
    clusterIndex: number
}

interface Cluster {
    index: number
    assignedBreakId: number
    rows: GiveawayRow[]
}

interface GiveawayMismatch {
    type: 'missing' | 'extra'
    breakName: string
    breakId: number
    buyer: string
    productName: string
    giveawayType: number
    eventId?: number
}

function parseAndCluster(content: string, breaks: WNBreak[]): Cluster[] {
    const result = Papa.parse<Record<string, string>>(content, {header: true, skipEmptyLines: true})
    const rows = result.data

    const giveaways: GiveawayRow[] = rows
        .filter(r => isGiveaway(r.product_name) && !r.cancelled_or_failed)
        .map(r => ({
            productName: r.product_name,
            buyer: r.buyer_username ?? r.buyer,
            placedAt: new Date(r.placed_at),
            clusterIndex: 0,
        }))
        .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())

    if (giveaways.length === 0) return []

    const clusters: Cluster[] = []
    let clusterIdx = 0
    giveaways[0].clusterIndex = 0
    clusters.push({index: 0, assignedBreakId: breaks[0]?.id ?? 0, rows: [giveaways[0]]})

    for (let i = 1; i < giveaways.length; i++) {
        const gap = giveaways[i].placedAt.getTime() - giveaways[i - 1].placedAt.getTime()
        if (gap > GAP_THRESHOLD_MS) {
            clusterIdx++
            giveaways[i].clusterIndex = clusterIdx
            clusters.push({
                index: clusterIdx,
                assignedBreakId: breaks[clusterIdx]?.id ?? breaks[breaks.length - 1]?.id ?? 0,
                rows: [giveaways[i]],
            })
        } else {
            giveaways[i].clusterIndex = clusterIdx
            clusters[clusterIdx].rows.push(giveaways[i])
        }
    }

    return clusters
}

function formatTime(d: Date): string {
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit'})
}

export default function Page({params}: {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [breaks, setBreaks] = useState<WNBreak[]>([])
    const [clusters, setClusters] = useState<Cluster[] | null>(null)
    const [mismatches, setMismatches] = useState<GiveawayMismatch[] | null>(null)
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
            setClusters(parseAndCluster(content, breaks))
            setMismatches(null)
            setFixDone(false)
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    function setClusterBreak(clusterIndex: number, breakId: number) {
        setClusters(old => old!.map(c =>
            c.index === clusterIndex ? {...c, assignedBreakId: breakId} : c
        ))
    }

    async function handleVerify() {
        if (!clusters) return

        // Build map: breakId → { csv: {buyer, productName}[], db: {customer, eventId}[] }
        const breakDataMap = new Map<number, {csv: {buyer: string; productName: string}[]; db: {customer: string; eventId: number}[]}>()
        for (const cluster of clusters) {
            const bid = cluster.assignedBreakId
            if (!breakDataMap.has(bid)) breakDataMap.set(bid, {csv: [], db: []})
            for (const row of cluster.rows) {
                breakDataMap.get(bid)!.csv.push({buyer: row.buyer, productName: row.productName})
            }
        }

        const uniqueBreakIds = Array.from(breakDataMap.keys())
        for (let i = 0; i < uniqueBreakIds.length; i++) {
            const bid = uniqueBreakIds[i]
            const bName = breaks.find(b => b.id === bid)?.name ?? String(bid)
            setProgress(`Fetching ${i + 1} of ${uniqueBreakIds.length}: ${bName}…`)
            const resp: {events: Event[]} = await post(getEndpoints().break_events, {break_id: bid})
            breakDataMap.get(bid)!.db = (resp.events ?? []).filter(e => e.is_giveaway).map(e => ({customer: e.customer, eventId: e.id}))
        }

        setProgress(null)
        const results: GiveawayMismatch[] = []
        for (const [breakId, {csv, db}] of Array.from(breakDataMap.entries())) {
            const breakName = breaks.find(b => b.id === breakId)?.name ?? String(breakId)
            const dbSet = new Set(db.map(d => d.customer))
            const csvSet = new Set(csv.map(c => c.buyer))
            for (const {buyer, productName} of csv) {
                if (!dbSet.has(buyer)) {
                    results.push({type: 'missing', breakName, breakId, buyer, productName, giveawayType: getGiveawayType(productName)})
                }
            }
            for (const {customer, eventId} of db) {
                if (!csvSet.has(customer)) {
                    results.push({type: 'extra', breakName, breakId, buyer: customer, productName: '', giveawayType: 0, eventId})
                }
            }
        }
        setMismatches(results)
    }

    async function handleAutoFix() {
        if (!mismatches) return
        const toFix = mismatches.filter(m => m.type === 'missing')
        for (let i = 0; i < toFix.length; i++) {
            const mm = toFix[i]
            setProgress(`Fixing ${i + 1} of ${toFix.length}: ${mm.buyer}…`)
            await post(getEndpoints().event_add, {
                id: 0,
                index: -1,
                break_id: mm.breakId,
                customer: mm.buyer,
                price: 0,
                team: '',
                is_giveaway: true,
                note: '',
                quantity: 1,
                giveaway_type: mm.giveawayType,
            })
        }
        setProgress(null)
        setFixDone(true)
    }

    async function handleAutoDelete() {
        if (!mismatches) return
        const toDelete = mismatches.filter(m => m.type === 'extra' && m.eventId !== undefined)
        for (let i = 0; i < toDelete.length; i++) {
            const mm = toDelete[i]
            setProgress(`Deleting ${i + 1} of ${toDelete.length}: ${mm.buyer}…`)
            await post(getEndpoints().event_delete, {id: mm.eventId})
        }
        setProgress(null)
        setFixDone(true)
    }

    const missingCount = mismatches?.filter(m => m.type === 'missing').length ?? 0
    const extraCount = mismatches?.filter(m => m.type === 'extra').length ?? 0

    return (
        <main className="d-flex justify-content-center mt-4">
            <div style={{minWidth: 700}}>
                <h4>Verify giveaways</h4>

                {!clusters && (
                    <div className="mb-3">
                        <input type="file" accept=".csv" ref={fileInputRef} className="d-none" onChange={handleFileSelected}/>
                        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                            Upload selling report (.csv)
                        </button>
                    </div>
                )}

                {clusters && clusters.length === 0 && (
                    <div className="alert alert-warning">No giveaway entries found in this file.</div>
                )}

                {clusters && clusters.length > 0 && mismatches === null && (
                    <>
                        {clusters.map(cluster => (
                            <div key={cluster.index} className="border rounded p-3 mb-3">
                                <div className="d-flex align-items-center gap-3 mb-2">
                                    <strong>Cluster {cluster.index + 1} ({cluster.rows.length} giveaway{cluster.rows.length !== 1 ? 's' : ''})</strong>
                                    <select
                                        className="form-select form-select-sm w-auto"
                                        value={cluster.assignedBreakId}
                                        onChange={e => setClusterBreak(cluster.index, parseInt(e.target.value))}
                                    >
                                        {breaks.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <table className="table table-sm mb-0">
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Buyer</th>
                                            <th>Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cluster.rows.map((row, rowIdx) => (
                                            <tr key={rowIdx}>
                                                <td>{row.productName}</td>
                                                <td>{row.buyer}</td>
                                                <td>{formatTime(row.placedAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}

                        {progress && <div className="alert alert-info">{progress}</div>}

                        <div className="d-flex gap-2">
                            <button
                                className="btn btn-primary"
                                disabled={!!progress}
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
                            <div className="alert alert-success">All giveaways match!</div>
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
                                            <th>Buyer</th>
                                            <th>Type</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {mismatches.map((mm, i) => (
                                            <tr key={i}>
                                                <td>{mm.breakName}</td>
                                                <td>{mm.buyer}</td>
                                                <td>
                                                    {mm.type === 'missing'
                                                        ? <span className="text-danger">Missing in DB</span>
                                                        : <span className="text-warning">Extra in DB</span>
                                                    }
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {progress && <div className="alert alert-info">{progress}</div>}

                                <div className="d-flex gap-2">
                                    {missingCount > 0 && (
                                        <button
                                            className="btn btn-warning"
                                            disabled={!!progress}
                                            onClick={handleAutoFix}
                                        >
                                            Auto-fix {missingCount} missing
                                        </button>
                                    )}
                                    {extraCount > 0 && (
                                        <button
                                            className="btn btn-danger"
                                            disabled={!!progress}
                                            onClick={handleAutoDelete}
                                        >
                                            Auto-delete {extraCount} extra
                                        </button>
                                    )}
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

                {!clusters && (
                    <button className="btn btn-secondary mt-2" onClick={() => router.push(`/stream/${streamId}`)}>
                        Cancel
                    </button>
                )}
            </div>
        </main>
    )
}
