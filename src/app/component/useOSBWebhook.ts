import {Logger} from "@/app/entity/logger";
import {MyOBSWebsocket} from "@/app/entity/my_obs_websocket";
import {useMemo, useState} from "react";

export function useOSBWebhook(url: string, logger: Logger, setIsConnected: (isConnected: boolean) => void) {
    return useMemo(() => {
        let obsWebsocket = new MyOBSWebsocket(url, logger, setIsConnected)
        console.log('use')
        return obsWebsocket
    }, [url])
}