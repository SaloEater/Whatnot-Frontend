'use client'

import {get, getEndpoints, post} from "@/app/lib/backend";
import React, {useEffect, useState} from "react";
import moment from "moment/moment";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import {useRouter} from "next/navigation";
import {GetStreamsStream, GetStreamsResponse, GetChannelsChannel, WNChannel} from "@/app/entity/entities";
import {TextInputAction} from "@/app/component/textInputAction";
import {useChannel} from "@/app/hooks/useChannel";
import {ChannelPropertiesComponent} from "@/app/channel/[id]/channelPropertiesComponent";

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel, setChannel] = useChannel(channelId)
    const [streams, setStreams] = useState<GetStreamsStream[]>([]);
    const [newName, setNewName] = useState<string>("")

    useEffect(() => {
        if (channel) {
            post(getEndpoints().stream_get_all, {channel_id: channel.id})
                .then((streamsData: GetStreamsResponse) => {
                    setStreams(streamsData.streams)
                })
        }
    }, [channel]);

    const router = useRouter()

    function removeStream(stream: GetStreamsStream) {
        setStreams((oldStreams) => {
            let newStreams = [...oldStreams]
            return newStreams.filter(i => i.id != stream.id)
        })
    }

    function addStream(stream: GetStreamsStream) {
        setStreams((oldStreams) => {
            let newStreams = [...oldStreams]
            newStreams.push(stream)
            return newStreams
        })
    }

    function sortStreamsByDate(streams: GetStreamsStream[]) {
        return [...streams].sort((a, b) => {
            if (a.created_at > b.created_at) return -1
            if (a.created_at < b.created_at) return 1
            return 0
        })
    }

    function redirectToDemo() {
        router.push(`/demo/${channelId}`)
    }

    function redirectToOBS() {
        router.push(`/obs/${channelId}`)
    }

    function redirectToOBSTeams() {
        router.push(`/obs/teams/${channelId}`)
    }

    function redirectToOBSManage() {
        router.push(`/obs/manage/${channelId}`)
    }

    function updateChannel(updatedChannel: WNChannel) {
        let body: WNChannel = {
            id: updatedChannel.id,
            name: updatedChannel.name,
            demo_id: updatedChannel.demo_id,
            default_high_bid_floor: updatedChannel.default_high_bid_floor,
            default_high_bid_team: updatedChannel.default_high_bid_team
        }
        post(getEndpoints().channel_update, body)
            .then(response => {
                if (response.success && channel) {
                    setChannel(updatedChannel)
                }
            })
    }

    return (
        <main>
            <div className='d-flex justify-content-center fs-1'>{channel?.name}</div>
            <div className='d-flex justify-content-between'>
                <div>
                    <button type='button' className='btn btn-primary' onClick={redirectToDemo}>Demo</button>
                    <button type='button' className='btn btn-primary' onClick={redirectToOBS}>OBS</button>
                    <button type='button' className='btn btn-primary' onClick={redirectToOBSTeams}>Teams</button>
                    <button type='button' className='btn btn-primary' onClick={redirectToOBSManage}>Manage OBS</button>
                </div>
                <div className="d-flex justify-content-center">
                    <ul className="list-group">
                        <li className="list-group-item">
                            <TextInputAction value={newName} setNewValue={setNewName} placeholder={'Enter new name...'}
                                             action={() => {
                                                 const body = {
                                                     name: newName,
                                                     channel_id: channelId,
                                                 };
                                                 post(getEndpoints().stream_add, body)
                                                     .then(response => {
                                                         let stream: GetStreamsStream = response
                                                         addStream(stream)
                                                         setNewName('')
                                                     })
                                             }
                                             } actionLabel='Add'/>
                        </li>
                        {
                            sortStreamsByDate(streams).map(
                                (stream: GetStreamsStream, index: number, arr: GetStreamsStream[]) => {
                                    return <li key={stream.id} className="list-group-item text-white">
                                        <div className="container-fluid">
                                            <div className="row">
                                                <div className="col" onClick={e => {
                                                    router.push(`/stream/${stream.id}`)
                                                }}>
                                                    {stream.name}
                                                    <span
                                                        className='text-secondary'>{` at ${moment(new Date(stream.created_at)).format("YYYY/MM/DD")}`}</span>
                                                </div>
                                                <div className="col-2">
                                                    <img src="/images/bin_static_sm.png"
                                                         className="img-fluid float-right" alt="" onClick={
                                                        async e => {
                                                            const body = {
                                                                id: stream.id
                                                            };
                                                            const response = await post((await getEndpoints()).stream_delete, body);
                                                            if (response.success) {
                                                                removeStream(stream)
                                                            }
                                                        }
                                                    }/>
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                }
                            )
                        }
                    </ul>
                </div>
                <div>
                    {channel && <ChannelPropertiesComponent channel={channel} updateChannel={updateChannel}/>}
                </div>
            </div>
        </main>
    )
}