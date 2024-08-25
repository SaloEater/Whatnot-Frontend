import {Dispatch, SetStateAction, useEffect, useMemo, useState} from "react";
import {Demo, GetChannelsChannel, WNChannel} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

export const NoInterval = -1

export function useChannel(streamId: number, interval = NoInterval): [WNChannel|null, Dispatch<SetStateAction<WNChannel|null>>] {
    const [channel, setChannel] = useState<WNChannel|null>(null)
    const [id, setId] = useState<NodeJS.Timeout|null>(null)

    function fetchChannel() {
        let eventsBody = {
            id: streamId
        };

        post(getEndpoints().channel_get, eventsBody).then((response: GetChannelsChannel) => setChannel(response))
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

    return [channel, setChannel]
}