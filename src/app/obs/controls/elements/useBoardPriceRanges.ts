'use client'

// Shared "Board: Price Ranges" (tier thresholds) behaviour, pulled out of CobraBoardSettings.tsx so
// SportStyleBoardSettings can render the same card without dragging in cobra's Side Cards Price and
// Presets cards, which don't apply to sport_style. This is a pure extraction — CobraBoardSettings'
// Presets flow still reads/writes `priceRanges`/`rangeEdits` and calls `save`/`writeRange` itself
// (its apply-preset confirmation and cue-firing stay exactly as they were), so every piece it needs
// is re-exported from the hook's return value rather than folded away.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import {PriceRange} from '@/app/entity/entities'
import type {DurableCue} from '@/app/obs/layout/schema'
import {useSettingWrite} from './useSettingWrite'

export function useBoardPriceRanges(channelId: number, onFireCue?: (cue: DurableCue) => void) {
    const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
    const [rangeEdits, setRangeEdits] = useState<Record<string, string>>({})
    const {save: writeRange} = useSettingWrite(onFireCue)

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
        const result = await writeRange('priceRanges', () => post(getEndpoints().widget_board_price_ranges_update, {channel_id: channelId, tier_id: tierId, price_from: priceFrom}))
        if (result.ok) {
            setPriceRanges(prev => prev.map(r => r.tier_id === tierId ? {...r, price_from: priceFrom} : r))
        }
    }

    return {priceRanges, setPriceRanges, rangeEdits, setRangeEdits, savePriceRange, writeRange}
}
