/**
 * Data hook for the compact board (`/obs/composite/compact/[id]`) — one cell
 * per eligible break event, teams first then specials, each group
 * alphabetical, carrying just enough to render a logo + customer name + tier
 * line.
 *
 * Shares `useCompositeSources` (channel/stream/break/events + pricing) with
 * the main overlay's `useCompositeData`, and mirrors that hook's roster memo
 * EXACTLY (eligibility filter, stable input order, team/special split) so
 * the two pages can never disagree about what belongs on the board or what
 * tier it renders in — see composeRoster.ts / board.ts for the shared
 * pricing-rank pipeline this borrows as a tier oracle only.
 */
import { useMemo } from 'react'
import { IsTeam } from '@/app/common/teams'
import { sortByTeamName } from '@/app/common/event_filter'
import { useCompositeSources } from '../useCompositeSources'
import { DEFAULT_PRICE, resolveThresholds, type TierThresholds } from '../pricing'
import { composeRoster, type SpecialRef, type TeamRef } from '../composeRoster'
import type { Tier } from '../board'

export interface CompactCell {
  /** Event id. */
  id: number
  /** event.team — team name or special-spot name. */
  label: string
  /** !IsTeam(event.team). */
  special: boolean
  /** '' when unsold. */
  customer: string
  /** customer !== ''. */
  sold: boolean
  /** SAME tier as the main board (composeRoster's pricing-rank pipeline). */
  tier: Tier
}

export interface CompactData {
  cells: CompactCell[]
}

export function useCompactData(channelId: number): CompactData {
  const { breakObject, events, series, priceRanges, teamPrices } = useCompositeSources(channelId)

  const thresholds: TierThresholds = useMemo(() => resolveThresholds(priceRanges), [priceRanges])

  const cells: CompactCell[] = useMemo(() => {
    // No mock fallback here — never fake data on a live overlay (same rule
    // useCompositeData's placedRoster memo follows).
    if (!breakObject) return []

    // STABLE INPUT ORDER — same fix as useCompositeData.ts's roster memo:
    // pinning the input to the break's own slot ordering (event.index, id as
    // tie-break) makes this a pure function of the break's contents, so a
    // poll that returns the same events in a different order never reorders
    // the grid.
    const eligible = events
      .filter((e) => !e.is_giveaway && !e.note)
      .sort((a, b) => a.index - b.index || a.id - b.id)

    const teamRefs: TeamRef[] = eligible
      .filter((e) => IsTeam(e.team))
      .map((e) => ({ id: e.id, team: e.team, sold: e.customer !== '' }))
    const specialRefs: SpecialRef[] = eligible
      .filter((e) => !IsTeam(e.team))
      .map((e) => ({ id: e.id, label: e.team, price: e.price, sold: e.customer !== '' }))

    // Same fallback useCompositeData.ts / /obs/prices/[id] use — an empty
    // default_price falls back to pricing.ts's DEFAULT_PRICE constant.
    const defaultPrice = series?.default_price || DEFAULT_PRICE

    // composeRoster is used ONLY as the tier oracle: this page sorts its own
    // display order (not the main board's price-ranked route), so
    // the placed roster's cells/route are discarded — only each slot's
    // derived tier survives, keyed by event id. composeRoster has a capacity
    // clamp (~38/40 cells); an event it drops simply has no entry here and
    // falls back to 'grey' below — the compact board has no capacity limit
    // of its own, it shows every eligible event.
    const placed = composeRoster(specialRefs, teamRefs, teamPrices, defaultPrice, thresholds)
    const tierById = new Map<number, Tier>(placed.map((s) => [s.id, s.tier]))

    // Display order: the shared sortByTeamName helper (event_filter.ts) —
    // all TEAM events first, then the special (non-team) events, each group
    // alphabetical. It sorts IN PLACE, so it gets a copy: `eligible` must
    // stay index-ordered because the refs fed to composeRoster above are
    // built from it (the stable-input-order fix). Duplicate labels keep
    // their index order between polls — Array.sort is stable, so equal
    // teams fall back to the copy's (index-sorted) order.
    return sortByTeamName([...eligible]).map((e) => ({
      id: e.id,
      label: e.team,
      special: !IsTeam(e.team),
      customer: e.customer,
      sold: e.customer !== '',
      tier: tierById.get(e.id) ?? 'grey',
    }))
  }, [breakObject, events, series?.default_price, teamPrices, thresholds])

  return { cells }
}
