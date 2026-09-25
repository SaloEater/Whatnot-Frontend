'use client'

// The presentational half of the "Board: Price Ranges" card, extracted out of CobraBoardSettings.tsx
// so SportStyleBoardSettings can render the same tier-threshold table (both boards read the same
// channel-wide `priceRanges`) without pulling in cobra's Side Cards Price / Presets cards. All state
// and the save call live in useBoardPriceRanges.ts — this component is purely markup, unchanged from
// the table cobra already had.

import {PriceRange} from '@/app/entity/entities'

export const TIER_ALIASES: Record<string, string> = {best: 'God', good: 'Giant', mid: 'Chaser'}

type Props = {
    priceRanges: PriceRange[]
    rangeEdits: Record<string, string>
    setRangeEdits: (update: (prev: Record<string, string>) => Record<string, string>) => void
    savePriceRange: (tierId: string) => void
}

export default function BoardPriceRangesCard({priceRanges, rangeEdits, setRangeEdits, savePriceRange}: Props) {
    return (
        <div className="card" style={{minWidth: '260px'}}>
            <div className="card-body">
                <h6 className="card-title">Board: Price Ranges</h6>
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
            </div>
        </div>
    )
}
