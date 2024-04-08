'use client'

import {useRouter} from "next/navigation";

export default function Page() {
    const router = useRouter()
    router.push('/days')

    return <div>
        Hello World!
    </div>
}