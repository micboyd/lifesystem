export interface UserSettings {
    wakeTime?: string
    bedTime?: string
    workStart?: string
    workEnd?: string
    showTotals?: boolean
    workDays?: number[]
}

export interface TotalRow {
    _id: string
    name: string
    order: number
    granularity: 'daily' | 'weekly'
    createdAt: string
    updatedAt: string
}

export interface TotalValue {
    _id: string
    row: string
    date: string
    value: number
    createdAt: string
    updatedAt: string
}

export interface User {
    _id: string
    name: string
    email: string
    settings?: UserSettings
    createdAt: string
}

export interface ApiResponse<T> {
    data: T
    message: string
}

export const PARTS = ['morning', 'afternoon', 'evening', 'na'] as const
export type Part = (typeof PARTS)[number]

export const EVENT_TYPES = ['trip', 'social', 'general'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
    trip: 'Trip',
    social: 'Social',
    general: 'General Event',
}

/** Tailwind classes for each event type. Keys are bare classes — no dynamic construction. */
export const EVENT_TYPE_COLORS: Record<
    EventType,
    { bg: string; hover: string; text: string; light: string }
> = {
    trip: {
        bg: 'bg-blue-100',
        hover: 'hover:bg-blue-200',
        text: 'text-blue-700',
        light: 'bg-blue-50',
    },
    social: {
        bg: 'bg-amber-100',
        hover: 'hover:bg-amber-200',
        text: 'text-amber-700',
        light: 'bg-amber-50',
    },
    general: {
        bg: 'bg-neutral-100',
        hover: 'hover:bg-neutral-200',
        text: 'text-neutral-600',
        light: 'bg-neutral-50',
    },
}

/** Default pastel colour for N/A (Other) events. */
export const NA_EVENT_COLORS = {
    bg: 'bg-purple-100',
    hover: 'hover:bg-purple-200',
    text: 'text-purple-700',
    light: 'bg-purple-50',
}

export const RECURRENCE_FREQUENCIES = [
    'daily',
    'weekly',
    'biweekly',
    'monthly',
    'yearly',
    'lastWeekday',
] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Bi-weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
    lastWeekday: 'Last working day',
}

export interface Recurrence {
    frequency: RecurrenceFrequency
    endsOn?: string
}

export interface Event {
    _id: string
    title: string
    notes?: string
    location?: string
    eventType: EventType
    allDay: boolean
    /** Optional informational time, "HH:MM". */
    time?: string
    startDate: string
    startPart: Part
    endDate: string
    endPart: Part
    recurrence?: Recurrence
    /** YYYY-MM-DD occurrence dates removed from a recurring series. */
    exdates?: string[]
    /** Money set aside for this event — entered manually or resolved from a linked finance row. */
    budget?: number
    /** Optional linked finance row id; when set, budget is pulled from that row for the event's month. */
    budgetRow?: string
    /** Name of the linked finance row, attached by the server for display. */
    budgetRowName?: string
    createdAt: string
    updatedAt: string
}

export const DAY_STATUSES = [
    'annual_leave_pending',
    'annual_leave_approved',
    'bank_holiday',
] as const
export type DayStatusType = (typeof DAY_STATUSES)[number]

export interface DayStatusOption {
    value: DayStatusType
    label: string
    bg: string
    text: string
    hover: string
}

export const DAY_STATUS_OPTIONS: DayStatusOption[] = [
    {
        value: 'annual_leave_pending',
        label: 'Annual Leave (Pending)',
        bg: 'bg-orange-100',
        text: 'text-orange-700',
        hover: 'hover:bg-orange-200',
    },
    {
        value: 'annual_leave_approved',
        label: 'Annual Leave (Approved)',
        bg: 'bg-green-100',
        text: 'text-green-700',
        hover: 'hover:bg-green-200',
    },
    {
        value: 'bank_holiday',
        label: 'Bank Holiday',
        bg: 'bg-green-100',
        text: 'text-green-700',
        hover: 'hover:bg-green-200',
    },
]

