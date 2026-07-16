'use client'

import {EnvVarResponse} from "@/pages/api/get-env-var";

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
        stream_set_active_break: "/api/stream/set_active_break",

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

        channel_set_active_stream: "/api/channel/set_active_stream",

        notify_stream_ended: "/api/notification/stream_ended",
        notify_stream_packaging_finished: "/api/notification/stream_packaging_finished",

        series_list:            "/api/series/list",
        series_get:             "/api/series/get",
        series_get_with_count:  "/api/series/get_with_count",
        series_update:          "/api/series/update",
        series_close:           "/api/series/close",
        series_delete:          "/api/series/delete",

        photo_list:            "/api/photo/list",
        photo_delete:          "/api/photo/delete",
        photo_restore:         "/api/photo/restore",
        photo_update:          "/api/photo/update",
        photo_mark_sold:       "/api/photo/mark_sold",
        photo_board:           "/api/photo/board",
        photo_rotate:          "/api/photo/rotate",

        break_set_series:      "/api/break/set_series",

        widget_stashorpass_update:       "/api/widget/series/stashorpass/update",
        widget_stashorpass_get:          "/api/widget/series/stashorpass",
        widget_pick2_update:             "/api/widget/series/pick2/update",
        widget_pick2_get:                "/api/widget/series/pick2",
        widget_boxes_per_break_get:      "/api/widget/series/boxes_per_break",
        widget_boxes_per_break_update:   "/api/widget/series/boxes_per_break/update",
        widget_channel_count_settings_get:    "/api/widget/channel/count_settings",
        widget_channel_count_settings_update: "/api/widget/channel/count_settings/update",
        widget_board_price_ranges_list:   "/api/widget/board/price_ranges",
        widget_board_price_ranges_create: "/api/widget/board/price_ranges/create",
        widget_board_price_ranges_update: "/api/widget/board/price_ranges/update",
        widget_board_price_ranges_delete: "/api/widget/board/price_ranges/delete",
    }
}

let cachedEnvVar: string | null = null;

async function getEnvVar(): Promise<string> {
    if (cachedEnvVar) {
        return cachedEnvVar;
    }
    const response = await fetch('/api/get-env-var');
    const data = await response.json() as EnvVarResponse;
    cachedEnvVar = data.value;
    return cachedEnvVar;
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