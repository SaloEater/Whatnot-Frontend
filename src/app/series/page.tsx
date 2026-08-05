'use client'

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {post, getEndpoints} from "@/app/lib/backend";
import {Series, SeriesListPage} from "@/app/entity/entities";

const ALLOWED_PAGE_SIZES = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_STORAGE_KEY = 'series-page-size'

export default function Page() {
    const [series, setSeries] = useState<Series[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [pageSize, setPageSize] = useState(() => {
        if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
        const stored = parseInt(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) ?? '')
        return ALLOWED_PAGE_SIZES.includes(stored) ? stored : DEFAULT_PAGE_SIZE
    })
    const router = useRouter()

    useEffect(() => {
        post(getEndpoints().series_list_paginated, {page, page_size: pageSize}).then((data: SeriesListPage) => {
            setSeries(data?.items ?? [])
            setTotal(data?.total ?? 0)
        })
    }, [page, pageSize])

    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages)
        }
    }, [page, totalPages])

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString()
    }

    function handlePageSizeChange(value: string) {
        const newSize = parseInt(value)
        localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(newSize))
        setPageSize(newSize)
        setPage(1)
    }

    return (
        <main>
            <div className="d-flex justify-content-center">
                <div style={{width: '100%', maxWidth: '900px'}}>
                    <div className="d-flex justify-content-between align-items-center mb-2 text-white">
                        <div className="d-flex align-items-center gap-2">
                            <label className="text-secondary">Page size</label>
                            <select
                                className="form-select form-select-sm w-auto"
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(e.target.value)}
                            >
                                {ALLOWED_PAGE_SIZES.map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <button
                                className="btn btn-sm btn-outline-light"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Prev
                            </button>
                            <span className="text-secondary">Page {page} of {totalPages}</span>
                            <button
                                className="btn btn-sm btn-outline-light"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
                    <ul className="list-group">
                        {series.map((s) => (
                            <li key={s.id} className="list-group-item text-white">
                                <div className="container-fluid">
                                    <div className="row align-items-center">
                                        <div className="col">{s.name}</div>
                                        <div className="col-auto">
                                            <span className={`badge ${s.status === 'open' ? 'bg-warning text-dark' : 'bg-success'}`}>
                                                {s.status}
                                            </span>
                                        </div>
                                        <div className="col-auto text-secondary">{formatDate(s.created_at)}</div>
                                        <div className="col-auto">
                                            <button className="btn btn-sm btn-primary" onClick={() => router.push(`/series/${s.id}`)}>
                                                Open
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </main>
    )
}
