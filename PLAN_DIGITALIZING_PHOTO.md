 Frontend Implementation Plan — Card Digitalization (DIGITALIZING_PHOTO_1)

Spec sources: `No-Mod-Livestream/DIGITALIZING_PHOTO_1.md`, `SERIES_AND_IMAGE_FLOW.md`,
`CARDS_BOARD_PAGE.md`, `FEATURE_REQUEST.md`.
Backend contract: `WhatNot-Webhook-Holder/PLAN_DIGITALIZING_PHOTO.md`.

---

## Summary

Four areas of change:

1. **New entities** — TypeScript interfaces for `Series`, `Photo`, `SeriesTeamPrice`; update `WNBreak` with `series_id`.
2. **New API wiring** — add all series/photo endpoints to `backend.ts`.
3. **New pages** — Series list, Series detail (photo management), Series team prices, Cards Board Page.
4. **Existing page changes** — break page gets a Series selector; stream page gets a bulk Series selector + board link.

---

## Step 1 — New Entity Interfaces (`src/app/entity/entities.ts`)

```ts
export interface Series {
    id: number
    name: string
    status: 'open' | 'closed'
    created_at: string
    is_deleted: boolean
}

export interface Photo {
    id: number
    series_id: number
    name: string
    team: string
    url: string
    is_sold: boolean
    created_at: string
    is_deleted: boolean
}

export interface SeriesTeamPrice {
    id: number
    series_id: number
    team: string
    price: number
}
```

Update `WNBreak`:

```ts
export interface WNBreak {
    // ... existing fields ...
    series_id?: number | null   // add this field
}
```

---

## Step 2 — API Wiring (`src/app/lib/backend.ts`)

### 2a — New endpoint strings (add to `getEndpoints()`)

```ts
// Series
series_list:             "/api/series/list",           // GET
series_get:              "/api/series/get",            // POST  {id}
series_update:           "/api/series/update",         // POST  {id, name}
series_close:            "/api/series/close",          // POST  {id}
series_delete:           "/api/series/delete",         // POST  {id}

// Photos
photo_list:              "/api/photo/list",            // POST  {series_id}
photo_delete:            "/api/photo/delete",          // POST  {id}
photo_mark_sold:         "/api/photo/mark_sold",       // POST  {id, sold}
photo_board:             "/api/photo/board",           // POST  {channel_id}

// Break–Series link
break_set_series:        "/api/break/set_series",      // POST  {break_id, series_id}

// Series team prices
series_team_prices:      "/api/series/team_prices",    // POST  {series_id}
series_team_price_set:   "/api/series/team_price/set", // POST  {series_id, team, price}
```

---

## Step 3 — Series List Page (`/series`)

**File:** `src/app/series/page.tsx`

- On mount: `get(getEndpoints().series_list)` → `Series[]`
- Render a Bootstrap list-group; each row: name, status badge (`open` = warning, `closed` = success), formatted `created_at`, "Open" button → `/series/[id]`.
- No delete from this page (delete lives on the detail page).

---

## Step 4 — Series Detail Page (`/series/[id]`)

**Files:**
- `src/app/series/[id]/page.tsx`
- `src/app/series/[id]/photoGridComponent.tsx`

### Header

- Editable inline series name (`series_update`).
- Status badge.
- "Close Series" button → `series_close` → updates status badge.
- "Delete Series" button (only shown when no photos uploaded) → `series_delete` → redirect to `/series`.
- "Team Prices →" link to `/series/[id]/team-prices`.

### Photo grid (`photoGridComponent.tsx`)

- On mount: `post(getEndpoints().photo_list, { series_id })` → `Photo[]`.
- Renders thumbnails in a responsive Bootstrap grid.
- Each thumbnail: image preview, optional team badge below, delete icon (calls `photo_delete`).

---

## Step 5 — Series Team Prices Page (`/series/[id]/team-prices`)

**File:** `src/app/series/[id]/team-prices/page.tsx`

- On mount: `post(getEndpoints().series_team_prices, { series_id })` → `SeriesTeamPrice[]`.
- Render a table row per team (use the existing `Teams` constant from `src/app/common/teams.ts` as the source of truth for which teams exist).
- Each row: team name + price `<input type="number" min="0" step="1">` + "Save" button.
- "Save" calls `post(getEndpoints().series_team_price_set, { series_id, team, price })`.
- Pre-fill inputs from the fetched prices; teams with no saved price default to 0.
- When operator presses on an price input field, under it there are several buttons with "last used" prices on them that automatically update the input and turn focus to the next field 

---

## Step 6 — Break Page Modifications (`/break/[id]`)

**File:** `src/app/break/[id]/breakComponent.tsx` (and/or `page.tsx`)

Add a **Series selector** to the break detail UI:

- Fetch series list on mount (`series_list`).
- Render a `<select>` pre-filled with `breakObject.series_id` if set.
- On change: `post(getEndpoints().break_set_series, { break_id, series_id })`.
- Show the currently linked series name + status badge next to the selector.
- Only closed series should be selectable (filter client-side: `series.status === 'closed'`).

---

## Step 7 — Stream Page Modifications (`/stream/[id]`)

**File:** `src/app/stream/[id]/page.tsx`

Two additions to the stream sidebar:

1. **"Set Series for all Breaks" control:**
   - Dropdown of closed series.
   - On select: iterate `breaks` state, call `break_set_series` for each break sequentially.
   - Toast on completion.

