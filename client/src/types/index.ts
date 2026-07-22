export interface WeatherLocation {
    /** Display name, e.g. "Glasgow". */
    name: string
    latitude: number
    longitude: number
}

export interface UserSettings {
    wakeTime?: string
    bedTime?: string
    workStart?: string
    workEnd?: string
    showTotals?: boolean
    workDays?: number[]
    /** Id of the totals row whose hours feed the Study section. */
    studyRowId?: string
    /** YYYY-MM-DD — all finance data before this date is hidden. */
    financeStartDate?: string
    /** Saved location the weather forecast is based on. */
    weatherLocation?: WeatherLocation
}

export type CourseKind = 'course' | 'block'

export interface Course {
    _id: string
    name: string
    /** 'course' for formal courses; 'block' for ad-hoc manual study blocks. */
    kind: CourseKind
    /** Free-text label describing a block (e.g. "Reading", "Revision"). */
    category?: string
    requiredHours: number
    completedHours: number
    order: number
    notes?: string
    link?: string
    /** Optional "YYYY-MM-DD" deadline used for on-track pacing. */
    targetDate?: string
    createdAt: string
    updatedAt: string
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

export const EVENT_TYPES = ['trip', 'social', 'hobby', 'general'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
    trip: 'Trip',
    social: 'Social',
    hobby: 'Hobby',
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
    hobby: {
        bg: 'bg-fuchsia-100',
        hover: 'hover:bg-fuchsia-200',
        text: 'text-fuchsia-700',
        light: 'bg-fuchsia-50',
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
    lastWeekday: 'Last weekday',
}

export interface Recurrence {
    frequency: RecurrenceFrequency
    endsOn?: string
}

export type GoalStatus = 'active' | 'completed' | 'abandoned'

export interface Milestone {
    _id: string
    title: string
    completed: boolean
    order: number
}

export interface Goal {
    _id: string
    title: string
    description?: string
    targetDate?: string
    progress: number
    status: GoalStatus
    milestones: Milestone[]
    createdAt: string
    updatedAt: string
}

/** A named, immutable snapshot of the savings target planner. */
export interface SavingsTarget {
    _id: string
    name: string
    notes?: string
    /**
     * 'target' solves for the monthly amount needed to reach targetAmount;
     * 'contribution' fixes the monthly amount (requiredMonthly) and projects
     * the end balance into targetAmount. Absent on older plans — treat as 'target'.
     */
    mode?: 'target' | 'contribution'
    /** Manual display position among saved plans (lower first). */
    order?: number
    /** User-set flag marking the plan as a priority. */
    priority?: boolean
    targetAmount: number
    startingBalance: number
    annualInterestRate: number
    /** YYYY-MM */
    startMonth: string
    /** YYYY-MM */
    targetMonth: string
    /** YYYY-MM the plan was computed against */
    savedMonth: string
    onTrack: boolean
    requiredMonthly: number
    contributionMonths: number
    totalContributions: number
    interestEarned: number
    growthOnly: number
    createdAt: string
    updatedAt: string
}

export const NOTE_CATEGORY_COLORS = [
    'neutral',
    'emerald',
    'sky',
    'violet',
    'amber',
    'rose',
    'teal',
] as const
export type NoteCategoryColor = (typeof NOTE_CATEGORY_COLORS)[number]

/** Tailwind classes per accent. Keys are bare classes — no dynamic construction. */
export const NOTE_CATEGORY_COLOR_CLASSES: Record<
    NoteCategoryColor,
    { dot: string; text: string; soft: string; ring: string }
> = {
    neutral: { dot: 'bg-neutral-400', text: 'text-neutral-600', soft: 'bg-neutral-100', ring: 'ring-neutral-300' },
    emerald: { dot: 'bg-emerald-500', text: 'text-emerald-700', soft: 'bg-emerald-50', ring: 'ring-emerald-400' },
    sky: { dot: 'bg-sky-500', text: 'text-sky-700', soft: 'bg-sky-50', ring: 'ring-sky-400' },
    violet: { dot: 'bg-violet-500', text: 'text-violet-700', soft: 'bg-violet-50', ring: 'ring-violet-400' },
    amber: { dot: 'bg-amber-500', text: 'text-amber-700', soft: 'bg-amber-50', ring: 'ring-amber-400' },
    rose: { dot: 'bg-rose-500', text: 'text-rose-700', soft: 'bg-rose-50', ring: 'ring-rose-400' },
    teal: { dot: 'bg-teal-500', text: 'text-teal-700', soft: 'bg-teal-50', ring: 'ring-teal-400' },
}

export interface NoteCategory {
    _id: string
    name: string
    color: NoteCategoryColor
    order: number
    createdAt: string
    updatedAt: string
}

export interface Note {
    _id: string
    title: string
    body: string
    /** Owning category id, or null for an uncategorised note. */
    category: string | null
    createdAt: string
    updatedAt: string
}

export interface Birthday {
    _id: string
    name: string
    /** MM-DD, recurs every year */
    date: string
    createdAt: string
    updatedAt: string
}

export const DAYS_SINCE_COLORS = ['emerald', 'sky', 'violet', 'amber', 'rose', 'teal'] as const
export type DaysSinceColor = (typeof DAYS_SINCE_COLORS)[number]

/** Tailwind classes per accent. Keys are bare classes — no dynamic construction. */
export const DAYS_SINCE_COLOR_CLASSES: Record<
    DaysSinceColor,
    { tile: string; accent: string; bar: string; track: string; glow: string }
> = {
    emerald: {
        tile: 'bg-emerald-100',
        accent: 'text-emerald-600',
        bar: 'bg-emerald-500',
        track: 'bg-emerald-100',
        glow: 'from-emerald-100',
    },
    sky: {
        tile: 'bg-sky-100',
        accent: 'text-sky-600',
        bar: 'bg-sky-500',
        track: 'bg-sky-100',
        glow: 'from-sky-100',
    },
    violet: {
        tile: 'bg-violet-100',
        accent: 'text-violet-600',
        bar: 'bg-violet-500',
        track: 'bg-violet-100',
        glow: 'from-violet-100',
    },
    amber: {
        tile: 'bg-amber-100',
        accent: 'text-amber-600',
        bar: 'bg-amber-500',
        track: 'bg-amber-100',
        glow: 'from-amber-100',
    },
    rose: {
        tile: 'bg-rose-100',
        accent: 'text-rose-600',
        bar: 'bg-rose-500',
        track: 'bg-rose-100',
        glow: 'from-rose-100',
    },
    teal: {
        tile: 'bg-teal-100',
        accent: 'text-teal-600',
        bar: 'bg-teal-500',
        track: 'bg-teal-100',
        glow: 'from-teal-100',
    },
}

/** A completed run that ended in a reset. */
export interface DaysSinceAttempt {
    startDate: string
    endDate: string
    days: number
    reason?: string
}

export interface DaysSinceCheckIn {
    _id: string
    item: string
    /** YYYY-MM-DD */
    date: string
    /** 1 (easy) – 5 (intense urge) */
    intensity: number
    note?: string
}

export interface DaysSinceItem {
    _id: string
    label: string
    /** YYYY-MM-DD — the day the count is measured from. */
    startDate: string
    /** Font Awesome class string, e.g. "fa-solid fa-fire". */
    icon: string
    color: DaysSinceColor
    /** Longest run ever completed. */
    bestStreakDays: number
    /** Past attempts, oldest first. */
    history: DaysSinceAttempt[]
    createdAt: string
    updatedAt: string
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
    /** Estimated duration in minutes. */
    duration?: number
    createdAt: string
    updatedAt: string
}

export interface Reminder {
    _id: string
    date: string
    text: string
    order: number
    recurrence?: Recurrence
    /** YYYY-MM-DD occurrence dates removed from a recurring series. */
    exdates?: string[]
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

export interface FinancePot {
    _id: string
    group: string
    name: string
    order: number
    createdAt: string
    updatedAt: string
}

export interface FinanceRow {
    _id: string
    group: string
    pot?: string | null
    name: string
    recurringAmount?: number
    /** Superseded recurring amounts: months before `beforeMonth` used `amount`.
     *  `recurringAmount` stays the current value. */
    pastAmounts?: { beforeMonth: string; amount?: number }[]
    order: number
    recurring?: boolean
    month?: string // YYYY-MM — set for non-recurring rows, absent for recurring
    startMonth?: string | null // YYYY-MM inclusive; null/absent = active since forever
    endMonth?: string | null // YYYY-MM inclusive; null/absent = open-ended
    skipMonths?: string[] // months explicitly hidden ("this month only" deletes)
    budgeted?: boolean
    budgetType?: 'daily' | 'weekly' | null
    /** Starling Space categoryUid this budget mirrors transactions from. */
    starlingCategoryUid?: string | null
    createdAt: string
    updatedAt: string
}

/** A Starling Bank Space (spending space or savings goal) a budget can link to. */
export interface StarlingSpace {
    /** categoryUid used to filter the transaction feed. */
    id: string
    name: string
    type: 'spending' | 'savings'
    balance: number
    currency: string
}

/** Why a Starling movement didn't count as a budget transaction. */
export type StarlingMovementReason =
    | 'transfer_in'
    | 'transfer_out'
    | 'refund'
    | 'declined'
    | 'reversed'

/** A Space feed item that moved money without registering as spend — the raw
 *  material for explaining a balance/budget mismatch. */
export interface StarlingMovement {
    date: string
    amount: number
    direction: 'IN' | 'OUT'
    reason: StarlingMovementReason
    counterPartyName?: string
}

/** A transaction deleted or moved away from a Starling-linked budget, kept out of
 *  future syncs — recoverable from the "removed transactions" drawer. */
export interface StarlingExclusion {
    _id: string
    reason: 'deleted' | 'moved'
    originalRowName: string
    movedToRowName?: string
    date: string
    amount: number
    note?: string
    createdAt: string
}

export interface FinanceEntry {
    _id: string
    row: string
    month: string
    amount: number
}

export interface FinancePaid {
    rowId: string
    month: string
    paid: boolean
}

export interface BudgetSpend {
    _id: string
    row: string
    date: string
    amount: number
    note?: string
    /** Present when imported from a Starling Space feed. */
    starlingFeedItemUid?: string
}

export interface BudgetExclusion {
    _id: string
    date: string
}

/** An alternate budget pot shared across a set of excluded days. */
export interface ExclusionBudget {
    _id: string
    label?: string
    /** Sorted YYYY-MM-DD keys; always a subset of the user's excluded days. */
    dates: string[]
    amount: number
    /** Optional funding budget row — pot-day spends are logged against it. */
    row?: string
    note?: string
}

export interface BudgetTopUp {
    _id: string
    row: string
    date: string
    amount: number
    /** 'topup' adds spendable budget; 'refill' records money moved back into the
     * linked space without raising the budget. Absent on older records = 'topup'. */
    kind?: 'topup' | 'refill'
    note?: string
}

export interface FinanceSubItem {
    _id: string
    row: string
    month?: string // absent for non-recurring rows
    name: string
    amount: number
    order: number
    paid: boolean
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
