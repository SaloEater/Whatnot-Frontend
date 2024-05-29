'use client'

import {useEffect, useState} from "react";
import {WebSocketUrlComponent} from "@/app/obs/manage/[id]/web_socket_url_component";
import {useOSBWebhook} from "@/app/component/useOSBWebhook";
import {ComponentLogger, ConsoleLogger} from "@/app/entity/logger";
import {ConnectedComponent} from "@/app/obs/manage/[id]/connected_component";
import {LogComponent} from "@/app/obs/manage/[id]/logComponent";
import {TabsComponent} from "@/app/component/tabsComponent";
import {TeamsComponent} from "@/app/obs/manage/[id]/TeamsComponent";

const OBS_WS_URL = 'OBS_WS_URL';
export default function Page({params}: {params: {id: string}}) {
    const streamId = parseInt(params.id)
    const [url, setUrl] = useState('ws://localhost:4455')
    console.log('re-render')
    const [logger, setLogger] = useState(new ComponentLogger())
    const [isConnected, setIsConnected] = useState(false)
    const obs = useOSBWebhook(url, logger, setIsConnected)

    useEffect(() => {
        setUrl((old) => {
            return localStorage.getItem(OBS_WS_URL) ?? old
        })
        logger.add('main effect')
    }, []);

    useEffect(() => {
        localStorage.setItem(OBS_WS_URL, url)
        logger.add('url effect')
    }, [url]);

    useEffect(() => {
        connect()
        logger.add('webhook effect')
    }, [obs])

    useEffect(() => {
        logger.add('new state')
    }, [isConnected]);

    // get and refresh demo based on stream id

    function connect() {
        obs.connect()
    }

    return <div className='d-flex'>
        <div className='w-100p'>
            <div className='w-25p'>
                <WebSocketUrlComponent url={url} setUrl={setUrl}/>
                <div>
                    <ConnectedComponent isConnected={isConnected} connect={connect}/>
                </div>
            </div>
            <TeamsComponent logger={logger} obs={obs} streamId={streamId}/>
        </div>
        <div className='w-25p'>
            <LogComponent logger={logger}/>
        </div>
    </div>
}