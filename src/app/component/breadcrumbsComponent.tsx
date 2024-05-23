'use client'

import React, {useEffect, useState} from "react";
import {usePathname, useRouter, useSearchParams} from "next/navigation";
import BreakBreadcrumbs from "@/app/component/breakBreadcrumbs";

export default function BreadcrumbsComponent() {
    const router = useRouter();
    const pathname = usePathname() ?? ""
    const breadcrumbs = []

    function isBreakPage() {
        return pathname.indexOf('break') !== -1;
    }

    function isObsManagePage() {
        return pathname.indexOf('obs') !== -1 && pathname.indexOf('manage') !== -1
    }

    function isStreamRelatedPage() {
        return isObsManagePage()
    }

    if (isBreakPage()) {
        let pathPart = pathname.split('/')
        let params = {
            breakId: parseInt(pathPart[pathPart.length - 1])
        }
        breadcrumbs.push(<div key='split-1' className='pe-3'>/</div>)
        breadcrumbs.push(<BreakBreadcrumbs key='day' params={params}/>)
    } else if (isStreamRelatedPage()) {
        let pathPart = pathname.split('/')
        let streamId = parseInt(pathPart[pathPart.length - 1])
        breadcrumbs.push(<div key='split-1' className='pe-3'>/</div>)
        breadcrumbs.push(<a key='stream' className="nav-link active" href={`/stream/${streamId}`}>Stream {streamId}</a>)
    }

    const isDemo = pathname.indexOf('demo') !== -1 || (pathname.indexOf('obs') !== -1 && !isObsManagePage())

    return (
        <div>
            {
                !isDemo && <nav className="navbar navbar-expand-lg navbar-light bg-dark ps-lg-4">
                    <a key='days' className="navbar-brand" href="/streams">Streams</a>
                    {breadcrumbs}
                </nav>
            }
        </div>
    )
}