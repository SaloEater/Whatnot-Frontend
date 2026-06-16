'use client'

import React, {FC, useEffect, useState} from "react";
import {getEndpoints, get, post} from "@/app/lib/backend";
import {Series} from "@/app/entity/entities";

interface BreakSeriesComponentProps {
    breakId: number
    seriesId?: number | null
    onSeriesSet: (seriesId: number) => void
}

export const BreakSeriesComponent: FC<BreakSeriesComponentProps> = ({breakId, seriesId, onSeriesSet}) => {
    const [closedSeries, setClosedSeries] = useState<Series[]>([])

    useEffect(() => {
        get(getEndpoints().series_list).then((data: Series[]) => {
            setClosedSeries(data ?? [])
        })
    }, [])

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const id = parseInt(e.target.value)
        if (isNaN(id)) return
        post(getEndpoints().break_set_series, {break_id: breakId, series_id: id}).then(() => {
            onSeriesSet(id)
        })
    }

    const linked = closedSeries.find((s) => s.id === seriesId)

    return (
        <div>
            <div>Series:</div>
            <div className="d-flex align-items-center gap-2">
                <select
                    className="form-select form-select-sm"
                    style={{maxWidth: '200px'}}
                    value={seriesId ?? ''}
                    onChange={handleChange}
                >
                    <option value="">— none —</option>
                    {closedSeries.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                </select>
                {linked && (
                    <span className="badge bg-success">{linked.name}</span>
                )}
            </div>
        </div>
    )
}
