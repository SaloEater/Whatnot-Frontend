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
    orderId: string
    productName: string
    buyer: string
    placedAt: Date
    clusterIndex: number
    breakOverride: number | null  // break id override, null = use cluster assignment
}

interface Cluster {
    index: number
    assignedBreakId: number
    rows: GiveawayRow[]
}

function parseAndCluster(content: string, breaks: WNBreak[]): Cluster[] {
    const result = Papa.parse<Record<string, string>>(content, {header: true, skipEmptyLines: true})
    const rows = result.data

    const giveaways: GiveawayRow[] = rows
        .filter(r => isGiveaway(r.product_name) && !r.cancelled_or_failed)
        .map(r => ({
            orderId: r.order_id ?? '',
            productName: r.product_name,
            buyer: r.buyer_username ?? r.buyer,
            placedAt: new Date(r.placed_at),
            clusterIndex: 0,
            breakOverride: null,
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
    const [fileErrors, setFileErrors] = useState<{orderId: string; error: string}[] | null>(null)
    const [progress, setProgress] = useState<string | null>(null)
    const [done, setDone] = useState(false)

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
            const parsed = parseAndCluster(content, breaks)
            const emptyBuyerRows = parsed.flatMap(c => c.rows).filter(r => !r.buyer)
            if (emptyBuyerRows.length > 0) {
                setFileErrors(emptyBuyerRows.map(r => ({orderId: r.orderId || '—', error: `No buyer for "${r.productName}"`})))
                setClusters(null)
                return
            }
            setFileErrors(null)
            setClusters(parsed)
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    function setClusterBreak(clusterIndex: number, breakId: number) {
        setClusters(old => old!.map(c =>
            c.index === clusterIndex ? {...c, assignedBreakId: breakId} : c
        ))
    }

    function setRowBreakOverride(clusterIndex: number, rowIndex: number, breakId: number | null) {
        setClusters(old => old!.map(c => {
            if (c.index !== clusterIndex) return c
            const rows = c.rows.map((r, i) =>
                i === rowIndex ? {...r, breakOverride: breakId} : r
            )
            return {...c, rows}
        }))
    }

    async function handleContinue() {
        if (!clusters) return
        const allRows = clusters.flatMap(c =>
            c.rows.map(r => ({row: r, targetBreakId: r.breakOverride ?? c.assignedBreakId}))
        )
        for (let i = 0; i < allRows.length; i++) {
            const {row, targetBreakId} = allRows[i]
            setProgress(`Adding giveaway ${i + 1} of ${allRows.length}…`)
            const body: Event = {
                id: 0,
                index: -1,
                break_id: targetBreakId,
                customer: row.buyer,
                price: 0,
                team: '',
                is_giveaway: true,
                note: '',
                quantity: 1,
                giveaway_type: getGiveawayType(row.productName),
            }
            await post(getEndpoints().event_add, body)
        }
        setProgress(null)
        setDone(true)
    }

    if (done) {
        return (
            <main className="d-flex justify-content-center mt-4">
                <div className="text-center">
                    <div className="alert alert-success">All giveaways imported successfully.</div>
                    <button className="btn btn-primary" onClick={() => router.push(`/stream/${streamId}`)}>
                        Back to stream
                    </button>
                </div>
            </main>
        )
    }

    return (
        <main className="d-flex justify-content-center mt-4">
            <div style={{minWidth: 700}}>
                <h4>Import giveaways</h4>

                {fileErrors && (
                    <table className="table table-bordered table-sm mb-3">
                        <thead>
                            <tr><th>Order ID</th><th>Error</th></tr>
                        </thead>
                        <tbody>
                            {fileErrors.map((e, i) => (
                                <tr key={i} className="text-danger">
                                    <td>{e.orderId}</td>
                                    <td>{e.error}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

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

                {clusters && clusters.length > 0 && (
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
                                            <th>Break override</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {cluster.rows.map((row, rowIdx) => (
                                            <tr key={rowIdx}>
                                                <td>{row.productName}</td>
                                                <td>{row.buyer}</td>
                                                <td>{formatTime(row.placedAt)}</td>
                                                <td>
                                                    <select
                                                        className="form-select form-select-sm"
                                                        value={row.breakOverride ?? ''}
                                                        onChange={e => {
                                                            const val = e.target.value
                                                            setRowBreakOverride(cluster.index, rowIdx, val === '' ? null : parseInt(val))
                                                        }}
                                                    >
                                                        <option value="">— use cluster —</option>
                                                        {breaks.map(b => (
                                                            <option key={b.id} value={b.id}>{b.name}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ))}

                        {progress && (
                            <div className="alert alert-info">{progress}</div>
                        )}

                        <div className="d-flex gap-2">
                            <button
                                className="btn btn-primary"
                                disabled={!!progress}
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
