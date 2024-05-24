'use client'

import {get, getEndpoints, post} from "@/app/lib/backend";
import {useEffect, useState} from "react";
import moment from "moment/moment";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import {useRouter} from "next/navigation";
import {GetStreamsResponse, GetChannelsChannel, GetChannelsResponse} from "@/app/entity/entities";
import {TextInputAction} from "@/app/component/textInputAction";

export default function Page() {
    const [channels, setChannels] = useState<GetChannelsChannel[]>([]);
    const [newName, setNewName] = useState("")

    useEffect(() => {
        get(getEndpoints().channel_get_all)
            .then((data: GetChannelsResponse) => {
                setChannels(data.channels)
            })
    }, [])

    const router = useRouter()

    function removeChannel(channel: GetChannelsChannel) {
        setChannels((old) => {
            let newStreams = [...old]
            return newStreams.filter(i => i.id != channel.id)
        })
    }

    function addChannel(channel: GetChannelsChannel) {
        setChannels((old) => {
            let newStreams = [...old]
            newStreams.push(channel)
            return newStreams
        })
    }

    function sortChannels(channels: GetChannelsChannel[]) {
        return channels.sort((a, b) => {
            if (a.name > b.name) return 1
            if (a.name < b.name) return -1
            return 0
        })
    }

    return (
        <main>
            <div className="d-flex justify-content-center">
                <ul className="list-group">
                    <li className="list-group-item">
                        <TextInputAction value={newName} setNewValue={setNewName} placeholder={'Enter new name...'} action={() => {
                                const body = {
                                    name: newName,
                                };
                                post(getEndpoints().channel_add, body)
                                    .then((response: GetChannelsChannel) => {
                                        addChannel(response)
                                        setNewName('')
                                    })
                            }
                        } actionLabel='Add'/>
                    </li>
                    {
                        sortChannels(channels).map(
                            (channel: GetChannelsChannel, index: number, arr: GetChannelsChannel[]) => {
                                return <li key={channel.id} className="list-group-item text-white">
                                    <div className="container-fluid">
                                        <div className="row">
                                            <div className="col" onClick={e => {
                                                router.push(`/channel/${channel.id}`)
                                            }}>{channel.name}</div>
                                            <div className="col-2">
                                                <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
                                                    _ => {
                                                        const body = {
                                                            id: channel.id
                                                        };
                                                        post(getEndpoints().channel_delete, body).then(response => {
                                                            if (response.success) {
                                                                removeChannel(channel)
                                                            }
                                                        });
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
        </main>
    )
}