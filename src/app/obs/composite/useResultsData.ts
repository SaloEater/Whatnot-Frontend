/**
 * Data hook for the results screen (figure 1f) — a slim SIBLING of
 * useCompositeData.ts, not a fork of it. The live overlay's board needs a
 * fast event poll to drive the Zuma reflow; this screen recaps a CLOSED
 * break, so everything here polls slowly (or not at all) and nothing
 * animates.
 *
 * WIRING, mirroring useCompositeData.ts's conventions:
 *   - useChannel(30s) -> useActiveStream -> stream.active_break_id, same
 *     cadence as the live board.
 *   - `?break=<id>` query param OVERRIDES the active break id (Decision D2,
 *     overlay-1f-plan.md): the operator may already have advanced the
 *     channel's active break to the next one by the time they scene-switch
 *     to show these results, so relying on `active_break_id` alone would
 *     race. The override removes that race for zero cost.
 *   - `break_get` ONCE per breakId (not polled, unlike useCompositeData's
 *     30s poll) — this break is closed, so `series_id` cannot change
 *     underneath us; it exists purely to learn `series_id` for the subtitle
 *     AND for the pricing fetches below.
 *   - `break_events` on a 30s poll — slower than the live board's 5s (there's
 *     no Zuma reflow to feed here), just enough to pick up an operator
 *     correction after the fact (D2/§2 stage 2 in the plan).
 *   - `series_get_with_count` once `series_id` is known, for the subtitle's
 *     series name AND `Series.default_price` (the pricing fallback — see
 *     below). (The spec's §5 table says `series_get`; this reuses
 *     `series_get_with_count` instead, same substitution useCompositeData.ts
 *     already made, since it is a strict superset already in use elsewhere.)
 *
 * ELIGIBILITY / MAPPING (Decision D3, spec §5): mirrors the live board's own
 * filter exactly — `!event.is_giveaway && !event.note` — because this screen
 * is a recap of the same board; a slot the live board never showed shouldn't
 * appear in its own results. `ResultEntry.special` reuses the same
 * `!IsTeam(event.team)` split the live board uses to route an event to a
 * team tile vs a custom-spot tile. `ResultEntry.team` carries the raw
 * `event.team` label through unchanged — ResultTile.tsx uses it to pick the
 * team image (real teams) or run it through getSpotAbbreviation() (specials),
 * and composeResults() uses it both as the tier-pool key and as the
 * display-order sort key.
 *
 * TIER ASSIGNMENT (supersedes spec §5's price-rank rule — see results.ts's
 * module comment and composeResults()): this screen now fetches the SAME
 * three sources useCompositeData.ts does for the live board's BoardTile —
 *   - `widget_board_price_ranges_list`   -> PriceRange[]      (channel-scoped, once per channel)
 *   - `GET /api/series/{seriesId}/prices` -> SeriesTeamTotal[] (once per series — the break is
 *     closed, so one fetch is enough; no poll needed)
 *   - `series.default_price`             (from the series_get_with_count call above)
 * `resolveThresholds(priceRanges)` turns the first into `TierThresholds`, and
 * `composeResults()` (results.ts) takes it from there — teams and specials
 * alike now tier off real series price data, not `Event.price`.
 *
 * MOCK FALLBACK: `?mock=1` runs resultsMock.ts's static bundle — entries AND
 * its accompanying mock price data — through the exact same `composeResults()`
 * call the live path uses (not a separately pre-tiered array) — the mock and
 * the real pipeline can't quietly diverge. As in useCompositeData.ts, the
 * real-data hooks above still run in mock mode (Rules of Hooks: hooks always
 * run, their results are just unused) — this is an explicit escape hatch,
 * never an automatic fallback while real data is loading.
 *
 * LOADING/ABSENT: renders an empty result list (title + empty grid + camera
 * frame in the page) — never fake data. Same NO_VALUE-placeholder spirit as
 * useCompositeData.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import { useChannel } from '@/app/hooks/useChannel'
import { useActiveStream } from '@/app/hooks/useActiveStream'
import { getEndpoints, get, post } from '@/app/lib/backend'
import { IsTeam } from '@/app/common/teams'
import {
  Event,
  GetEventsByBreakResponse,
  PriceRange,
  SeriesTeamTotal,
  SeriesWithCount,
  WNBreak,
} from '@/app/entity/entities'
import { composeResults, type PlacedResult, type ResultEntry } from './results'
import { DEFAULT_PRICE, resolveThresholds, type TierThresholds } from './pricing'
import { RESULTS_MOCK, RESULTS_MOCK_DEFAULT_PRICE, RESULTS_MOCK_SERIES_LABEL, RESULTS_MOCK_TEAM_PRICES, RESULTS_MOCK_THRESHOLDS } from './resultsMock'

// The break is closed — both cadences below are deliberately slower than the
// live board's (useCompositeData.ts: 30s channel, 5s events). There is no
// Zuma reflow to feed; 30s is "enough to pick up an operator correction",
// per the plan.
const CHANNEL_POLL_MS = 30000
const EVENTS_POLL_MS = 30000

export interface ResultsData {
  placed: PlacedResult[]
  /** Series name for the subtitle, or '' while unknown/loading — never fake data. */
  seriesLabel: string
  /** Count of eligible events, for the "{N} SLOTS" half of the subtitle. */
  slotCount: number
  isMock: boolean
}

