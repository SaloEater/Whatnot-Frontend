'use client'

import React, {JSX, useEffect, useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import {StreamBreadcrumbsComponent} from "@/app/component/streamBreadcrumbsComponent";
import {getEndpoints, post} from "@/app/lib/backend";
import {GetChannelsChannel, GetStreamsStream, WNBreak} from "@/app/entity/entities";
import {ChannelBreadcrumbsComponent} from "@/app/component/channelBreadcrumbsComponent";


export default function BreadcrumbsComponent() {
    const [breadcrumbs, setBreadcrumbs] = useState<JSX.Element[]>([])
    const pathname = usePathname() ?? ""

    useEffect(() => {
        getBreadcrumbs()
    }, [pathname]);

    function isBreakPage() {
        return pathname.indexOf('break') !== -1;
    }

    function isObsManagePage() {
        return pathname.indexOf('obs') !== -1 && pathname.indexOf('manage') !== -1
    }

    function isStreamRelatedPage() {
        return isObsManagePage()
    }

    function isChannelPage() {
        return pathname.indexOf('channel') !== -1;
    }

    function isStreamPage() {
        return pathname.indexOf('stream') !== -1;
    }

    async function getBreadcrumbs() {
        let pathPart = pathname.split('/')

        let newBreadcrumbs = []
        if (isStreamPage()) {
            let streamId = parseInt(pathPart[pathPart.length - 1])
            newBreadcrumbs.push(<div key='split-1' className='pe-3'>/</div>)
            newBreadcrumbs.push(<ChannelBreadcrumbsComponent key='channel' streamId={streamId}/>)
        } else if (isBreakPage()) {
            let breakO: WNBreak = await post(getEndpoints().break_get, {id: parseInt(pathPart[pathPart.length - 1])})
            newBreadcrumbs.push(<div key='split-1' className='pe-3'>/</div>)
            newBreadcrumbs.push(<ChannelBreadcrumbsComponent key='channel' streamId={breakO.day_id}/>)
            newBreadcrumbs.push(<div key='split-2' className='p-3'>/</div>)
            newBreadcrumbs.push(<StreamBreadcrumbsComponent key='stream' streamId={breakO.day_id}/>)
        } else if (isStreamRelatedPage()) {
            let streamId = parseInt(pathPart[pathPart.length - 1])
            newBreadcrumbs.push(<div key='split-1' className='pe-3'>/</div>)
            newBreadcrumbs.push(<ChannelBreadcrumbsComponent key='channel' streamId={streamId}/>)
            newBreadcrumbs.push(<div key='split-2' className='p-3'>/</div>)
            newBreadcrumbs.push(<StreamBreadcrumbsComponent key='stream' streamId={streamId}/>)
        }
        setBreadcrumbs(newBreadcrumbs)
    }

    const isDemo = pathname.indexOf('demo') !== -1 || (pathname.indexOf('obs') !== -1 && !isObsManagePage())
    return (
        <div>
            {
                !isDemo && <nav className="navbar navbar-expand-lg navbar-light bg-dark ps-lg-4">
                    <a key='days' className="navbar-brand" href="/channels">Channels</a>
                    {breadcrumbs}
                </nav>
            }
        </div>
    )
}