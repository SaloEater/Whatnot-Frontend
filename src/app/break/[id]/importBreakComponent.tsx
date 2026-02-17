import React, {FC, useRef} from "react";
import {Event} from "@/app/entity/entities";
import {getEndpoints, post} from "@/app/lib/backend";

interface ImportBreakProps {
    breakId: number
    events: Event[]
    onImported: () => void
}

interface ParsedRow {
    username: string
    team: string
    price: number
}

function parseCsv(content: string): ParsedRow[] {
    let lines = content.split('\n').filter(l => l.trim() !== '')
    if (lines.length < 2) return []

    // Skip header
    lines = lines.slice(1)

    // Format: Format,Title,Product,Description,Username,Order No.,Price,Notes
    const COL_TEAM = 2
    const COL_USERNAME = 4
    const COL_PRICE = 6

    return lines.map(line => {
        const cols = line.split(',')
        const team = (cols[COL_TEAM] ?? '').trim()
        const username = (cols[COL_USERNAME] ?? '').trim()
        const priceStr = (cols[COL_PRICE] ?? '').replace('$', '').trim()
        const price = parseFloat(priceStr) || 0

        return {username, team, price}
    }).filter(r => r.team !== '' && r.username !== '')
}

export const ImportBreakComponent: FC<ImportBreakProps> = ({breakId, events, onImported}) => {
    const fileInputRef = useRef<HTMLInputElement>(null)

    function handleWhatnotImport() {
        fileInputRef.current?.click()
    }

    function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (ev) => {
            const content = ev.target?.result as string
            const parsed = parseCsv(content)
            if (parsed.length === 0) return

            let chain = Promise.resolve()
            for (const row of parsed) {
                const matchingEvent = events.find(ev => ev.team === row.team && ev.customer === '')
                if (!matchingEvent) continue

                const updated = {...matchingEvent}
                updated.customer = row.username
                updated.price = row.price

                chain = chain.then(() =>
                    post(getEndpoints().event_update, updated).then(() => {})
                )
            }

            await chain
            onImported()
        }
        reader.readAsText(file)

        // Reset so the same file can be re-selected
        e.target.value = ''
    }

    return <div className="dropdown">
        <input type="file" ref={fileInputRef} accept=".csv" className="d-none" onChange={handleFileSelected}/>
        <button className="btn btn-secondary dropdown-toggle" type="button"
                data-bs-auto-close="true" data-bs-toggle="dropdown" aria-expanded="false">
            Import Break
        </button>
        <ul className="dropdown-menu cursor-pointer">
            <li className="dropdown-item" onClick={handleWhatnotImport}>Import WhatNot Break</li>
        </ul>
    </div>
}
