'use client'

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {get, getEndpoints} from "@/app/lib/backend";
import {Series} from "@/app/entity/entities";

export default function Page() {
    const [series, setSeries] = useState<Series[]>([])
    const router = useRouter()

    useEffect(() => {
        get(getEndpoints().series_list).then((data: Series[]) => {
            setSeries(data ?? [])
        })
    }, [])

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString()
    }

    return (
        <main>
            <div className="d-flex justify-content-center">
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
        </main>
    )
}
