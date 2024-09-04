import {Dispatch, SetStateAction, useEffect, useMemo, useState} from "react";
import {Stream, Demo, GetChannelsChannel, WNChannel, StreamResponse, WNStream} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

export const NoInterval = -1

export function useStream(streamId: number, interval = NoInterval): [WNStream | null, () => void] {
    const [stream, setStream] = useState<WNStream|null>(null)
    const [id, setId] = useState<NodeJS.Timeout|null>(null)
    const [refresh, setRefresh] = useState<boolean>(false)

    function fetchChannel() {
        let eventsBody = {
            id: streamId
        };

        post(getEndpoints().stream_get, eventsBody).then((response: StreamResponse) => setStream(response))
    }

    useEffect(() => {
        fetchChannel()

        if (id) {
            clearInterval(id)
            setId(null)
        }

        if (interval != NoInterval) {
            setId(setInterval(() => {
                fetchChannel()
            }, interval))
        }
    }, [streamId]);

    useEffect(() => {
        if (refresh) {
            fetchChannel()
            setRefresh(false)
        }
    }, [refresh]);

    function refreshStream() {
        setRefresh(true)
    }

    return [stream, refreshStream]
}