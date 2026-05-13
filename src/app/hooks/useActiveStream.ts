import {useEffect, useState} from "react";
import {WNChannel, WNStream} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

export function useActiveStream(channel: WNChannel | null): WNStream | null {
    const [stream, setStream] = useState<WNStream | null>(null)

    function fetchStream(streamId: number) {
        post(getEndpoints().stream_get, {id: streamId})
            .then((response: WNStream) => {
                setStream(response)
            })
    }

    useEffect(() => {
        if (!channel || !channel.active_stream_id) {
            setStream(null)
            return
        }

        fetchStream(channel.active_stream_id)
        const id = setInterval(() => {
            if (channel.active_stream_id) {
                fetchStream(channel.active_stream_id)
            }
        }, 20000)
        return () => clearInterval(id)
    }, [channel?.active_stream_id])

    return stream
}
