export interface DayDate {
    year: number
    month: number
    day: number
}

export interface Day {
    date: DayDate
    breaks: string[]
}

export interface Event {
    id: string

    customer: string
    price: number
    team: string
    is_giveaway: boolean
    note: string
    quantity: number
}

export interface Break {
    events: Event[]
    name: string
    start_date: number
    end_date: number
}

export type SelectedBreak = string