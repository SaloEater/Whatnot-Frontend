'use client'

import {useRouter} from "next/navigation";

export default function Home() {
    const router = useRouter()
    router.push('/login')
    return (
        <main>
            Hello world
        </main>
    )
}
