'use client'

// Settings for the `priceSign` element (obs-price-sign-plan.md §5) — copied from
// PriceRangesSettings.tsx (series fetch, kind notice, embedded SeriesPriceRangesEditor writing
// through useSettingWrite(onFireCue) with the same spine key 'seriesPriceRanges', since both
// elements read the same series data), plus five element-level inputs written through
// onPatchElement instead of the two priceRanges has: label font size, amount font size, board
// width %, chain length px, wind strength (number input, step 0.1).

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {Series} from '@/app/entity/entities'
import type {DurableCue, Element} from '@/app/obs/layout/schema'
import {
    DEFAULT_BADGE_FONT_SIZE,
    DEFAULT_BOARD_WIDTH_PCT,
    DEFAULT_CHAIN_LENGTH,
    DEFAULT_LABEL_FONT_SIZE,
    DEFAULT_WIND_STRENGTH,
} from '@/app/obs/layout/elements/price-sign/PriceSignElement'
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
    const labelFontSize = ps?.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
    const badgeFontSize = ps?.badgeFontSize ?? DEFAULT_BADGE_FONT_SIZE
    const boardWidthPct = ps?.boardWidthPct ?? DEFAULT_BOARD_WIDTH_PCT
    const chainLength = ps?.chainLength ?? DEFAULT_CHAIN_LENGTH
    const windStrength = ps?.windStrength ?? DEFAULT_WIND_STRENGTH

    const elementInputs = (
        <div className="d-flex flex-column gap-2">
            <div>
                <label className="form-label mb-0 small">Label font size (px)</label>
                <input
                    type="number"
                    min={8}
                    step={1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={labelFontSize}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        if (Number.isFinite(parsed) && parsed > 0) {
                            onPatchElement(elementKey, {labelFontSize: parsed})
                        }
                    }}
                />
            </div>
            <div>
                <label className="form-label mb-0 small">Amount font size (px)</label>
                <input
                    type="number"
                    min={8}
                    step={1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={badgeFontSize}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        if (Number.isFinite(parsed) && parsed > 0) {
                            onPatchElement(elementKey, {badgeFontSize: parsed})
                        }
                    }}
                />
            </div>
            <div>
                <label className="form-label mb-0 small">Board width (% of box)</label>
                <input
                    type="number"
                    min={1}
                    step={1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={boardWidthPct}
                    onChange={(e) => {
                        const parsed = parseFloat(e.target.value)
                        if (Number.isFinite(parsed) && parsed > 0) {
                            onPatchElement(elementKey, {boardWidthPct: parsed})
                        }
                    }}
                />
            </div>
            <div>
                <label className="form-label mb-0 small">Chain length (px)</label>
                <input
                    type="number"
                    min={0}
                    max={1000}
                    step={1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={chainLength}
                    onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10)
                        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1000) {
                            onPatchElement(elementKey, {chainLength: parsed})
                        }
                    }}
                />
            </div>
            <div>
                <label className="form-label mb-0 small">Wind strength (0 = static, 2 = max)</label>
                <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    className="form-control form-control-sm"
                    style={{width: '100px'}}
                    value={windStrength}
                    onChange={(e) => {
                        const parsed = parseFloat(e.target.value)
                        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 2) {
                            onPatchElement(elementKey, {windStrength: parsed})
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
