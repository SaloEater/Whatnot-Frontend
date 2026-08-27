'use client'

// Settings for the board:cobra element (its price-range tiers), ported verbatim
// (request/response handling, endpoints, and the tier alias labels) from
// src/app/channel/[id]/widgets/page.tsx.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {PriceRange} from '@/app/entity/entities'

const TIER_ALIASES: Record<string, string> = {best: 'God', good: 'Giant', mid: 'Chaser'}

export default function CobraBoardSettings({channelId}: { channelId: number }) {
    const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
    const [rangeEdits, setRangeEdits] = useState<Record<string, string>>({})

    useEffect(() => {
        post(getEndpoints().widget_board_price_ranges_list, {channel_id: channelId})
            .then((d: { ranges: PriceRange[] }) => {
                if (d?.ranges) {
                    setPriceRanges(d.ranges)
                    const edits: Record<string, string> = {}
                    d.ranges.forEach(r => { edits[r.tier_id] = String(r.price_from) })
                    setRangeEdits(edits)
                }
            })
    }, [channelId])

    async function savePriceRange(tierId: string) {
        const priceFrom = parseInt(rangeEdits[tierId]) || 0
        await post(getEndpoints().widget_board_price_ranges_update, {channel_id: channelId, tier_id: tierId, price_from: priceFrom})
        setPriceRanges(prev => prev.map(r => r.tier_id === tierId ? {...r, price_from: priceFrom} : r))
    }

    return (
        <table className="table table-sm mb-0" style={{maxWidth: '400px'}}>
            <thead><tr><th>Tier</th><th>Price From ($)</th><th></th></tr></thead>
            <tbody>
                {priceRanges.map(r => (
                    <tr key={r.tier_id}>
                        <td>{TIER_ALIASES[r.tier_id] ?? r.tier_id}</td>
                        <td>
                            <input
                                type="number"
                                className="form-control form-control-sm"
                                style={{width: '90px'}}
                                value={rangeEdits[r.tier_id] ?? r.price_from}
                                onChange={e => setRangeEdits(prev => ({...prev, [r.tier_id]: e.target.value}))}
                            />
                        </td>
                        <td>
                            <button className="btn btn-sm btn-primary" onClick={() => savePriceRange(r.tier_id)}>Save</button>
                        </td>
                    </tr>
                ))}
                {priceRanges.length === 0 && (
                    <tr><td colSpan={3} className="text-secondary small">No price ranges.</td></tr>
                )}
            </tbody>
        </table>
    )
}
