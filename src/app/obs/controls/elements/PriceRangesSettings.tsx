'use client'

// Settings for the `priceRanges` element (series-price-ranges-plan.md §4.6) — series-scoped like
// BoxesPerBreakSettings/NameSettings (keyed by series_id from the active break, not channel_id),
// plus two element-level font-size settings (LayoutConfig fields, like `text.fontSize` — see
// TextSettings.tsx). Fetches the series itself first to check `kind`: under a `cards` series there
// is nothing to edit (a ranges table would just write rows nobody's layout ever reads), so the
// panel shows a notice instead of the editor rather than silently letting the operator fill one
// in. The font-size inputs render regardless of series kind, same as the rest of an
// ElementSettings panel would.
//
// Every write goes through useSettingWrite(onFireCue) with spine key 'seriesPriceRanges' so the
// layout's `priceRanges` element refetches immediately (see useLayoutData.tsx) instead of waiting
// for its next poll.

import {useEffect, useState} from 'react'
import {getEndpoints, post} from '@/app/lib/backend'
import type {Series} from '@/app/entity/entities'
import type {DurableCue, Element} from '@/app/obs/layout/schema'
import {DEFAULT_BADGE_FONT_SIZE, DEFAULT_LABEL_FONT_SIZE} from '@/app/obs/layout/elements/price-ranges/PriceRangesElement'
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

export default function PriceRangesSettings({elementKey, element, onPatchElement, seriesId, onFireCue}: Props) {
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

    const pr = element.kind === 'priceRanges' ? element : null
    const labelFontSize = pr?.labelFontSize ?? DEFAULT_LABEL_FONT_SIZE
    const badgeFontSize = pr?.badgeFontSize ?? DEFAULT_BADGE_FONT_SIZE

    const fontSizeInputs = (
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
        </div>
    )

    if (!seriesId) {
        return (
            <div className="d-flex flex-column gap-2">
                {fontSizeInputs}
                <div className="text-secondary small">No active series on the current break.</div>
            </div>
        )
    }

    if (!series) {
        return (
            <div className="d-flex flex-column gap-2">
                {fontSizeInputs}
                <div className="text-secondary small">Loading…</div>
            </div>
        )
    }

    if (series.kind !== 'price_ranges') {
        return (
            <div className="d-flex flex-column gap-2">
                {fontSizeInputs}
                <div className="text-secondary small">
                    This break&apos;s series is a cards series — price ranges are only editable
                    under a price-ranges series.
                </div>
            </div>
        )
    }

    return (
        <div className="d-flex flex-column gap-2">
            {fontSizeInputs}
            <SeriesPriceRangesEditor
                seriesId={seriesId}
                // useSettingWrite returns {ok, data} rather than the raw response; the editor decides
                // success by the raw `{error}` shape, so unwrap here and hand a failure back in that shape.
                onWrite={(write) => writeSetting('seriesPriceRanges', write).then((r) => r.ok ? r.data : {error: true})}
            />
        </div>
    )
}
