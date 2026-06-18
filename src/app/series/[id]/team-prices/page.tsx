'use client'

import React, {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {get} from "@/app/lib/backend";
import {SeriesTeamTotal} from "@/app/entity/entities";

export default function Page({params}: {params: {id: string}}) {
    const seriesId = parseInt(params.id)
    const router = useRouter()

    const [totals, setTotals] = useState<SeriesTeamTotal[]>([])

    useEffect(() => {
        get(`/api/series/${seriesId}/prices`).then((data: SeriesTeamTotal[]) => {
            setTotals(data ?? [])
        })
    }, [])

    return (
        <main className="container py-3">
            <div className="d-flex align-items-center gap-3 mb-3">
                <button className="btn btn-sm btn-outline-secondary" onClick={() => router.back()}>← Back</button>
                <h4 className="mb-0">Team Prices</h4>
            </div>

            <table className="table table-sm table-dark" style={{width: 'auto'}}>
                <thead>
                    <tr>
                        <th>Team</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {totals.map((t) => (
                        <tr key={t.team}>
                            <td>{t.team}</td>
                            <td>{t.price}</td>
                        </tr>
                    ))}
                    {totals.length === 0 && (
                        <tr><td colSpan={2} className="text-secondary">No prices yet.</td></tr>
                    )}
                </tbody>
            </table>
        </main>
    )
}
