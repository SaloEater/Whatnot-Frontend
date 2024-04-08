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
    id: string
    index: number
    break_id: number

    customer: string
    price: number
    team: string
    is_giveaway: boolean
    note: string
    quantity: number
}

export interface Break {
    id: number
    day_id: number
    name: string
    start_date: string
    end_date: string
    is_deleted: boolean
}

export interface GetDaysDay {
    id: number
    timestamp: number
}

export interface GetDaysResponse {
    days: GetDaysDay[]
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