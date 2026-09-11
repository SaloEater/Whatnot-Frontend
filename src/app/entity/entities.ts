export interface DayData {
    year: number
    month: number
    day: number
}

export interface Stream {
    date: DayData
    breaks: string[]
}

export interface Event {
    id: number
    index: number
    break_id: number

    customer: string
    price: number
    team: string
    is_giveaway: boolean
    note: string
    quantity: number
    giveaway_type: number
}

export interface EventData {
    customer: string
    price: number
    id: number
}

export interface PackageEvent extends Event {
    is_high_bid: boolean
}

export interface WNBreak {
    id: number
    day_id: number
    name: string
    start_date: string
    end_date: string
    is_deleted: boolean
    high_bid_team: string
    giveaway_team: string
    high_bid_floor: number
    series_id?: number | null
}

// `series.kind` (series-price-ranges-plan.md §1.1): `cards` is today's photo series (default —
// every row created before this existed is `cards`); `price_ranges` is the new show format whose
// contents are described by `SeriesPriceRange` rows instead of photos. Set at creation, never
// changes.
export type SeriesKind = 'cards' | 'price_ranges'

export interface Series {
    id: number
    name: string
    status: 'open' | 'closed'
    created_at: string
    is_deleted: boolean
    total_cards: number
    used_cards: number
    default_price: string
    kind: SeriesKind
}

// One row of a `price_ranges` series' contents (series-price-ranges-plan.md §1.2): "how many cards
// in this price band". Ordered by `price_from` ascending — there is no manual sort order, a range's
// position IS its price. `price_to: null` means open-ended ("$500+").
//
// Name collision warning: `PriceRange` (below) already exists and is the cobra board's per-channel
// tier threshold (`widget_board_price_ranges`) — unrelated to this. Do not conflate the two.
export interface SeriesPriceRange {
    id: number
    series_id: number
    price_from: number
    price_to: number | null
    count: number
}

export interface SeriesWithCount extends Series {
    unsold_count: number
    sold_count: number
}

export interface SeriesListPage {
    items: Series[]
    total: number
}

export interface Photo {
    id: number
    series_id: number
    name: string
    team: string
    url: string
    thumbnail: string
    price: number
    is_sold: boolean
    created_at: string
    is_deleted: boolean
    rotation: number
}

export interface SeriesTeamTotal {
    team: string
    total_price: number
    price_left: number
}

export interface WNStream {
    id: number
    created_at: number
    name: string
    is_ended: boolean
    active_break_id: number | null
}

export interface StreamResponse extends WNStream {}

export interface GetStreamsResponse {
    streams: StreamResponse[]
    total: number
}

export interface GetChannelsChannel extends WNChannel {
}

export interface GetChannelsResponse {
    channels: GetChannelsChannel[]
}

export interface GetBreaksByDayResponse {
    breaks: WNBreak[]
}

export type SelectedBreak = string

export interface AddBreakResponse {
    id: number
}

export interface GetEventsByBreakResponse {
    events: Event[]
}

export interface WNChannel {
    id: number
    name: string
    active_stream_id: number | null
    default_high_bid_floor: number
    default_high_bid_team: string
}

export interface GetStreamUsernamesResponse {
    usernames: string[]
}

export const NoCustomer = '?'
export const GiveawayTypeNone = 0
export const GiveawayTypePack = 1
export const GiveawayTypeSlab = 2

//Obs Manage
export interface TeamLogos {
    sceneName: string
    logos: TeamLogo[]
}
export interface TeamLogo {
    team: string
    obsItem: ObsItem
}
export interface TeamAnimation {
    team: string
    obsItem: ObsItem
}
export interface TeamAnimations {
    sceneName: string
    animations: TeamAnimation[]
}
export interface SimpleAnimation {
    obsItem: ObsItem;
    id: number
}
export interface SimpleAnimations {
    sceneName: string
    animations: SimpleAnimation[]
}
export const EmptyID = '0'
export const EmptyName = ''

export interface ObsItem {
    name: string
    uuid: string
}

export interface RawObsItem extends ObsItem{
    inputKind: string
}

export const EmptyObsItem: ObsItem = {name: EmptyName, uuid: EmptyID}

export interface ObsScene extends ObsItem{
}

export const ReportUserFailed = 'failed'

export interface ReportUser {
    buyer: string
    product_name: string
    product_quantity: string
    cancelled_or_failed: string
}

export interface PriceRange {
    id: number
    channel_id: number
    tier_id: string
    price_from: number
}

export interface WidgetPreset {
    id: number
    channel_id: number
    name: string
    value: string
}

export interface PackageUsersData {
    data: Map<string, PackageUserData>
}

export interface PackageUserData {
    totalQuantity: number
    auctionQuantity: number
    giveawayQuantity: number
    giveawayTypes: Map<number, number>
}

// OBS layout data spine (src/app/obs/layout/useLayoutData.tsx) — generic value shapes for the
// circle widgets and the cards board settings, shared with their existing per-widget pages.
export interface CircleWidgetValue {
    price?: string | number
    amount?: string | number
    name?: string | number
    [key: string]: string | number | undefined
}

export interface CountSettings {
    show_percentage: boolean
}

export interface CardsBoardSettings {
    orientation: string
    show_horizontal_row: boolean
    show_only_available_teams: boolean
}

// A row recorded by `/api/layout/image/upload` for every image an operator uploads through the
// `imageBox` element (obs-image-box-plan.md §6) — lets the controls page offer a Gallery of
// previously-uploaded images instead of re-uploading. `width`/`height` are the image's pixel
// dimensions (0 if unknown), `size_bytes` the file size.
export interface LayoutImage {
    id: number
    channel_id: number
    name: string
    url: string
    width: number
    height: number
    size_bytes: number
    created_at: string
}
