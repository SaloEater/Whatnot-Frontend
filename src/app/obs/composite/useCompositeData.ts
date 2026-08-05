/**
 * Stage-2 data hook for the composite overlay. Wires the shell built in
 * stage 1 to real data — no layout numbers move, only content swaps in.
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
 * EVENT -> SLOT MAPPING mirrors the live board exactly:
 *   - `sold`: `event.customer !== ''` — same rule the live board's
 *     EventComponent/CustomSpotComponent use (isTaken / getTeamImageSrc's
 *     " BW" suffix / showVideo all key off this). NOTE this is NOT the same
 *     rule /obs/prices/[id] uses — that page treats NoCustomer ('?') as
 *     still-available on purpose, because it's showing *upcoming* pricing.
 *     The board tile is a diegetic "is this taken" indicator like the live
 *     board, so it follows the live board's rule instead.
 *   - `special`: `!IsTeam(event.team)` — same split the live board uses to
 *     route an event to <EventComponent> vs <CustomSpotComponent>.
 *   - Board eligibility filter: `!event.is_giveaway && !event.note` — same
 *     filter the live board applies before splitting into team/custom
 *     lists. Giveaway events specifically: the live board pulls them out of
 *     the grid entirely and surfaces them through a separate "HIGH BID"
 *     panel (`breakObject.giveaway_team`/`high_bid_team`) that has no
 *     equivalent in this overlay yet — so, matching the live board, a
 *     giveaway event does not get a board tile here. Wiring an equivalent
 *     surface is out of scope for this stage.
 *
 * MOCK FALLBACK: `?mock=1` renders roster.ts's static bundle and skips all
 * of the above (the data hooks below still run so this stays within the
 * Rules of Hooks, but their results are simply not used). This is an
 * explicit escape hatch only — it is never an automatic fallback while real
 * data is loading. While loading/absent, the real path renders an empty
 * roster/checklist (see "Empty/loading states" below); it does not
 * silently substitute fake prices for a live OBS overlay.
 */
import { useEffect, useMemo, useState } from 'react'
import { usePhotoBoard } from '@/app/channel/[id]/photos/usePhotoBoard'
import { getEndpoints, post } from '@/app/lib/backend'
import { IsTeam } from '@/app/common/teams'
import { LAYOUT } from './tokens'
import { DEFAULT_PRICE, resolveThresholds, type TierThresholds } from './pricing'
import { composeRoster, type SpecialRef, type TeamRef } from './composeRoster'
import { useCompositeSources } from './useCompositeSources'
import * as mock from './roster'
import type { ChecklistMode, ChecklistRowState, PlacedRosterSlot, PricedChecklistItem } from './types'

// Cadences for the widget polls that stay local to this hook (stash-or-pass,
// pick2, boxes-per-break) — everything else ("changes rarely" per the spec's
// own 60-120s guidance) is covered by useCompositeSources's own cadences.
const SERIES_POLL_MS = 60000
const WIDGET_POLL_MS = 60000
/** Cards per row window, per density mode — must match CHECKLIST_MODE_LAYOUT's cols. Mode 0 shows everything (no windowing). */
const CHECKLIST_MODE_WINDOW: Record<ChecklistMode, number> = { 12: 4, 6: 4, 0: Number.POSITIVE_INFINITY }
/**
 * Per-row drift interval — the time a row takes to travel ONE card span —
 * indexed by VISUAL row (0 = top), per density mode. Rows lower on the panel
 * drift faster — a deliberate choice so the eye is drawn to "what's new"
 * nearer the bottom without every row moving in lockstep. Mode 6 has only
 * two rows, so it keeps the ends of the mode-12 range.
 */
const CHECKLIST_MODE_INTERVALS_MS: Record<ChecklistMode, readonly number[]> = {
  12: [30000, 22000, 15000],
  6: [30000, 15000],
  0: [], // everything is visible at once — nothing scrolls
}

