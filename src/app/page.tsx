'use client'

import {useRouter} from "next/navigation";

export default function Home() {
    const router = useRouter()

    return (
        <main className="d-flex justify-content-center align-items-center gap-3 mt-5">
            <button className="btn btn-primary btn-lg" onClick={() => router.push('/channels')}>
                Channels
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => router.push('/series')}>
                Series
            </button>
        </main>
    )
}
