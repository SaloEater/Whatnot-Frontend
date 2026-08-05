/**
 * Shared fetch chain for every page built on the composite overlay's data
 * model: channel -> active stream -> break -> events, plus the pricing
 * sources (price-range thresholds, series info, per-team prices). Extracted
 * from useCompositeData.ts so a second consumer (the compact board's
 * useCompactData.ts) can read the same break/events/pricing state without
 * duplicating the fetch chain or its cadences — no behavior change on the
 * live overlay.
 *
 * WIRING PATTERN mirrors two existing pages, deliberately, rather than
 * inventing a new one:
 *   - Channel/stream/break/events cadence: src/app/obs/[id]/page.tsx
 *     (the live board) — useChannel(30s), break_get (30s), break_events (5s,
 *     the cadence the spec calls out as what will drive the future Zuma
 *     reflow).
 *   - Pricing cadence: src/app/obs/prices/[id]/page.tsx — series data +
 *     price ranges on break/channel change, GET /api/series/{id}/prices on
 *     a 60s poll. Tier/price computation itself is pricing.ts, unchanged.
 *
 * Widget polls (stash-or-pass, spin-2-choose-1, boxes-per-break) are NOT
 * part of this shared chain — only useCompositeData's live overlay needs
 * them, so they stay local to that hook.
 */
import { useEffect, useState } from 'react'
import { useChannel } from '@/app/hooks/useChannel'
import { useActiveStream } from '@/app/hooks/useActiveStream'
import { getEndpoints, get, post } from '@/app/lib/backend'
import {
  Event,
  GetEventsByBreakResponse,
  PriceRange,
  SeriesTeamTotal,
  SeriesWithCount,
  WNBreak,
} from '@/app/entity/entities'

// Cadences. Channel/break/events mirror the live board (obs/[id]/page.tsx)
// exactly; pricing mirrors /obs/prices/[id].
const CHANNEL_POLL_MS = 30000
const BREAK_POLL_MS = 30000
const EVENTS_POLL_MS = 5000
const PRICES_POLL_MS = 60000
const SERIES_POLL_MS = 60000

export interface CompositeSources {
  breakObject: WNBreak | null
  events: Event[]
  series: SeriesWithCount | null
  priceRanges: PriceRange[]
  teamPrices: SeriesTeamTotal[]
}

export function useCompositeSources(channelId: number): CompositeSources {
  // --- channel -> stream -> break -> events, cadence mirrors obs/[id]/page.tsx ---
  const [channel] = useChannel(channelId, CHANNEL_POLL_MS)
  const stream = useActiveStream(channel)

  const [breakObject, setBreakObject] = useState<WNBreak | null>(null)
  const [events, setEvents] = useState<Event[]>([])

  useEffect(() => {
    const breakId = stream?.active_break_id
    if (!breakId) {
      setBreakObject(null)
      setEvents([])
      return
    }

    // post()/get() (lib/backend.ts) already catch their own fetch/parse
    // failures and resolve to {error}/{} rather than rejecting — so a
    // .catch() here would be dead code. The `.then` guards below are what
    // actually keep bad/absent responses from clobbering state.
    function fetchBreak() {
      post(getEndpoints().break_get, { id: breakId })
        .then((b: WNBreak) => { if (b && !('error' in b)) setBreakObject(b) })
    }

    function fetchEvents() {
      post(getEndpoints().break_events, { break_id: breakId })
        .then((resp: GetEventsByBreakResponse) => {
          if (resp?.events) setEvents(resp.events)
        })
    }

    fetchBreak()
    fetchEvents()
    const idBreak = setInterval(fetchBreak, BREAK_POLL_MS)
    const idEvents = setInterval(fetchEvents, EVENTS_POLL_MS)
    return () => {
      clearInterval(idBreak)
      clearInterval(idEvents)
    }
  }, [stream?.active_break_id])

  // --- pricing sources, cadence mirrors /obs/prices/[id]/page.tsx ---
  const [series, setSeries] = useState<SeriesWithCount | null>(null)
  const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
  const [teamPrices, setTeamPrices] = useState<SeriesTeamTotal[]>([])

  useEffect(() => {
    // Thresholds change rarely (an operator setting, not a per-break value) — fetch once per channel.
    post(getEndpoints().widget_board_price_ranges_list, { channel_id: channelId })
      .then((d: { ranges: PriceRange[] }) => { if (d?.ranges) setPriceRanges(d.ranges) })
  }, [channelId])

  useEffect(() => {
    const seriesId = breakObject?.series_id
    if (!seriesId) {
      setSeries(null)
      setTeamPrices([])
      return
    }

    // series_get_with_count is a superset of series_get (extends Series with
    // unsold_count/sold_count) — one call covers both the pricing default
    // price and the divider's name/count readout.
    function fetchSeries() {
      post(getEndpoints().series_get_with_count, { id: seriesId })
        .then((s: SeriesWithCount) => { if (s && !('error' in s)) setSeries(s) })
    }

    function fetchPrices() {
      get(`/api/series/${seriesId}/prices`)
        .then((data: SeriesTeamTotal[]) => setTeamPrices(Array.isArray(data) ? data : []))
    }

    fetchSeries()
    fetchPrices()
    const idSeries = setInterval(fetchSeries, SERIES_POLL_MS)
    const idPrices = setInterval(fetchPrices, PRICES_POLL_MS)
    return () => {
      clearInterval(idSeries)
      clearInterval(idPrices)
    }
  }, [breakObject?.series_id])

  return { breakObject, events, series, priceRanges, teamPrices }
}
