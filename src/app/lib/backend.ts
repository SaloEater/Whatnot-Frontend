'use client'

import {cleanAuth, requestClientAuthClean} from "@/app/lib/auth_storage";
import {useState} from "react";
import {EnvVarResponse} from "@/pages/api/get-env-var";
import {useRouter} from "next/navigation";


export async function getEndpoints()  {
    return {
        days: "/api/days",
        getBreak: "/api/break",
        addBreak: "/api/break/add",
        changeOutcome: "/api/outcome/change_outcome"
    }
}

async function useEnvVar(): Promise<string> {
    const response = await fetch('/api/get-env-var');
    const data = await response.json() as EnvVarResponse;
    return data.value;
}

export async function post(endpoint: string, data: {}, username: string, password: string) {
    const host = await useEnvVar()
    let url = getUrl(host, endpoint)
    let auth = getBasicAuth(username, password)
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": auth,
            },
            body: JSON.stringify(data),
        })


        return await handleResponse(response)
    } catch (error: any) {
        console.log('An error during request: ' + error.toString())
        return {error: error}
    }
}

export async function get(endpoint: string, username: string, password: string) {
    const host = await useEnvVar()
    let url = getUrl(host, endpoint)
    let auth = getBasicAuth(username, password)
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "Authorization": auth,
            },
            cache: "no-cache",
        })

        return await handleResponse(response)
    } catch (error: any) {
        console.log('An error during request: ' + error.toString())
        return {error: error}
    }
}

function getBasicAuth(username: string, password: string) {
    console.log("using these: " + username+ ":" + password)
    var auth = "Basic " + btoa(username + ":" + password);
    console.log(auth)
    return auth
}

function getUrl(host: string, endpoint: string) {
    return host + endpoint;
}

async function handleResponse(response: Response) {
    var resp = response.text()
    if (response.status == 401) {
        const router = useRouter()
        requestClientAuthClean()
        cleanAuth()
        router.push('/login')
    }

    var json = await resp

    return JSON.parse(json)
}