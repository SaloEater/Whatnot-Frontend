/**
 * Shared shapes for the composite roster/checklist, split out so roster.ts
 * (stage-1 mock data) and useCompositeData.ts (stage-2 live data) can both
 * build the same board through composeRoster.ts without importing each other.
 */
import type { PlacedSlot, Slot } from './board'

export interface RosterSlot extends Slot {
  /** Display name. Team name (matches /images/composite_teams/<label>.png) or special spot name. */
  label: string
  /** Team tiles only. Full pricing.ts display string; compacted at render time (see BoardTile). */
  displayPrice?: string
}

export type PlacedRosterSlot = PlacedSlot & { label: string; displayPrice?: string }

/** One checklist card as rendered — mock cards have no url/rotation (plain placeholder box). */
export interface ChecklistCardView {
  id: number
  price: string
  url?: string
  rotation?: number
}

/**
 * A checklist card BEFORE tier-bucketing/formatting — the common shape both
 * roster.ts's mock data and useCompositeData's live Photo[] are mapped into
 * so useChecklistPage's bucketing logic runs identically for both.
 */
export interface PricedChecklistItem {
  id: number
  price: number
  url?: string
  rotation?: number
}

/**
 * One visual checklist row, as returned by useChecklistPage: its current
 * (already circularly-windowed) cards, and a bound callback that advances
 * THIS row's own window and restarts THIS row's own auto-advance timer —
 * paging is per-row, there is no shared/global page index anymore.
 */
export interface ChecklistRowState {
  /** The row's FULL tier bucket, price-desc — the component scrolls it continuously. */
  cards: ChecklistCardView[]
  /** Time for the row to drift one card span; also the arrow-nudge unit. */
  intervalMs: number
  /** False when the bucket fits the visible window — the row then sits still. */
  scrolls: boolean
}

/**
 * Checklist density: how many cards the preview shows at once.
 * 6 = 2 rows x 4 cols with larger cards (default), 12 = 3 rows x 4 cols.
 * The value doubles as the button label in the panel's corner toggle.
 */
export type ChecklistMode = 6 | 12
