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
        channel_get: "/api/channel",
        channel_get_all: "/api/channels",
        channel_add: "/api/channel/add",
        channel_delete: "/api/channel/delete",
        channel_update: "/api/channel/update",
        channel_by_stream: "/api/channel/by_stream",

        stream_get_all: "/api/channel/streams",
        stream_add: "/api/stream/add",
        stream_delete: "/api/stream/delete",
        stream_get: "/api/stream",
        stream_breaks: "/api/stream/breaks",
        stream_usernames: "/api/stream/usernames",
        stream_demo: "/api/stream/demo",

        break_get: "/api/break",
        break_add: "/api/break/add",
        break_delete: "/api/break/delete",
        break_update: "/api/break/update",
        break_events: "/api/break/events",

        event_update: "/api/event/update",
        event_update_all: "/api/event/update_all",
        event_add: "/api/event/add",
        event_delete: "/api/event/delete",
        event_move: "/api/event/move",

        demo_update: "/api/demo/update",
        demo_get: "/api/demo",

        notify_stream_ended: "/api/notification/stream_ended",
        notify_stream_packaging_finished: "/api/notification/stream_packaging_finished",
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