export interface CompositeData {
  placedRoster: PlacedRosterSlot[]
  stashOrPassValue: string
  spin2ChooseValue: string
  seriesLabel: string
  boxesLabel: string
  countLabel: string
  /** Up to LAYOUT.checklist.rows rows, already tier-bucketed, collapsed, and circularly windowed. Paging is per-row now. */
  checklistRows: ChecklistRowState[]
  isMock: boolean
}

/** Placeholder text while a widget/divider value hasn't loaded yet — never fake data. */
const NO_VALUE = ''

function readMockFlag(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('mock') === '1'
}

export function useCompositeData(channelId: number, checklistMode: ChecklistMode = 12): CompositeData {
  // Static; OBS loads this page once with a fixed URL, so a one-time read is enough.
  const [isMock] = useState(readMockFlag)

  // --- channel -> stream -> break -> events, plus pricing sources — shared
  // with the compact board (see useCompositeSources.ts for cadences) ---
  const { breakObject, events, series, priceRanges, teamPrices } = useCompositeSources(channelId)

  // --- boxes-per-break widget: local to this hook (the live overlay's own
  // widget cadence, not part of the shared source chain) ---
  const [bpbAmount, setBpbAmount] = useState<number | null>(null)

  useEffect(() => {
    const seriesId = breakObject?.series_id
    if (!seriesId) {
      setBpbAmount(null)
      return
    }

    function fetchBpb() {
      post(getEndpoints().widget_boxes_per_break_get, { series_id: seriesId })
        .then((d: { amount: number }) => { if (d && typeof d.amount === 'number') setBpbAmount(d.amount) })
    }

    fetchBpb()
    const idBpb = setInterval(fetchBpb, SERIES_POLL_MS)
    return () => clearInterval(idBpb)
  }, [breakObject?.series_id])

  // --- stat row widgets ---
  const [sopPrice, setSopPrice] = useState<number | null>(null)
  const [p2Price, setP2Price] = useState<number | null>(null)

  useEffect(() => {
    function fetchWidgets() {
      post(getEndpoints().widget_stashorpass_get, { channel_id: channelId })
        .then((d: { price: number }) => { if (d && typeof d.price === 'number') setSopPrice(d.price) })
      post(getEndpoints().widget_pick2_get, { channel_id: channelId })
        .then((d: { price: number }) => { if (d && typeof d.price === 'number') setP2Price(d.price) })
    }
    fetchWidgets()
    const id = setInterval(fetchWidgets, WIDGET_POLL_MS)
    return () => clearInterval(id)
  }, [channelId])

  // --- thresholds: computed once here, shared by the board AND the checklist rows below (one tier system across the overlay) ---
  const thresholds: TierThresholds = useMemo(() => resolveThresholds(priceRanges), [priceRanges])

  // --- checklist: usePhotoBoard (own 120s poll) -> priced items -> tier-bucketed, collapsed, windowed rows ---
  const { photos } = usePhotoBoard(channelId)
  const checklistItems: PricedChecklistItem[] = useMemo(() => {
    if (isMock) return mock.CHECKLIST_ITEMS
    return photos
      .filter((p) => !p.is_sold && !p.is_deleted)
      .map((p) => ({ id: p.id, price: p.price, url: p.url, thumbnail: p.thumbnail || undefined, rotation: p.rotation ?? 0 }))
  }, [isMock, photos])
  const checklistThresholds = isMock ? mock.CHECKLIST_THRESHOLDS : thresholds
  const { rows: checklistRows } = useChecklistPage(checklistItems, checklistThresholds, checklistMode)

  // --- roster: mirror the live board's eligibility filter, then price/place ---
  const placedRoster = useMemo(() => {
    if (!breakObject) return []

    // STABLE INPUT ORDER — the fix for the board reshuffling on every events
    // poll. placeSlots() sorts by price with a STABLE sort, so equal-price
    // slots keep their INPUT order... and the backend's response order is not
    // guaranteed stable between polls. Pinning the input to the break's own
    // slot ordering (event.index, id as tie-break) makes placement a pure
    // function of the break's contents: within the same break_id the board
    // only moves when a price or sold state actually changes, never because
    // a poll returned the same events in a different order.
    const eligible = events
      .filter((e) => !e.is_giveaway && !e.note)
      .sort((a, b) => a.index - b.index || a.id - b.id)
    const teamRefs: TeamRef[] = eligible
      .filter((e) => IsTeam(e.team))
      .map((e) => ({ id: e.id, team: e.team, sold: e.customer !== '' }))
    const specialRefs: SpecialRef[] = eligible
      .filter((e) => !IsTeam(e.team))
      .map((e) => ({ id: e.id, label: e.team, price: e.price, sold: e.customer !== '' }))

    // Same fallback /obs/prices/[id] uses (page.tsx line 220) — an empty
    // default_price doesn't mean "hide everything," it means fall back to
    // pricing.ts's DEFAULT_PRICE constant, same as that page does.
    const defaultPrice = series?.default_price || DEFAULT_PRICE

    return composeRoster(specialRefs, teamRefs, teamPrices, defaultPrice, thresholds)
  }, [breakObject, events, series?.default_price, teamPrices, thresholds])

  if (isMock) {
    // checklistRows already comes from the shared useChecklistPage call above
    // (fed mock.CHECKLIST_ITEMS + mock.CHECKLIST_THRESHOLDS) — the mock path
    // goes through the exact same tier-bucketing/windowing code as live data,
    // so the two can't drift apart.
    return {
      placedRoster: mock.PLACED_ROSTER,
      stashOrPassValue: mock.STASH_OR_PASS_VALUE,
      spin2ChooseValue: mock.SPIN2_CHOOSE1_VALUE,
      seriesLabel: mock.SERIES_LABEL,
      boxesLabel: mock.BOXES_LABEL,
      countLabel: mock.COUNT_LABEL,
      checklistRows,
      isMock: true,
    }
  }

  const seriesLabel = series?.name ?? NO_VALUE
  const boxesLabel = bpbAmount != null ? `${bpbAmount} BOXES` : NO_VALUE
  const countLabel =
    series != null ? `${series.unsold_count} OF ${series.total_cards - series.used_cards}` : NO_VALUE

  return {
    placedRoster,
    stashOrPassValue: sopPrice != null ? `$${sopPrice}` : NO_VALUE,
    spin2ChooseValue: p2Price != null ? `$${p2Price}` : NO_VALUE,
    seriesLabel,
    boxesLabel,
    countLabel,
    checklistRows,
    isMock: false,
  }
}

