'use client'

import {FormEvent, useEffect} from "react";
import {useRouter} from "next/navigation";
import {CleanAuth, SetAuth} from "@/app/common/auth_storage";
import {cookies} from "next/headers";

export default function Page() {
    useEffect(() => {
        CleanAuth()
    }, [])
    const router = useRouter()

    async function handleSubmitLogin(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()

        const formData = new FormData(event.currentTarget)
        const username = formData.get('username')
        const password = formData.get('password')
        const usernameValue = username ? username.toString() : ""
        const passwordValue = password ? password.toString() : ""

        SetAuth(usernameValue, passwordValue)

        router.push("/channel")
    }

    return (
        <div className="d-flex align-items-center justify-content-center">
            <form onSubmit={handleSubmitLogin}>
                <div className="form-group">
                    <input type="username" name="username" placeholder="Username" required/>
                </div>
                <div className="form-group">
                    <input type="password" name="password" placeholder="Password" required/>
                </div>
                <button type="submit" className="btn btn-primary">Login</button>
            </form>
        </div>
    )
}