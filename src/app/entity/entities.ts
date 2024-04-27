export interface DayData {
    year: number
    month: number
    day: number
}

export interface Day {
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
}

export interface PackageEvent extends Event {
    is_high_bid: boolean
}

export interface Break {
    id: number
    day_id: number
    name: string
    start_date: string
    end_date: string
    is_deleted: boolean
    high_bid_team: string
}

export interface GetStreamsStream {
    id: number
    created_at: number
    name: string
}

export interface GetStreamsResponse {
    streams: GetStreamsStream[]
}

export interface GetBreaksByDayResponse {
    breaks: Break[]
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

export interface GetStreamUsernamesResponse {
    usernames: string[]
}

export const NoCustomer = '?'
export const NoDemoBreak = 0
export const GiveawayTypeNone = 0
export const GiveawayTypePack = 1
export const GiveawayTypeSlab = 2