/** Placeholder text while a value hasn't loaded yet — never fake data. */
const NO_VALUE = ''

function readMockFlag(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('mock') === '1'
}

/** Decision D2: `?break=<id>` overrides `stream.active_break_id`. */
function readBreakOverride(): number | null {
  if (typeof window === 'undefined') return null
  const raw = new URLSearchParams(window.location.search).get('break')
  if (!raw) return null
  const parsed = parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : null
}

export function useResultsData(channelId: number): ResultsData {
  // Static reads: OBS loads this page once with a fixed URL, so a one-time
  // read is enough (mirrors useCompositeData.ts's isMock).
  const [isMock] = useState(readMockFlag)
  const [breakOverride] = useState(readBreakOverride)

  // --- channel -> stream -> break id, same cadence as the live board ---
  const [channel] = useChannel(channelId, CHANNEL_POLL_MS)
  const stream = useActiveStream(channel)
  const activeBreakId = breakOverride ?? stream?.active_break_id ?? null

  const [breakObject, setBreakObject] = useState<WNBreak | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [series, setSeries] = useState<SeriesWithCount | null>(null)

  // break_get: ONE fetch per breakId, not polled — the break is closed, so
  // series_id cannot change under us. Only exists to learn series_id.
  useEffect(() => {
    if (!activeBreakId) {
      setBreakObject(null)
      return
    }
    post(getEndpoints().break_get, { id: activeBreakId }).then((b: WNBreak) => {
      if (b && !('error' in b)) setBreakObject(b)
    })
  }, [activeBreakId])

  // break_events: polled slowly (30s) to pick up operator corrections after
  // the break has closed — see module comment for why this is slower than
  // the live board's 5s poll.
  useEffect(() => {
    if (!activeBreakId) {
      setEvents([])
      return
    }

    function fetchEvents() {
      post(getEndpoints().break_events, { break_id: activeBreakId }).then(
        (resp: GetEventsByBreakResponse) => {
          if (resp?.events) setEvents(resp.events)
        },
      )
    }

    fetchEvents()
    const id = setInterval(fetchEvents, EVENTS_POLL_MS)
    return () => clearInterval(id)
  }, [activeBreakId])

  // series_get_with_count: ONE fetch once series_id is known — the subtitle's
  // series name AND (via series.default_price below) the pricing fallback.
  useEffect(() => {
    const seriesId = breakObject?.series_id
    if (!seriesId) {
      setSeries(null)
      return
    }
    post(getEndpoints().series_get_with_count, { id: seriesId }).then((s: SeriesWithCount) => {
      if (s && !('error' in s)) setSeries(s)
    })
  }, [breakObject?.series_id])

  // --- pricing sources, same three useCompositeData.ts fetches for BoardTile ---
  const [priceRanges, setPriceRanges] = useState<PriceRange[]>([])
  const [teamPrices, setTeamPrices] = useState<SeriesTeamTotal[]>([])

  // Thresholds change rarely (an operator setting, not a per-break value) — fetch once per channel.
  useEffect(() => {
    post(getEndpoints().widget_board_price_ranges_list, { channel_id: channelId }).then(
      (d: { ranges: PriceRange[] }) => {
        if (d?.ranges) setPriceRanges(d.ranges)
      },
    )
  }, [channelId])

  // GET /api/series/{seriesId}/prices: ONE fetch once series_id is known —
  // the break is closed, so team totals cannot change underneath us; no poll
  // needed (useCompositeData.ts polls this every 60s for a still-open break,
  // which does not apply here).
  useEffect(() => {
    const seriesId = breakObject?.series_id
    if (!seriesId) {
      setTeamPrices([])
      return
    }
    get(`/api/series/${seriesId}/prices`).then((data: SeriesTeamTotal[]) => {
      setTeamPrices(Array.isArray(data) ? data : [])
    })
  }, [breakObject?.series_id])

  const thresholds: TierThresholds = useMemo(() => resolveThresholds(priceRanges), [priceRanges])
  // Same fallback /obs/prices/[id] and useCompositeData.ts use — an empty
  // default_price doesn't mean "hide everything," it means fall back to
  // pricing.ts's DEFAULT_PRICE constant.
  const defaultPrice = series?.default_price || DEFAULT_PRICE

  // --- eligibility filter + ResultEntry mapping, mirrors the live board (D3) ---
  const entries: ResultEntry[] = useMemo(() => {
    const eligible = events.filter((e) => !e.is_giveaway && !e.note)
    return eligible.map((e) => ({
      id: e.id,
      buyer: e.customer,
      team: e.team,
      special: !IsTeam(e.team),
    }))
  }, [events])

  if (isMock) {
    // Same composeResults() call as the live path below, fed the mock's own
    // price data — the mock bundle goes through the exact same tier/sort
    // pipeline as real data, so the two can't drift apart.
    return {
      placed: composeResults(RESULTS_MOCK, RESULTS_MOCK_TEAM_PRICES, RESULTS_MOCK_DEFAULT_PRICE, RESULTS_MOCK_THRESHOLDS),
      seriesLabel: RESULTS_MOCK_SERIES_LABEL,
      slotCount: RESULTS_MOCK.length,
      isMock: true,
    }
  }

  return {
    placed: composeResults(entries, teamPrices, defaultPrice, thresholds),
    seriesLabel: series?.name ?? NO_VALUE,
    slotCount: entries.length,
    isMock: false,
  }
}