interface ChecklistPage {
  /** Up to LAYOUT.checklist.rows rows — already tier-bucketed, collapsed (no gaps for empty tiers), and circularly windowed. */
  rows: ChecklistRowState[]
}

/**
 * Row = tier bucket: row 1 is everything >= bestThreshold, row 2 is
 * everything >= goodThreshold (and below best), row 3 is the rest. Sorted
 * price-desc within each bucket. Uses the SAME thresholds the board prices
 * against (resolveThresholds(priceRanges), or the mock equivalent) — one
 * tier system across the overlay, not a second invented cutoff.
 */
function bucketByTier(
  items: readonly PricedChecklistItem[],
  thresholds: TierThresholds,
  mode: ChecklistMode,
): PricedChecklistItem[][] {
  const best: PricedChecklistItem[] = []
  const good: PricedChecklistItem[] = []
  const rest: PricedChecklistItem[] = []

  for (const item of items) {
    if (item.price >= thresholds.bestThreshold) best.push(item)
    else if (item.price >= thresholds.goodThreshold) good.push(item)
    else rest.push(item)
  }

  const byPriceDesc = (a: PricedChecklistItem, b: PricedChecklistItem) => b.price - a.price
  // Mode 0 shows the whole series as ONE packed board — no tier rows at all.
  if (mode === 0) return [[...items].sort(byPriceDesc)]
  // Mode 6 has only two rows: best keeps its own row, good and rest pool
  // into the second. good items all sit above goodThreshold and rest all
  // below it, so concatenating the two sorted buckets stays price-desc.
  if (mode === 6) return [best.sort(byPriceDesc), [...good.sort(byPriceDesc), ...rest.sort(byPriceDesc)]]
  return [best.sort(byPriceDesc), good.sort(byPriceDesc), rest.sort(byPriceDesc)]
}

