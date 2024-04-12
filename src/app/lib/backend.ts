'use client'

import {cleanAuth, requestClientAuthClean} from "@/app/lib/auth_storage";
import {EnvVarResponse} from "@/pages/api/get-env-var";
import {useRouter} from "next/navigation";

interface Credentials {
    username: string
    password: string
}

export function getEndpoints()  {
    return {
        days_get: "/api/days",
        day_add: "/api/day/add",
        day_delete: "/api/day/delete",
        day_get: "/api/day",
        break_get: "/api/break",
        break_get_by_day: "/api/break/by_day",
        break_add: "/api/break/add",
        break_delete: "/api/break/delete",
        break_update: "/api/break/update",
        events_get_by_break: "/api/event/by_break",
        event_update: "/api/event/update",
        event_update_all: "/api/event/update_all",
        event_add: "/api/event/add",
        event_delete: "/api/event/delete",
        event_move: "/api/event/move",
    }
}

async function getEnvVar(): Promise<string> {
    const response = await fetch('/api/get-env-var');
    const data = await response.json() as EnvVarResponse;
    return data.value;
}

export async function post(endpoint: string, data: {}) {
    const host = await getEnvVar()
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
    const host = await getEnvVar()
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
    //host = `http://${window.location.hostname}:5555`
    return host + endpoint;
}

async function handleResponse(response: Response) {
    var resp = response.text()
    if (response.status == 401) {
        // eslint-disable-next-line
        const router= useRouter()
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

        return data.data
    } catch (e: any) {
        console.log('An error occurred during parsing response json "' + json + '": ' + e.toString())
        throw e;
    }
}