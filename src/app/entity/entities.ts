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
}

export interface WNStream {
    id: number
    created_at: number
    name: string
    is_ended: boolean
}

export interface StreamResponse extends WNStream {}

export interface GetStreamsResponse {
    streams: StreamResponse[]
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

export interface Demo {
    id: number
    highlight_username: string
    break_id: number
}

export interface WNChannel {
    id: number
    name: string
    demo_id: number|null
    default_high_bid_floor: number
    default_high_bid_team: string
}

export interface GetStreamUsernamesResponse {
    usernames: string[]
}

export const NoCustomer = '?'
export const NoDemoBreak = 0
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

export interface PackageUsersData {
    data: Map<string, PackageUserData>
}

export interface PackageUserData {
    totalQuantity: number
    auctionQuantity: number
    giveawayQuantity: number
    giveawayTypes: Map<number, number>
}