/** Tier for a single card, from its own price against the shared thresholds. */
function cardTier(price: number, thresholds: TierThresholds): 'gold' | 'silver' | 'bronze' | 'grey' {
  if (price >= thresholds.bestThreshold) return 'gold'
  if (price >= thresholds.goodThreshold) return 'silver'
  if (price >= thresholds.midThreshold) return 'bronze'
  return 'grey'
}

function toCardView(item: PricedChecklistItem, thresholds: TierThresholds) {
  return {
    id: item.id,
    price: `$${item.price}`,
    url: item.url,
    thumbnail: item.thumbnail,
    rotation: item.rotation ?? 0,
    tier: cardTier(item.price, thresholds),
  }
}

/**
 * Tier-buckets items into up to LAYOUT.checklist.rows rows (see bucketByTier)
 * and COLLAPSES empty buckets so rows stack from the top with no gaps (e.g.
 * no best-tier items -> the good-tier bucket renders at visual row 0, where
 * row 1 would have been — the panel's own box/minHeight never changes, only
 * which row Y-position each bucket lands on).
 *
 * Rows scroll CONTINUOUSLY now (a slow marquee drift, not a snap step) —
 * the actual motion lives in page.tsx's Checklist component, driven by
 * requestAnimationFrame off the `intervalMs`/`scrolls` metadata attached
 * here: `intervalMs` is the time to drift one card span (and the arrow-nudge
 * unit), and `scrolls` is false when the bucket already fits its visible
 * window (CHECKLIST_MODE_WINDOW[mode]) — such a row sits still.
 *
 * Mirrors src/app/channel/[id]/photos/page.tsx's reference behaviour for
 * `is_sold`/`is_deleted` (for the live path, before bucketing): those photos
 * are filtered out entirely, not shown dimmed — "skip", not "dim".
 */
/**
 * A NON-EMPTY row that can't fill its visible window borrows the most
 * expensive cards from the tiers below it (good first, then rest), removing
 * them from their own row — e.g. 2 best-tier cards in a 4-wide window pull
 * the top 2 good-tier cards up to sit beside them. Lower queues are already
 * price-desc, so taking from the front IS "most expensive", and the borrow
 * cascades (row 2 refills from rest after its own donations). Empty buckets
 * are NOT topped up — they collapse away entirely, per the row-collapse
 * rule.
 */
function fillShortRows(
  buckets: readonly (readonly PricedChecklistItem[])[],
  windowSize: number,
): PricedChecklistItem[][] {
  const queues = buckets.map((b) => [...b])
  for (let i = 0; i < queues.length; i++) {
    if (queues[i].length === 0 || queues[i].length >= windowSize) continue
    for (let j = i + 1; j < queues.length && queues[i].length < windowSize; j++) {
      queues[i].push(...queues[j].splice(0, windowSize - queues[i].length))
    }
  }
  return queues.filter((q) => q.length > 0)
}

function useChecklistPage(
  items: readonly PricedChecklistItem[],
  thresholds: TierThresholds,
  mode: ChecklistMode,
): ChecklistPage {
  const windowSize = CHECKLIST_MODE_WINDOW[mode]
  const buckets = useMemo(() => bucketByTier(items, thresholds, mode), [items, thresholds, mode])
  const filledRows = useMemo(() => fillShortRows(buckets, windowSize), [buckets, windowSize])
  const intervals = CHECKLIST_MODE_INTERVALS_MS[mode]

  const rows: ChecklistRowState[] = filledRows.map((bucket, i) => ({
    cards: bucket.map((item) => toCardView(item, thresholds)),
    intervalMs: intervals[i] ?? intervals[intervals.length - 1] ?? 0,
    scrolls: bucket.length > windowSize,
  }))

  return { rows }
}
