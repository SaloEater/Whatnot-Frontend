'use client'

import {get, getEndpoints, post} from "@/app/lib/backend";
import {useEffect, useState} from "react";
import moment from "moment/moment";
import {TuiDateTimePicker} from "nextjs-tui-date-picker";
import {useRouter} from "next/navigation";
import {GetStreamsStream, GetStreamsResponse} from "@/app/entity/entities";
import TextInput from "@/app/common/textInput";

export default function Page() {
    const [streams, setStreams] = useState<GetStreamsStream[]>([]);
    const [newName, setNewName] = useState("")

    useEffect(() => {
        get(getEndpoints().stream_get_all)
            .then(streamsData => {
                const streamsResponse: GetStreamsResponse = streamsData
                setStreams(streamsResponse.streams)
            })
    }, [])

    const dateTimeFormat = "YYYY-MM-dd"
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

    return (
        <main>
            <div className="d-flex justify-content-center">
                <ul className="list-group">
                    <li className="list-group-item">
                        <div>
                            <input className='text-input' value={newName} onChange={e => {
                                setNewName(e.target.value)
                            }} placeholder='Enter new name...'/>
                            <button type="button" id="add-Stream" className="btn bg-primary" onClick={
                                async e => {
                                    const body = {
                                        name: newName,
                                    };
                                    post(getEndpoints().stream_add, body)
                                        .then(response => {
                                            let stream: GetStreamsStream = response
                                            addStream(stream)
                                            setNewName('')
                                        })
                                }
                            }>Add</button>
                        </div>
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
                                                <span className='text-secondary'>{` at ${moment(new Date(stream.created_at)).format("YYYY/MM/DD")}`}</span>
                                            </div>
                                            <div className="col-2">
                                                <img src="/images/bin_static_sm.png" className="img-fluid float-right" alt="" onClick={
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
                {/*<div className="container-fluid">*/}
                {/*    <div className="row gx-2">*/}
                {/*        <div className="col-3">*/}
                {/*        </div>*/}
                {/*        <div className="col-2" key={(selectedBreak ?? "") + (new Date()).getTime().toString()}>*/}
                {/*            <StreamComponent selectedStream={selectedStream} selectedBreak={selectedBreak} setSelectedBreak={setSelectedBreak} requestedStreamsReload={requestedStreamsReload} requestStreamsReload={requestStreamsReload}/>*/}
                {/*        </div>*/}
                {/*        <div className="col-7">*/}
                {/*            {selectedStream && <Page selectedStream={selectedStream} selectedBreak={selectedBreak} requestedStreamsReload={requestedStreamsReload} requestStreamsReload={requestStreamsReload}/>}*/}
                {/*        </div>*/}
                {/*    </div>*/}
                {/*</div>*/}
            </div>
        </main>
    )
}