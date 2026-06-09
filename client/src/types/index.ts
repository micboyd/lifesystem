export interface UserSettings {
    wakeTime?: string
    bedTime?: string
    workStart?: string
    workEnd?: string
    showTotals?: boolean
}

export interface TotalRow {
    _id: string
    name: string
    order: number
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
export const EVENT_TYPE_COLORS: Record<EventType, { bg: string; hover: string; text: string; light: string }> = {
    trip: { bg: 'bg-blue-100', hover: 'hover:bg-blue-200', text: 'text-blue-700', light: 'bg-blue-50' },
    social: { bg: 'bg-amber-100', hover: 'hover:bg-amber-200', text: 'text-amber-700', light: 'bg-amber-50' },
    general: { bg: 'bg-neutral-100', hover: 'hover:bg-neutral-200', text: 'text-neutral-600', light: 'bg-neutral-50' },
}

/** Default pastel colour for N/A (Other) events. */
export const NA_EVENT_COLORS = {
    bg: 'bg-purple-100',
    hover: 'hover:bg-purple-200',
    text: 'text-purple-700',
    light: 'bg-purple-50',
}

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

export const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Bi-weekly',
    monthly: 'Monthly',
    yearly: 'Yearly',
}

export interface Recurrence {
    frequency: RecurrenceFrequency
    endsOn?: string
}

export interface Event {
    _id: string
    title: string
    notes?: string
    eventType: EventType
    allDay: boolean
    /** Optional informational time, "HH:MM". */
    time?: string
    startDate: string
    startPart: Part
    endDate: string
    endPart: Part
    recurrence?: Recurrence
    createdAt: string
    updatedAt: string
}

export const DAY_STATUSES = ['annual_leave_pending', 'annual_leave_approved', 'bank_holiday'] as const
export type DayStatusType = (typeof DAY_STATUSES)[number]

export interface DayStatusOption {
    value: DayStatusType
    label: string
    bg: string
    text: string
    hover: string
}

export const DAY_STATUS_OPTIONS: DayStatusOption[] = [
    { value: 'annual_leave_pending', label: 'Annual Leave (Pending)', bg: 'bg-orange-100', text: 'text-orange-700', hover: 'hover:bg-orange-200' },
    { value: 'annual_leave_approved', label: 'Annual Leave (Approved)', bg: 'bg-green-100', text: 'text-green-700', hover: 'hover:bg-green-200' },
    { value: 'bank_holiday', label: 'Bank Holiday', bg: 'bg-green-100', text: 'text-green-700', hover: 'hover:bg-green-200' },
]

export interface DayStatus {
    _id: string
    startDate: string
    endDate: string
    status: DayStatusType
}

export interface Timebox {
    _id: string
    date: string
    title: string
    startTime: string
    endTime: string
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
    month?: string          // YYYY-MM — set for non-recurring rows, absent for recurring
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
}

export interface BudgetExclusion {
    _id: string
    date: string
}

export interface FinanceSubItem {
    _id: string
    row: string
    month?: string   // absent for non-recurring rows
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