2. **"Cards Board" link:**
   - Needs the channel ID for the stream. Fetch it via the existing `channel_by_stream` endpoint or pass it through the navigation state.
   - Button that opens `/channel/[channelId]/photos` in a new tab.

---

## Step 8 — Cards Board Page (`/channel/[id]/photos`)

**Files:**
- `src/app/channel/[id]/photos/page.tsx`
- `src/app/channel/[id]/photos/boardComponent.tsx`
- `src/app/channel/[id]/photos/boardComponent.css`
- `src/app/channel/[id]/photos/usePhotoBoard.ts`

### Route

```
/channel/:id/photos
/channel/:id/photos?controls=true
```

`id` is the channel's numeric id (matching the existing `/channel/[id]` route convention).

### Data hook (`usePhotoBoard.ts`)

- Fetches `POST /api/photo/board` with `{ channel_id: id }` → `Photo[]`.
- Polls every 5 seconds (clean interval on unmount).
- Returns `{ photos, refresh, markSold }`.
- `markSold(photoId, sold)`: optimistically updates local state, then calls `photo_mark_sold`; on error, reverts.

### Clean OBS display (no `?controls=true`)

Shows only unsold photos. The array is shuffled once on initial load and on every change to the unsold set (card removed = reshuffle). No reshuffle when only zoom changes.

**Layout — filling the rectangle:**
- Full-viewport `<div>` with `overflow: hidden`.
- Cards arranged in rows; all cards in a row share the same height.
- Row packing: for each row, greedily assign cards until the next card would overflow; scale all cards in the row so their total width equals `window.innerWidth`.
- Last row: if fewer cards than needed to fill naturally, stretch them proportionally to fill the width.
- Recalculate on load, on set change, and on `window.resize`.
- Each card rendered as `<img>` with `object-fit: cover; width: 100%; height: 100%`.

**Click-to-zoom:**
- Managed with a `zoomedId` state (null or photo id).
- Clicking a card sets `zoomedId`; clicking the same card or outside clears it.
- Zoomed card: `transform: scale(1.75)`, `z-index: 10`, `box-shadow: 0 8px 24px rgba(0,0,0,0.5)`, `transition: transform 150ms ease-out`.
- `transform-origin: center center` by default; shift toward nearest edge if scaling from center would clip against viewport boundary.
- Grid does not reflow; zoom is a pure CSS overlay.

### Operator mode (`?controls=true`)

All photos fetched (both unsold and sold). Rendered in one grid — unsold first, then sold. Sold photos get a visual distinction (e.g., `opacity: 0.4` + greyed overlay).

**Hover — full-screen preview:**
- On `mouseenter`: render a `position: fixed; inset: 0` overlay, `background: rgba(0,0,0,0.85)`, containing `<img>` with `max-width: 90vw; max-height: 90vh; object-fit: contain`.
- On `mouseleave`: remove overlay.

**Click — toggle sold:**
- Call `markSold(photo.id, !photo.is_sold)` from the hook.
- Unsold → sold: card moves to sold section.
- Sold → unsold: card returns to unsold section.
- On error: toast or inline error message; card reverts.

### No auth required for board page

The board URL is treated as a secret share link (per spec). The `post` helper's Basic Auth header is still sent (existing behaviour), but no login redirect is enforced on 401 for this page.

---

## Step 9 — OBS Teams Page — Price Variant (FEATURE_REQUEST #3)

> "OBS Teams board should have a variation where team has no logo and has a (dynamic/static) price number under it"

**File additions:**
- `src/app/obs/teams/[id]/page.tsx` (existing) — add a `?mode=prices` query param branch
- Or a new route: `src/app/obs/prices/[id]/page.tsx`

Recommendation: new dedicated route `/obs/prices/[id]` to keep the existing teams page clean.

Behaviour:
- Fetches active break's events to get team list.
- Fetches `series_team_prices` for the linked series of the active break.
- Renders each team as a text label (no logo image) with the price below it.
- Price is dynamic: polls for series price updates or re-fetches when break changes.
- Styled for OBS overlay: transparent background, large readable font.

---

## Implementation Order

| Step | What | Depends on |
|------|------|-----------|
| 1 | Entity interfaces | — |
| 2 | `backend.ts` endpoints + `postMultipart` | Step 1 |
| 3 | `/series` list page | Step 2 |
| 4 | `/series/[id]` detail page | Step 2, 3 |
| 5 | `/series/[id]/team-prices` | Step 2, 4 |
| 6 | Break page — Series selector | Step 2 |
| 7 | Stream page — bulk Series + board link | Step 2, 6 |
| 8 | `/channel/[id]/photos` Cards Board | Step 2 |
| 9 | `/obs/prices/[id]` Teams Price board | Step 2, 5 |

Backend must be deployed through at least Step 7 (API handlers) before FE steps 3–9 can be tested against a real backend.

---

## Open Questions / Flags

| # | Question | Impact |
|---|----------|--------|
| 1 | Cards Board polling interval (currently 5 s) — is that fast enough or too aggressive? | Battery / server load |
| 2 | Should the Cards Board page require auth, or is the URL treated as a public share? | No login redirect currently planned |
| 3 | Channel ID for board link from stream page — confirm which endpoint resolves stream → channel | Needed for Step 8 sidebar button |
| 4 | `/obs/prices/[id]` — id is stream id or channel id? | Routing convention |
