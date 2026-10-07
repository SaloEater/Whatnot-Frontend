'use client'

// Settings for the `priceSign` element (obs-price-sign-plan.md §5) — copied from
// PriceRangesSettings.tsx (series fetch, kind notice, embedded SeriesPriceRangesEditor writing
// through useSettingWrite(onFireCue) with the same spine key 'seriesPriceRanges', since both
// elements read the same series data), plus one element-level input ("Font scale")
// written through onPatchElement.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {Series} from '@/app/entity/entities'
import type {DurableCue, Element} from '@/app/obs/layout/schema'
import SeriesPriceRangesEditor from '@/app/component/seriesPriceRangesEditor'
import {useSettingWrite} from './useSettingWrite'
import type {PatchElement} from './ElementBlock'

type Props = {
    elementKey: string
    element: Element
    onPatchElement: PatchElement
    seriesId?: number | null
    onFireCue?: (cue: DurableCue) => void
}

export default function PriceSignSettings({elementKey, element, onPatchElement, seriesId, onFireCue}: Props) {
    const [series, setSeries] = useState<Series | null>(null)
    const {save: writeSetting} = useSettingWrite(onFireCue)

    useEffect(() => {
        if (!seriesId) {
            setSeries(null)
            return
        }
        post(getEndpoints().series_get, {id: seriesId})
            .then((d: Series) => { if (d && !('error' in d)) setSeries(d) })
    }, [seriesId])

    const ps = element.kind === 'priceSign' ? element : null
    const fontScale = ps?.fontScale ?? 1

    const elementInputs = (
        <div className="d-flex flex-column gap-2">
            <div>
                <label className="form-label mb-0 small">Font scale</label>
                <input
                    type="number"
                    min={0.1}
                    step={0.05}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={fontScale}
                    onChange={(e) => {
                        const parsed = parseFloat(e.target.value)
                        if (Number.isFinite(parsed) && parsed > 0) {
                            onPatchElement(elementKey, {fontScale: parsed})
                        }
                    }}
                />
            </div>
        </div>
    )

    if (!seriesId) {
        return (
            <div className="d-flex flex-column gap-2">
                {elementInputs}
                <div className="text-secondary small">No active series on the current break.</div>
            </div>
        )
    }

    if (!series) {
        return (
            <div className="d-flex flex-column gap-2">
                {elementInputs}
                <div className="text-secondary small">Loading…</div>
            </div>
        )
    }

    if (series.kind !== 'price_ranges') {
        return (
            <div className="d-flex flex-column gap-2">
                {elementInputs}
                <div className="text-secondary small">
                    This break&apos;s series is a cards series — price ranges are only editable
                    under a price-ranges series.
                </div>
            </div>
        )
    }

    return (
        <div className="d-flex flex-column gap-2">
            {elementInputs}
            <SeriesPriceRangesEditor
                seriesId={seriesId}
                // useSettingWrite returns {ok, data} rather than the raw response; the editor decides
                // success by the raw `{error}` shape, so unwrap here and hand a failure back in that shape.
                onWrite={(write) => writeSetting('seriesPriceRanges', write).then((r) => r.ok ? r.data : {error: true})}
            />
        </div>
    )
}
