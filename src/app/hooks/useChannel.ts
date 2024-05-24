import {useEffect, useState} from "react";
import {Demo, GetChannelsChannel, WNChannel} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

export function useChannel(streamId: number) {
    const [channel, setChannel] = useState<WNChannel|null>(null)

    useEffect(() => {
        let eventsBody = {
            id: streamId
        };

        post(getEndpoints().channel_get, eventsBody)
            .then((response: GetChannelsChannel) => {
                setChannel(response)
            })
    }, []);

    return channel
}