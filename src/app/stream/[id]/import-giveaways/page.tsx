'use client'

import React, {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import Papa from "papaparse";
import {getEndpoints, post} from "@/app/lib/backend";
import {Event, WNBreak} from "@/app/entity/entities";
import {getGiveawayType, isGiveaway} from "@/app/utils/whatnot_product";
import {sortBreaksById} from "@/app/common/breaks";

const GAP_THRESHOLD_MS = 10 * 60 * 1000
const TIMEZONE_KEY = 'giveaway_tz'

interface GiveawayRow {
    orderId: string
    productName: string
    buyer: string
    placedAt: Date
    csvBefore: string
    csvAfter: string
}

interface Bucket {
    break: WNBreak
    rows: GiveawayRow[]
}

function parseUtc(s: string): Date {
    return new Date(/Z$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z')
}

function formatTime(d: Date, tz: string): string {
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: tz})
}

function parseAndBucket(content: string, breaks: WNBreak[]): Bucket[] {
    const result = Papa.parse<Record<string, string>>(content, {header: true, skipEmptyLines: true})

    // Sort all non-cancelled rows globally so neighbors reflect the full CSV context
    const allSorted = result.data
        .filter(r => !r.cancelled_or_failed)
        .map(r => ({productName: r.product_name, placedAt: parseUtc(r.placed_at), buyer: r.buyer_username ?? r.buyer, orderId: r.order_id ?? ''}))
        .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())

    type InternalRow = GiveawayRow & { clusterIndex: number }
    const giveaways: InternalRow[] = allSorted
        .flatMap((r, i) => isGiveaway(r.productName) ? [{
            orderId: r.orderId,
            productName: r.productName,
            buyer: r.buyer,
            placedAt: r.placedAt,
            csvBefore: allSorted[i - 1]?.productName ?? '',
            csvAfter: allSorted[i + 1]?.productName ?? '',
            clusterIndex: 0,
        }] : [])

    // Cluster by time gaps and map each cluster index → break id
    const clusterBreak = new Map<number, number>()
    let clusterIdx = 0
    clusterBreak.set(0, breaks[0]?.id ?? 0)
    for (let i = 1; i < giveaways.length; i++) {
        const gap = giveaways[i].placedAt.getTime() - giveaways[i - 1].placedAt.getTime()
        if (gap > GAP_THRESHOLD_MS) {
            clusterIdx++
            clusterBreak.set(clusterIdx, breaks[clusterIdx]?.id ?? breaks[breaks.length - 1]?.id ?? 0)
        }
        giveaways[i].clusterIndex = clusterIdx
    }

    // Distribute rows into per-break buckets
    const rowsByBreak = new Map<number, GiveawayRow[]>()
    for (const b of breaks) rowsByBreak.set(b.id, [])
    for (const g of giveaways) {
        const breakId = clusterBreak.get(g.clusterIndex) ?? breaks[0]?.id ?? 0
        rowsByBreak.get(breakId)?.push({
            orderId: g.orderId,
            productName: g.productName,
            buyer: g.buyer,
            placedAt: g.placedAt,
            csvBefore: g.csvBefore,
            csvAfter: g.csvAfter,
        })
    }

    return breaks.map(b => ({break: b, rows: rowsByBreak.get(b.id) ?? []}))
}

