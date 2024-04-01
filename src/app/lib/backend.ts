'use client'

import {cleanAuth, requestClientAuthClean} from "@/app/lib/auth_storage";
import {EnvVarResponse} from "@/pages/api/get-env-var";
import {useRouter} from "next/navigation";

interface Credentials {
    username: string
    password: string
}

export async function getEndpoints()  {
    return {
        days: "/api/days",
        addDay: "/api/day/add",
        getBreak: "/api/break",
        addBreak: "/api/break/add",
        changeOutcome: "/api/break/change_outcome",
        deleteBreak: "/api/break/delete",
        deleteDay: "/api/day/delete",
        setBreakStartDate: "/api/break/set_start_data",
        setBreakEndDate: "/api/break/set_end_data",
        updateBreakEvent: "/api/break/update_event",
        addBreakEvent: "/api/break/add_event",
        deleteBreakEvent: "/api/break/delete_event",
        moveBreakEvent: "/api/break/move_event"
    }
}

async function useEnvVar(): Promise<string> {
    const response = await fetch('/api/get-env-var');
    const data = await response.json() as EnvVarResponse;
    return data.value;
}

export async function post(endpoint: string, data: {}) {
    const host = await useEnvVar()
    let url = getUrl(host, endpoint)
    let auth = getBasicAuth()
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

export async function get(endpoint: string) {
    const host = await useEnvVar()
    let url = getUrl(host, endpoint)
    let auth = getBasicAuth()
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

function getCredentials(): Credentials {
    return {
        username: localStorage?.getItem("username") ?? "",
        password: localStorage?.getItem("password") ?? ""
    }
}

function getBasicAuth() {
    const credentials = getCredentials()
    return "Basic " + btoa(credentials.username + ":" + credentials.password);
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
    if (json === "") {
        return {}
    }
    try {
        var data = JSON.parse(json)

        if (data.error) {
            console.log('An error occurred during request: ' + data.error)
        }

        return data
    } catch (e: any) {
        console.log('An error occurred during parsing response json "' + json + '": ' + e.toString())
    }
}