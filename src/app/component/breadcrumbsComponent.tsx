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

    if (isBreakPage()) {
        let pathPart = pathname.split('/')
        let params = {
            breakId: parseInt(pathPart[pathPart.length - 1])
        }
        breadcrumbs.push(<div key='split-1' className='pe-3'>/</div>)
        breadcrumbs.push(<BreakBreadcrumbs key='day' params={params}/>)
    }

    const isDemo = pathname.indexOf('demo') !== -1

    return (
        <div>
            {
                !isDemo && <nav className="navbar navbar-expand-lg navbar-light bg-dark ps-lg-4">
                    <a key='days' className="navbar-brand" href="/days">Days</a>
                    {breadcrumbs}
                </nav>
            }
        </div>
    )
}