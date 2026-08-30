'use client'

import {getEndpoints, post} from "@/app/lib/backend";
import React, {useEffect, useState} from "react";
import moment from "moment/moment";
import {useRouter} from "next/navigation";
import {GetStreamsResponse, StreamResponse, WNChannel} from "@/app/entity/entities";
import {TextInputAction} from "@/app/component/textInputAction";
import {useChannel} from "@/app/hooks/useChannel";
import {ChannelPropertiesComponent} from "@/app/channel/[id]/channelPropertiesComponent";

const ALLOWED_PAGE_SIZES = [20, 50, 100]
const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_STORAGE_KEY = 'channel-streams-page-size'

export default function Page({params}: {params: {id: string}}) {
    const channelId = parseInt(params.id)
    const [channel, setChannel] = useChannel(channelId)
    const [streams, setStreams] = useState<StreamResponse[]>([]);
    const [newName, setNewName] = useState<string>("")
    const [page, setPage] = useState(1)
    const [total, setTotal] = useState(0)
    const [pageSize, setPageSize] = useState(() => {
        if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE
        const stored = parseInt(localStorage.getItem(PAGE_SIZE_STORAGE_KEY) ?? '')
        return ALLOWED_PAGE_SIZES.includes(stored) ? stored : DEFAULT_PAGE_SIZE
    })

    function fetchStreams() {
        if (!channel) return
        post(getEndpoints().stream_get_all, {channel_id: channel.id, page, page_size: pageSize})
            .then((streamsData: GetStreamsResponse) => {
                setStreams(streamsData?.streams ?? [])
                setTotal(streamsData?.total ?? 0)
            })
    }

    useEffect(() => {
        if (channel) {
            fetchStreams()
        }
    }, [channel, page, pageSize]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize))

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages)
        }
    }, [page, totalPages])

    const router = useRouter()

    function removeStream(stream: StreamResponse) {
        setStreams((oldStreams) => {
            let newStreams = [...oldStreams]
            return newStreams.filter(i => i.id != stream.id)
        })
    }

    function handlePageSizeChange(value: string) {
        const newSize = parseInt(value)
        localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(newSize))
        setPageSize(newSize)
        setPage(1)
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
            active_stream_id: updatedChannel.active_stream_id,
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
            <div style={{display: 'grid', gridTemplateColumns: '1fr auto 1fr'}}>
                <div className='d-flex flex-column gap-1'>
                    <div>
                        <button type='button' className='btn btn-primary' onClick={redirectToDemo}>Demo</button>
                        <button type='button' className='btn btn-primary' onClick={redirectToOBS}>OBS</button>
                        <button type='button' className='btn btn-primary' onClick={redirectToOBSTeams}>Teams</button>
                        <button type='button' className='btn btn-primary' onClick={redirectToOBSManage}>Manage OBS</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/photos`, '_blank')}>Cards Board ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => router.push(`/channel/${channelId}/photos/controls`)}>Cards Controls</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/obs/prices/${channelId}`, '_blank')}>Prices OBS ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/obs/${channelId}/flat`, '_blank')}>OBS Flat ↗</button>
                    </div>
                    <div>
                        <hr className='my-1'/>
                        <div className='text-center'>Widgets</div>
                        <button type='button' className='btn btn-secondary' onClick={() => router.push(`/channel/${channelId}/widgets`)}>Settings</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/widget/series/stashorpass`, '_blank')}>Series.Stash or Pass ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/widget/series/pick2`, '_blank')}>Series.Pick 2 ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/widget/series/name`, '_blank')}>Series.Name ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/widget/series/boxes_per_break`, '_blank')}>Series.Boxes/Break ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/widget/chaser_left`, '_blank')}>Series.Chasers ↗</button>
                        <button type='button' className='btn btn-secondary' onClick={() => window.open(`/channel/${channelId}/widget/boxes_left`, '_blank')}>Series.Boxes Left ↗</button>
                    </div>
                </div>
                <div className="d-flex justify-content-center">
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2 text-white">
                        <div className="d-flex align-items-center gap-2">
                            <label className="text-secondary">Page size</label>
                            <select
                                className="form-select form-select-sm w-auto"
                                value={pageSize}
                                onChange={(e) => handlePageSizeChange(e.target.value)}
                            >
                                {ALLOWED_PAGE_SIZES.map((size) => (
                                    <option key={size} value={size}>{size}</option>
                                ))}
                            </select>
                        </div>
                        <div className="d-flex align-items-center gap-2">
                            <button
                                className="btn btn-sm btn-outline-light"
                                disabled={page <= 1}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                Prev
                            </button>
                            <span className="text-secondary">Page {page} of {totalPages}</span>
                            <button
                                className="btn btn-sm btn-outline-light"
                                disabled={page >= totalPages}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                Next
                            </button>
                        </div>
                    </div>
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
                                                         setNewName('')
                                                         if (page === 1) {
                                                             fetchStreams()
                                                         } else {
                                                             setPage(1)
                                                         }
                                                     })
                                             }
                                             } actionLabel='Add'/>
                        </li>
                        {
                            streams.map(
                                (stream: StreamResponse, index: number, arr: StreamResponse[]) => {
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
                                                    {/*<img src="/images/bin_static_sm.png"*/}
                                                    {/*     className="img-fluid float-right" alt="" onClick={*/}
                                                    {/*    async e => {*/}
                                                    {/*        const body = {*/}
                                                    {/*            id: stream.id*/}
                                                    {/*        };*/}
                                                    {/*        const response = await post((await getEndpoints()).stream_delete, body);*/}
                                                    {/*        if (response.success) {*/}
                                                    {/*            removeStream(stream)*/}
                                                    {/*        }*/}
                                                    {/*    }*/}
                                                    {/*}/>*/}
                                                </div>
                                            </div>
                                        </div>
                                    </li>
                                }
                            )
                        }
                    </ul>
                  </div>
                </div>
                <div className="d-flex justify-content-end">
                    {channel && <ChannelPropertiesComponent channel={channel} updateChannel={updateChannel}/>}
                </div>
            </div>
        </main>
    )
}