export interface DayStatus {
    _id: string
    startDate: string
    endDate: string
    status: DayStatusType
}

export const TIMEBOX_CATEGORIES = ['work', 'personal', 'health', 'learning', 'social'] as const
export type TimeboxCategory = (typeof TIMEBOX_CATEGORIES)[number]

export const TIMEBOX_CATEGORY_LABELS: Record<TimeboxCategory, string> = {
    work: 'Work',
    personal: 'Personal',
    health: 'Health',
    learning: 'Learning',
    social: 'Social',
}

export const TIMEBOX_CATEGORY_COLORS: Record<
    TimeboxCategory,
    { bg: string; border: string; text: string; sub: string }
> = {
    work: {
        bg: 'bg-blue-100',
        border: 'border-blue-200',
        text: 'text-blue-900',
        sub: 'text-blue-500',
    },
    personal: {
        bg: 'bg-violet-100',
        border: 'border-violet-200',
        text: 'text-violet-900',
        sub: 'text-violet-500',
    },
    health: {
        bg: 'bg-emerald-100',
        border: 'border-emerald-200',
        text: 'text-emerald-900',
        sub: 'text-emerald-500',
    },
    learning: {
        bg: 'bg-amber-100',
        border: 'border-amber-200',
        text: 'text-amber-900',
        sub: 'text-amber-500',
    },
    social: {
        bg: 'bg-pink-100',
        border: 'border-pink-200',
        text: 'text-pink-900',
        sub: 'text-pink-500',
    },
}

/** Used for blocks with no category set. */
export const TIMEBOX_DEFAULT_COLORS = {
    bg: 'bg-neutral-100',
    border: 'border-neutral-200',
    text: 'text-neutral-700',
    sub: 'text-neutral-400',
}

export type RecurrenceFreq = 'daily' | 'weekly' | 'weekdays' | 'custom'

export interface Timebox {
    _id: string
    date: string
    title: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[] }
    isRecurringInstance?: boolean
    createdAt: string
    updatedAt: string
}

export interface Task {
    _id: string
    date: string
    title: string
    completed: boolean
    order: number
    createdAt: string
    updatedAt: string
}

export interface HabitDef {
    _id: string
    name: string
    description?: string
    order: number
    active: boolean
    createdAt: string
    updatedAt: string
}

export interface HabitLog {
    _id: string
    habit: string
    date: string
    completed: boolean
}

export interface FinanceGroup {
    _id: string
    name: string
    type: 'income' | 'expense' | 'savings'
    order: number
    currentBalance?: number
    annualInterestRate?: number
    startMonth?: string | null // YYYY-MM inclusive; null/absent = active since forever
    endMonth?: string | null // YYYY-MM inclusive; null/absent = open-ended
    skipMonths?: string[] // months explicitly hidden ("this month only" deletes)
    createdAt: string
    updatedAt: string
}

export interface FinanceRow {
    _id: string
    group: string
    name: string
    recurringAmount?: number
    order: number
    recurring?: boolean
    month?: string // YYYY-MM — set for non-recurring rows, absent for recurring
    startMonth?: string | null // YYYY-MM inclusive; null/absent = active since forever
    endMonth?: string | null // YYYY-MM inclusive; null/absent = open-ended
    skipMonths?: string[] // months explicitly hidden ("this month only" deletes)
    budgeted?: boolean
    budgetType?: 'daily' | null
    createdAt: string
    updatedAt: string
}

export interface FinanceEntry {
    _id: string
    row: string
    month: string
    amount: number
}

export interface BudgetSpend {
    _id: string
    row: string
    date: string
    amount: number
    note?: string
}

export interface BudgetExclusion {
    _id: string
    date: string
}

export interface FinanceSubItem {
    _id: string
    row: string
    month?: string // absent for non-recurring rows
    name: string
    amount: number
    order: number
    createdAt: string
    updatedAt: string
}

export interface LoginCredentials {
    email: string
    password: string
}

export interface LoginResponseData {
    token: string
}