export default function Page({params}: {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const router = useRouter()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [breaks, setBreaks] = useState<WNBreak[]>([])
    const [buckets, setBuckets] = useState<Bucket[] | null>(null)
    const [fileErrors, setFileErrors] = useState<{orderId: string; error: string}[] | null>(null)
    const [progress, setProgress] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [timezone, setTimezone] = useState('UTC')
    const [timezoneList, setTimezoneList] = useState<string[]>([])

    useEffect(() => {
        post(getEndpoints().stream_breaks, {id: streamId})
            .then((b: WNBreak[]) => setBreaks(sortBreaksById(b)))
        const stored = localStorage.getItem(TIMEZONE_KEY)
        setTimezone(stored ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
        setTimezoneList(Intl.supportedValuesOf('timeZone'))
    }, [])

    function handleTimezoneChange(tz: string) {
        setTimezone(tz)
        localStorage.setItem(TIMEZONE_KEY, tz)
    }

    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
            const content = ev.target?.result as string
            const parsed = parseAndBucket(content, breaks)
            const emptyBuyerRows = parsed.flatMap(b => b.rows).filter(r => !r.buyer)
            if (emptyBuyerRows.length > 0) {
                setFileErrors(emptyBuyerRows.map(r => ({orderId: r.orderId || '—', error: `No buyer for "${r.productName}"`})))
                setBuckets(null)
                return
            }
            setFileErrors(null)
            setBuckets(parsed)
        }
        reader.readAsText(file)
        e.target.value = ''
    }

    function moveRow(fromBreakId: number, rowIndex: number, toBreakId: number) {
        setBuckets(old => {
            if (!old) return old
            const row = old.find(b => b.break.id === fromBreakId)!.rows[rowIndex]
            return old.map(b => {
                if (b.break.id === fromBreakId) return {...b, rows: b.rows.filter((_, i) => i !== rowIndex)}
                if (b.break.id === toBreakId) return {...b, rows: [...b.rows, row].sort((a, c) => a.placedAt.getTime() - c.placedAt.getTime())}
                return b
            })
        })
    }

    function moveFromRow(fromBreakId: number, rowIndex: number, toBreakId: number) {
        setBuckets(old => {
            if (!old) return old
            const rows = old.find(b => b.break.id === fromBreakId)!.rows
            const pivotTime = rows[rowIndex].placedAt.getTime()
            const toKeep = rows.filter(r => r.placedAt.getTime() < pivotTime)
            const toMove = rows.filter(r => r.placedAt.getTime() >= pivotTime)
            return old.map(b => {
                if (b.break.id === fromBreakId) return {...b, rows: toKeep}
                if (b.break.id === toBreakId) return {...b, rows: [...b.rows, ...toMove].sort((a, c) => a.placedAt.getTime() - c.placedAt.getTime())}
                return b
            })
        })
    }

    async function handleContinue() {
        if (!buckets) return
        const allRows = buckets.flatMap(bucket => bucket.rows.map(row => ({row, breakId: bucket.break.id})))
        for (let i = 0; i < allRows.length; i++) {
            const {row, breakId} = allRows[i]
            setProgress(`Adding giveaway ${i + 1} of ${allRows.length}…`)
            const body: Event = {
                id: 0,
                index: -1,
                break_id: breakId,
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

    const totalRows = buckets?.reduce((sum, b) => sum + b.rows.length, 0) ?? 0

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

                <div className="mb-3 d-flex align-items-center gap-2">
                    <label className="form-label mb-0">Timezone</label>
                    <select
                        className="form-select form-select-sm w-auto"
                        value={timezone}
                        onChange={e => handleTimezoneChange(e.target.value)}
                    >
                        {timezoneList.map(tz => (
                            <option key={tz} value={tz}>{tz}</option>
                        ))}
                    </select>
                </div>

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

                {!buckets && (
                    <div className="mb-3">
                        <input type="file" accept=".csv" ref={fileInputRef} className="d-none" onChange={handleFileSelected}/>
                        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                            Upload selling report (.csv)
                        </button>
                    </div>
                )}

                {buckets && totalRows === 0 && (
                    <div className="alert alert-warning">No giveaway entries found in this file.</div>
                )}

                {buckets && totalRows > 0 && (
                    <>
                        {buckets.map(bucket => (
                            <div key={bucket.break.id} className="border rounded p-3 mb-3">
                                <strong className="d-block mb-2">
                                    {bucket.break.name} ({bucket.rows.length} giveaway{bucket.rows.length !== 1 ? 's' : ''})
                                </strong>
                                {bucket.rows.length > 0 && (
                                    <table className="table table-sm mb-0">
                                        <thead>
                                            <tr>
                                                <th>Product</th>
                                                <th>Buyer</th>
                                                <th>Time</th>
                                                <th>Move to break</th>
                                                <th>Move this + all next to break</th>
                                                <th>Event before</th>
                                                <th>Event after</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bucket.rows.map((row, rowIdx) => (
                                                <tr key={rowIdx}>
                                                    <td>{row.productName}</td>
                                                    <td>{row.buyer}</td>
                                                    <td>{formatTime(row.placedAt, timezone)}</td>
                                                    <td>
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value=""
                                                            onChange={e => {
                                                                if (e.target.value) moveRow(bucket.break.id, rowIdx, parseInt(e.target.value))
                                                            }}
                                                        >
                                                            <option value="">— stay —</option>
                                                            {breaks.filter(b => b.id !== bucket.break.id).map(b => (
                                                                <option key={b.id} value={b.id}>{b.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <select
                                                            className="form-select form-select-sm"
                                                            value=""
                                                            onChange={e => {
                                                                if (e.target.value) moveFromRow(bucket.break.id, rowIdx, parseInt(e.target.value))
                                                            }}
                                                        >
                                                            <option value="">— stay —</option>
                                                            {breaks.filter(b => b.id !== bucket.break.id).map(b => (
                                                                <option key={b.id} value={b.id}>{b.name}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="text-muted">{row.csvBefore || '—'}</td>
                                                    <td className="text-muted">{row.csvAfter || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
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
