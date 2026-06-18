'use client'

import React, {JSX, useEffect, useState} from "react";
import {usePathname} from "next/navigation";
import {StreamBreadcrumbsComponent} from "@/app/component/streamBreadcrumbsComponent";
import {getEndpoints, post} from "@/app/lib/backend";
import {Series, WNBreak} from "@/app/entity/entities";
import {ChannelBreadcrumbsComponent} from "@/app/component/channelBreadcrumbsComponent";


export default function BreadcrumbsComponent() {
    const [breadcrumbs, setBreadcrumbs] = useState<JSX.Element[]>([])
    const pathname = usePathname() ?? ""

    useEffect(() => {
        getBreadcrumbs()
    }, [pathname]);

    function isBreakPage()        { return pathname.indexOf('break') !== -1 }
    function isStreamPage()       { return pathname.indexOf('stream') !== -1 }
    function isChannelPage()      { return pathname.indexOf('channel') !== -1 }
    function isSeriesPage()       { return pathname.indexOf('series') !== -1 }
    function isObsManagePage()    { return pathname.indexOf('obs') !== -1 && pathname.indexOf('manage') !== -1 }
    function isStreamRelatedPage(){ return isObsManagePage() }

    async function getBreadcrumbs() {
        const pathPart = pathname.split('/')
        const newBreadcrumbs: JSX.Element[] = []

        const slash = (key: string) => <div key={key} className='px-2'>/</div>
        const channelsLink = <a key='channels' className="nav-link active" href="/channels">Channels</a>
        const seriesLink   = <a key='series'   className="nav-link active" href="/series">Series</a>

        if (isSeriesPage()) {
            newBreadcrumbs.push(slash('s0'), seriesLink)
            const id = parseInt(pathPart[2])
            if (!isNaN(id)) {
                const s: Series = await post(getEndpoints().series_get, {id})
                if (s) {
                    newBreadcrumbs.push(slash('s1'))
                    newBreadcrumbs.push(<a key='seriesName' className="nav-link active" href={`/series/${id}`}>{s.name}</a>)
                }
                if (pathname.indexOf('team-prices') !== -1) {
                    newBreadcrumbs.push(slash('s2'))
                    newBreadcrumbs.push(<span key='teamPrices' className="nav-link">Team Prices</span>)
                }
            }
        } else if (isStreamPage()) {
            const streamId = parseInt(pathPart[pathPart.length - 1])
            newBreadcrumbs.push(slash('c0'), channelsLink)
            newBreadcrumbs.push(slash('c1'))
            newBreadcrumbs.push(<ChannelBreadcrumbsComponent key='channel' streamId={streamId}/>)
        } else if (isBreakPage()) {
            const breakO: WNBreak = await post(getEndpoints().break_get, {id: parseInt(pathPart[pathPart.length - 1])})
            newBreadcrumbs.push(slash('c0'), channelsLink)
            newBreadcrumbs.push(slash('c1'))
            newBreadcrumbs.push(<ChannelBreadcrumbsComponent key='channel' streamId={breakO.day_id}/>)
            newBreadcrumbs.push(slash('c2'))
            newBreadcrumbs.push(<StreamBreadcrumbsComponent key='stream' streamId={breakO.day_id}/>)
        } else if (isStreamRelatedPage()) {
            const streamId = parseInt(pathPart[pathPart.length - 1])
            newBreadcrumbs.push(slash('c0'), channelsLink)
            newBreadcrumbs.push(slash('c1'))
            newBreadcrumbs.push(<ChannelBreadcrumbsComponent key='channel' streamId={streamId}/>)
            newBreadcrumbs.push(slash('c2'))
            newBreadcrumbs.push(<StreamBreadcrumbsComponent key='stream' streamId={streamId}/>)
        } else if (isChannelPage()) {
            newBreadcrumbs.push(slash('c0'), channelsLink)
        }

        setBreadcrumbs(newBreadcrumbs)
    }

    const isHidden = pathname === '/'
        || pathname.indexOf('demo') !== -1
        || (pathname.indexOf('obs') !== -1 && !isObsManagePage())
        || /\/channel\/\d+\/photos/.test(pathname)

    return (
        <div>
            {!isHidden && (
                <nav className="navbar navbar-expand-lg navbar-light bg-dark ps-lg-4">
                    <a key='home' className="navbar-brand" href="/">Home</a>
                    {breadcrumbs}
                </nav>
            )}
        </div>
    )
}
