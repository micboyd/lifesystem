export interface WeatherLocation {
    /** Display name, e.g. "Glasgow". */
    name: string
    latitude: number
    longitude: number
}

/** Daily macronutrient targets used by the nutrition planner. Any field may be
 *  unset (or 0), meaning "no goal for this macro". */
export interface MacroGoals {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
}

/** Body composition targets the weigh-in trend is judged against. */
export interface BodyGoals {
    /** Goal bodyweight in kilograms. */
    targetWeight?: number
    /** Goal body fat, as a percentage of bodyweight. */
    targetBodyFat?: number
    /**
     * Intended change per week in kilograms, signed: negative for a cut,
     * positive for a gain.
     */
    weeklyRate?: number
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
    /** Per-day macro targets, tracked against the weekly meal plan. */
    macroGoals?: MacroGoals
    /** Bodyweight target and intended rate of change. */
    bodyGoals?: BodyGoals
}

/** One weigh-in. At most one per day — a second reading replaces the first. */
export interface WeightLog {
    _id: string
    /** "YYYY-MM-DD" — the morning the reading was taken. */
    date: string
    /** Bodyweight in kilograms. */
    weight: number
    /** Waist measurement in centimetres, if taken. */
    waist?: number
    /** Body fat as a percentage of bodyweight, if measured. */
    bodyFat?: number
    notes?: string
    createdAt: string
    updatedAt: string
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

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export interface Ingredient {
    name: string
    quantity?: string
    unit?: string
}

export interface Macros {
    calories: number
    protein: number
    carbs: number
    fat: number
}

export interface Meal {
    _id: string
    name: string
    /** Which meals of the day this fits; a meal can belong to several. */
    types: MealType[]
    /** Servings the recipe yields. Macros are stated per serving. */
    servings: number
    /** Optional label for one serving, e.g. "1 bowl". */
    servingLabel?: string
    /** Estimated prep time for a single serving, in minutes. */
    prepTime?: number
    /**
     * Fraction (0–1) of the single-serving prep that is one-time setup and so
     * doesn't repeat per serving. Unset means "use the global default".
     */
    prepOverhead?: number
    macros: Macros
    ingredients: Ingredient[]
    /** Ordered method steps. */
    method: string[]
    notes?: string
    link?: string
    order: number
    createdAt: string
    updatedAt: string
}

export interface Exercise {
    _id: string
    name: string
    description: string
    /** Primary muscle group trained, e.g. "Chest". Blank when untagged — the
     *  swap picker infers one from the name/description in that case. */
    muscleGroup?: string
    /** Kit the movement needs, e.g. "Machine". Blank when untagged. */
    equipment?: string
    order: number
    createdAt: string
    updatedAt: string
}

/** One exercise slot in a workout: a library exercise id plus its prescribed volume. */
export interface WorkoutExercise {
    /** Exercise id from the library. */
    exercise: string
    /** Number of working sets, if prescribed. */
    sets?: number
    /** Reps per set — free-form to allow ranges/AMRAP, e.g. "8-12". */
    reps?: string
    /** Rest between sets — free-form, e.g. "90 sec", "2-3 min". */
    rest?: string
    /** Coaching cue for this line, e.g. "Keep 1-2 reps in reserve". */
    notes?: string
}

export interface Workout {
    _id: string
    name: string
    description: string
    /** Planned duration in minutes. 0 means "estimate it from the sets". */
    duration: number
    /** Pin this workout to the top of the week planner. */
    showInPlanner: boolean
    /** Ordered exercises drawn from the library, each with optional sets/reps. */
    exercises: WorkoutExercise[]
    order: number
    createdAt: string
    updatedAt: string
}

/** One performed set inside a logged exercise: the weight lifted and reps done. */
export interface LoggedSet {
    /** Weight lifted, in kg. Omitted for bodyweight or when not recorded. */
    weight?: number
    /** Reps actually completed in this set. */
    reps?: number
}

/** A snapshotted exercise line inside a logged workout. */
export interface WorkoutLogExercise {
    name: string
    /** When this line was swapped mid-session, the exercise originally prescribed. */
    substitutedFor?: string
    /** Prescribed sets count, snapshotted from the library workout. */
    sets?: number
    /** Prescribed reps, snapshotted from the library workout (free-form). */
    reps?: string
    /**
     * The sets actually performed, each with its own weight and reps. Empty when
     * the workout was logged as a quick "Done" without recording weights.
     */
    loggedSets?: LoggedSet[]
}

/** A record that a strength workout was completed on a given day. */
export interface WorkoutLog {
    _id: string
    /** Library workout this came from, if any. Null once that workout is deleted. */
    workout: string | null
    /** Snapshot of the workout name at log time. */
    name: string
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Snapshot of the workout's exercises at log time. */
    exercises: WorkoutLogExercise[]
    /** Actual minutes spent, if recorded. */
    durationMin?: number
    notes?: string
    createdAt: string
    updatedAt: string
}

export const CONDITIONING_CATEGORIES = [
    'HIIT',
    'Cardio',
    'Endurance',
    'Mobility',
    'Recovery',
] as const
export type ConditioningCategory = (typeof CONDITIONING_CATEGORIES)[number]

/** One block of a session, e.g. a warm-up, main set or cool-down. */
export interface SessionPart {
    name: string
    detail?: string
    /** If set, this part is an interval block to tick off — the number of rounds to complete. */
    rounds?: number
    /** What one round is called, e.g. "round", "interval", "rep". Defaults to "round". */
    roundLabel?: string
    /** Optional per-round info shown under each rep on the counter, e.g. ["90s jog · 2min walk", …]. */
    roundDetails?: string[]
    /** Optional duration (seconds) of each rep — enables clock timestamps on the counter. */
    roundSeconds?: number[]
    /** Optional clock offset (seconds) when the first rep begins, e.g. after a warm-up. */
    startAtSec?: number
}

export interface ConditioningSession {
    _id: string
    name: string
    /** Planned duration in minutes. */
    duration: number
    category: ConditioningCategory
    /** What the session is for, e.g. "Build aerobic base". */
    purpose?: string
    /** Ordered parts making up the session. */
    parts: SessionPart[]
    /** Guidance on how / when to run the session. */
    howToUse?: string
    order: number
    createdAt: string
    updatedAt: string
}

/** How many rounds of one counted part were completed, snapshotted at log time. */
export interface RoundProgress {
    /** The part's name, snapshotted so it survives the session being edited. */
    name: string
    /** Rounds actually completed. */
    done: number
    /** Rounds the part called for. */
    target: number
}

/** A record that a conditioning session was completed on a given day. */
export interface ConditioningLog {
    _id: string
    /** Library session this came from, if any. Null once that session is deleted. */
    session: string | null
    /** Snapshot of the session name at log time. */
    name: string
    category: ConditioningCategory
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Actual minutes spent. */
    duration: number
    /** Rate of perceived exertion, 1 (easy) – 10 (max). */
    rpe?: number
    /** Completed rounds for each counted part, if any were tracked. */
    rounds?: RoundProgress[]
    notes?: string
    createdAt: string
    updatedAt: string
}

/** A record that a mobility routine was completed on a given day. */
export interface MobilityLog {
    _id: string
    /** Library routine this came from, if any. Null once that routine is deleted. */
    mobility: string | null
    /** Snapshot of the routine name at log time. */
    name: string
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Actual minutes spent. */
    duration: number
    notes?: string
    createdAt: string
    updatedAt: string
}

/** A record that a recovery item was completed on a given day. */
export interface RecoveryLog {
    _id: string
    /** Library recovery item this came from, if any. Null once that item is deleted. */
    recovery: string | null
    /** Snapshot of the recovery item name at log time. */
    name: string
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Actual minutes spent. */
    duration: number
    notes?: string
    createdAt: string
    updatedAt: string
}

export const ENTRY_STATUSES = ['planned', 'eaten', 'skipped'] as const
/** Whether a planned meal was actually eaten. */
export type EntryStatus = (typeof ENTRY_STATUSES)[number]

/** Food eaten that wasn't in the library — logged with macros, not a recipe. */
export interface AdhocMeal {
    name: string
    macros: Macros
}

/**
 * A meal placed into one slot of one day in the weekly planner. Exactly one of
 * `meal` (a library recipe) and `adhoc` (off-plan food) is set.
 */
export interface MealPlanEntry {
    _id: string
    /** "YYYY-MM-DD" — the day this sits on. */
    date: string
    /** Which slot of the day: breakfast / lunch / dinner / snack. */
    slot: MealType
    /** The planned meal, populated by the server (macros read from here). */
    meal?: Meal
    /** Set instead of `meal` for off-plan food, carrying its own macros. */
    adhoc?: AdhocMeal
    /** Whether it was eaten. */
    status: EntryStatus
    order: number
    createdAt: string
    updatedAt: string
}

/**
 * A reusable recovery item — e.g. a stretch routine, sauna, foam rolling.
 * Deliberately lightweight: just a name, duration and free-text notes.
 */
export interface Recovery {
    _id: string
    name: string
    /** Planned duration in minutes. */
    duration: number
    /** What the recovery item is for. */
    purpose?: string
    /** Free-text guidance on how / when to use it. */
    notes?: string
    order: number
    createdAt: string
    updatedAt: string
}

/**
 * A reusable mobility routine — e.g. a hip flow or shoulder circuit. Structured
 * like a conditioning session (ordered parts + how-to-use) but without a category.
 */
export interface Mobility {
    _id: string
    name: string
    /** Planned duration in minutes. */
    duration: number
    /** What the routine is for. */
    purpose?: string
    /** Ordered parts making up the routine. */
    parts: SessionPart[]
    /** Guidance on how / when to run the routine. */
    howToUse?: string
    order: number
    createdAt: string
    updatedAt: string
}

export const FITNESS_PLAN_KINDS = ['workout', 'conditioning', 'recovery', 'mobility'] as const
export type FitnessPlanKind = (typeof FITNESS_PLAN_KINDS)[number]

/** Which slot of the day a planned item sits in. */
export const FITNESS_PLAN_PARTS = ['morning', 'afternoon', 'evening'] as const
export type FitnessPlanPart = (typeof FITNESS_PLAN_PARTS)[number]

/** A workout, conditioning session or recovery item placed on one day of the planner. */
export interface FitnessPlanEntry {
    _id: string
    /** "YYYY-MM-DD" — the day this sits on. */
    date: string
    /** Which slot of the day it sits in. */
    part: FitnessPlanPart
    /** Which library the planned item comes from. */
    kind: FitnessPlanKind
    /** Populated for `kind: 'workout'`, otherwise null. */
    workout: Workout | null
    /** Populated for `kind: 'conditioning'`, otherwise null. */
    session: ConditioningSession | null
    /** Populated for `kind: 'recovery'`, otherwise null. */
    recovery: Recovery | null
    /** Populated for `kind: 'mobility'`, otherwise null. */
    mobility: Mobility | null
    /** Id of the training plan that placed this, or null when placed by hand. */
    plan: string | null
    order: number
    /** When true this item's calendar clash has been accepted, so it stops warning. */
    ignoreClash?: boolean
    createdAt: string
    updatedAt: string
}

/** Whether a planner flag marks a single day or a whole week. */
export const FITNESS_NOTE_SCOPES = ['day', 'week'] as const
export type FitnessNoteScope = (typeof FITNESS_NOTE_SCOPES)[number]

/** The flag colours a day or week can be marked with. */
export const FITNESS_FLAG_COLORS = ['coral', 'amber', 'emerald', 'sky', 'violet', 'slate'] as const
export type FitnessFlagColor = (typeof FITNESS_FLAG_COLORS)[number]

/**
 * A flag + label annotation on the planner. Marks either one day or one week
 * (e.g. "Deload", "Race week") with a colour and short label. At most one per
 * (scope, date): a day note's `date` is the day key, a week note's is its Monday.
 */
export interface FitnessPlanNote {
    _id: string
    scope: FitnessNoteScope
    /** Day key ("YYYY-MM-DD") for a day note; the week's Monday for a week note. */
    date: string
    color: FitnessFlagColor
    label: string
    createdAt: string
    updatedAt: string
}

// ─── Training plans ─────────────────────────────────────────────────────────────

/** Which part of a training plan a linked item plays. */
export const PLAN_ROLES = ['strength', 'run', 'conditioning', 'mobility', 'recovery'] as const
export type PlanRole = (typeof PLAN_ROLES)[number]

/** A library item a plan links to. Details live in the library it points at. */
export interface PlanItem {
    kind: FitnessPlanKind
    role: PlanRole
    /** Id of the Workout / ConditioningSession / Mobility / Recovery. */
    item: string
    /** The item's name at import time. */
    label: string
    /** True when the import created this item rather than reusing an existing one. */
    created: boolean
}

/** One materialised placement: a library item on a specific day and slot. */
export interface PlanScheduleEntry {
    /** "YYYY-MM-DD". */
    date: string
    part: FitnessPlanPart
    kind: FitnessPlanKind
    role: PlanRole
    item: string
    label: string
    /** Guidance carried from the source calendar, e.g. "4-6 km easy". */
    notes?: string
}

/** One block of a plan's periodisation, e.g. "5K Build". */
export interface PlanPhase {
    name: string
    dates?: string
    focus?: string
    conditioning?: string
    strength?: string
    recoveryPriority?: string
}

/** One row of a plan's week-at-a-glance table. */
export interface PlanWeekDay {
    day: string
    strength?: string
    conditioning?: string
    mobility?: string
    recovery?: string
}

/**
 * A dated exception to the plan's normal week — a holiday, a match, an injury,
 * a deload. Kept so the plan can show where the schedule departs from the
 * recurring template and why.
 */
export interface PlanOverride {
    /** Inclusive "YYYY-MM-DD" bounds. A single-day override has start === end. */
    start: string
    end: string
    /** What it does, e.g. "no recurring strength" or "strength: Upper B". */
    summary: string
    /** The reason given in the source document, e.g. "Cruise". */
    notes?: string
}

/** A name in the imported document that matched nothing in the libraries. */
export interface PlanWarning {
    source: string
    message: string
}

/**
 * A saved training plan: the prose that frames a training block, the library
 * items it uses, and a day-by-day schedule ready to push onto the planner.
 * `schedule` is omitted from the list endpoint and present on the detail one.
 */
export interface TrainingPlan {
    _id: string
    name: string
    source?: string
    generatedAt?: string
    /** "YYYY-MM-DD" bounds of the plan. */
    planStart: string
    planEnd: string
    /** Free-form goal block, rendered as key/value prose. */
    goal?: Record<string, unknown>
    phases: PlanPhase[]
    weeklyTemplate: PlanWeekDay[]
    /** Free-form progression rules, rendered as key/value prose. */
    strengthProgression?: Record<string, unknown>
    /** Weekday → how mobility / recovery are used, from the source document. */
    mobilityUse?: Record<string, string>
    recoveryUse?: Record<string, string>
    readinessRules: string[]
    items: PlanItem[]
    /** Only present on the detail endpoint. */
    schedule?: PlanScheduleEntry[]
    /** Dated exceptions applied on top of the recurring week. */
    overrides: PlanOverride[]
    warnings: PlanWarning[]
    /** When the plan was last pushed onto the planner; null if never. */
    appliedAt?: string | null
    /** How many planner entries this plan currently has in place. */
    appliedEntries: number
    order: number
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

export const EVENT_TYPES = ['trip', 'worktrip', 'social', 'hobby', 'general'] as const
export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
    trip: 'Trip',
    worktrip: 'Work Trip',
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
    // A work trip is a trip, but not one of *your* trips — emerald keeps it a
    // clear step away from trip blue, and the briefcase icon below settles it
    // at a glance in a dense week.
    worktrip: {
        bg: 'bg-emerald-100',
        hover: 'hover:bg-emerald-200',
        text: 'text-emerald-700',
        light: 'bg-emerald-50',
    },
    social: {
        bg: 'bg-amber-100',
        hover: 'hover:bg-amber-200',
        text: 'text-amber-700',
        light: 'bg-amber-50',
    },
    // Indigo is close to trip's blue by hue; the icon below is what actually
    // tells hobby chips apart, which lets the tint stay as quiet as the rest.
    hobby: {
        bg: 'bg-indigo-100',
        hover: 'hover:bg-indigo-200',
        text: 'text-indigo-700',
        light: 'bg-indigo-50',
    },
    // A plain event uses a calm teal — distinct from the grey weekend/past
    // backgrounds and from the other category hues (trip blue, social amber,
    // hobby indigo, work-trip emerald, Other purple), while staying quiet
    // enough for the common catch-all type.
    general: {
        bg: 'bg-teal-200',
        hover: 'hover:bg-teal-300',
        text: 'text-teal-800',
        light: 'bg-teal-50',
    },
}

/** Font Awesome glyphs marking specific event types inside chips. */
export const EVENT_TYPE_ICONS: Partial<Record<EventType, string>> = {
    hobby: 'fa-solid fa-football',
    worktrip: 'fa-solid fa-briefcase',
}

// ─── Calendars (layers) ───────────────────────────────────────────────────────

export const CALENDAR_COLORS = [
    'neutral',
    'blue',
    'amber',
    'indigo',
    'emerald',
    'rose',
    'purple',
    'teal',
] as const
export type CalendarColor = (typeof CALENDAR_COLORS)[number]

/**
 * A calendar is a layer, not a category: it decides what is *drawn*, while
 * eventType still says what an event *is*. Hiding one keeps the grid quiet
 * without deleting anything.
 */
export interface Calendar {
    _id: string
    name: string
    color: CalendarColor
    /** New events land here when no calendar is chosen. Exactly one per user. */
    isDefault: boolean
    /** Hidden calendars are drawn as per-day presence dots instead of chips. */
    visible: boolean
    order: number
    createdAt: string
    updatedAt: string
}

/** Bare Tailwind classes per palette key — no dynamic construction. */
export const CALENDAR_COLOR_CLASSES: Record<
    CalendarColor,
    { bg: string; hover: string; text: string; light: string; dot: string }
> = {
    neutral: {
        bg: 'bg-neutral-100',
        hover: 'hover:bg-neutral-200',
        text: 'text-neutral-600',
        light: 'bg-neutral-50',
        dot: 'bg-neutral-400',
    },
    blue: {
        bg: 'bg-blue-100',
        hover: 'hover:bg-blue-200',
        text: 'text-blue-700',
        light: 'bg-blue-50',
        dot: 'bg-blue-400',
    },
    amber: {
        bg: 'bg-amber-100',
        hover: 'hover:bg-amber-200',
        text: 'text-amber-700',
        light: 'bg-amber-50',
        dot: 'bg-amber-400',
    },
    indigo: {
        bg: 'bg-indigo-100',
        hover: 'hover:bg-indigo-200',
        text: 'text-indigo-700',
        light: 'bg-indigo-50',
        dot: 'bg-indigo-400',
    },
    emerald: {
        bg: 'bg-emerald-100',
        hover: 'hover:bg-emerald-200',
        text: 'text-emerald-700',
        light: 'bg-emerald-50',
        dot: 'bg-emerald-400',
    },
    rose: {
        bg: 'bg-rose-100',
        hover: 'hover:bg-rose-200',
        text: 'text-rose-700',
        light: 'bg-rose-50',
        dot: 'bg-rose-400',
    },
    purple: {
        bg: 'bg-purple-100',
        hover: 'hover:bg-purple-200',
        text: 'text-purple-700',
        light: 'bg-purple-50',
        dot: 'bg-purple-400',
    },
    teal: {
        bg: 'bg-teal-100',
        hover: 'hover:bg-teal-200',
        text: 'text-teal-700',
        light: 'bg-teal-50',
        dot: 'bg-teal-400',
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

export type ProgressMode = 'manual' | 'auto'

/** Per-habit consistency stats for an auto-tracked goal, from the server. */
export interface GoalDerived {
    /** Total days in the goal window (start → target date, inclusive). */
    windowDays: number
    /** Days elapsed so far (start → today, capped at the window). */
    elapsedDays: number
    habits: { habit: string; completedDays: number; rate: number }[]
}

export interface Goal {
    _id: string
    title: string
    description?: string
    targetDate?: string
    progress: number
    status: GoalStatus
    milestones: Milestone[]
    /** 'manual' = slider; 'auto' = derived from linked habits' consistency. */
    progressMode: ProgressMode
    /** Ids of habits driving progress when progressMode is 'auto'. */
    linkedHabits: string[]
    /** Window start (YYYY-MM-DD); defaults to the creation date. */
    startDate?: string
    /** Present only for 'auto' goals — the computed consistency breakdown. */
    derived?: GoalDerived
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
    neutral: {
        dot: 'bg-neutral-400',
        text: 'text-neutral-600',
        soft: 'bg-neutral-100',
        ring: 'ring-neutral-300',
    },
    emerald: {
        dot: 'bg-emerald-500',
        text: 'text-emerald-700',
        soft: 'bg-emerald-50',
        ring: 'ring-emerald-400',
    },
    sky: { dot: 'bg-sky-500', text: 'text-sky-700', soft: 'bg-sky-50', ring: 'ring-sky-400' },
    violet: {
        dot: 'bg-violet-500',
        text: 'text-violet-700',
        soft: 'bg-violet-50',
        ring: 'ring-violet-400',
    },
    amber: {
        dot: 'bg-amber-500',
        text: 'text-amber-700',
        soft: 'bg-amber-50',
        ring: 'ring-amber-400',
    },
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
    /** Empty for a locked note in list responses until revealed with its password. */
    body: string
    /** Owning category id, or null for an uncategorised note. */
    category: string | null
    /** When true, the body is hidden until the note's password is entered. */
    locked: boolean
    createdAt: string
    updatedAt: string
}

export const CHECKLIST_COLORS = [
    'neutral',
    'emerald',
    'sky',
    'violet',
    'amber',
    'rose',
    'teal',
] as const
export type ChecklistColor = (typeof CHECKLIST_COLORS)[number]

/** Tailwind classes per accent. Keys are bare classes — no dynamic construction. */
export const CHECKLIST_COLOR_CLASSES: Record<
    ChecklistColor,
    { dot: string; text: string; soft: string; ring: string; bar: string }
> = {
    neutral: {
        dot: 'bg-neutral-400',
        text: 'text-neutral-600',
        soft: 'bg-neutral-100',
        ring: 'ring-neutral-300',
        bar: 'bg-neutral-400',
    },
    emerald: {
        dot: 'bg-emerald-500',
        text: 'text-emerald-700',
        soft: 'bg-emerald-50',
        ring: 'ring-emerald-400',
        bar: 'bg-emerald-500',
    },
    sky: {
        dot: 'bg-sky-500',
        text: 'text-sky-700',
        soft: 'bg-sky-50',
        ring: 'ring-sky-400',
        bar: 'bg-sky-500',
    },
    violet: {
        dot: 'bg-violet-500',
        text: 'text-violet-700',
        soft: 'bg-violet-50',
        ring: 'ring-violet-400',
        bar: 'bg-violet-500',
    },
    amber: {
        dot: 'bg-amber-500',
        text: 'text-amber-700',
        soft: 'bg-amber-50',
        ring: 'ring-amber-400',
        bar: 'bg-amber-500',
    },
    rose: {
        dot: 'bg-rose-500',
        text: 'text-rose-700',
        soft: 'bg-rose-50',
        ring: 'ring-rose-400',
        bar: 'bg-rose-500',
    },
    teal: {
        dot: 'bg-teal-500',
        text: 'text-teal-700',
        soft: 'bg-teal-50',
        ring: 'ring-teal-400',
        bar: 'bg-teal-500',
    },
}

export interface ChecklistItem {
    _id: string
    text: string
    done: boolean
    order: number
}

export interface ChecklistGroup {
    _id: string
    /** Empty string renders as an ungrouped section. */
    name: string
    items: ChecklistItem[]
    order: number
}

export interface Checklist {
    _id: string
    title: string
    description?: string
    color: ChecklistColor
    groups: ChecklistGroup[]
    order: number
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
    /** Id of the calendar (layer) this event lives on. Absent on synthetic events. */
    calendar?: string
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
    /** When true the event is excluded from the Fitness planner's slot-clash warnings. */
    ignoreClash?: boolean
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
    'christmas_new_year',
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
    {
        value: 'christmas_new_year',
        label: 'Christmas & New Year',
        bg: 'bg-red-100',
        text: 'text-red-700',
        hover: 'hover:bg-red-200',
    },
]

export interface DayStatus {
    _id: string
    startDate: string
    endDate: string
    status: DayStatusType
}

// ─── Month notes (flags on whole months) ──────────────────────────────────────

/**
 * A label hung on a month or a run of months — "No booze", "Cutting", "Wedding
 * season". Months are YYYY-MM; the range is inclusive at both ends. Reuses the
 * calendar palette so flags sit visually alongside calendar layers.
 */
export interface MonthNote {
    _id: string
    startMonth: string
    endMonth: string
    label: string
    note?: string
    color: CalendarColor
    createdAt: string
    updatedAt: string
}

export interface MonthNoteInput {
    startMonth: string
    endMonth: string
    label: string
    note?: string
    color: CalendarColor
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
    notes?: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[]; until?: string }
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
    /** Font Awesome class for the tile icon, e.g. "fa-solid fa-dumbbell". */
    icon?: string
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
     * linked space without raising the budget; 'withdrawal' takes money out of the
     * budget for something else, lowering the remaining (and daily/weekly allowance)
     * forward. Absent on older records = 'topup'. */
    kind?: 'topup' | 'refill' | 'withdrawal'
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

// ─── Life Plan ────────────────────────────────────────────────────────────────

/**
 * The domains a life plan tracks — the lanes of the timeline. Each pillar reads
 * from a module that already records the underlying data; the life plan only
 * says what the stretch of time is *for*.
 */
export const LIFE_PILLARS = ['training', 'nutrition', 'money', 'study', 'life'] as const
export type LifePillar = (typeof LIFE_PILLARS)[number]

export const LIFE_PILLAR_LABELS: Record<LifePillar, string> = {
    training: 'Training',
    nutrition: 'Nutrition',
    money: 'Money',
    study: 'Study',
    life: 'Life',
}

export const LIFE_PILLAR_ICONS: Record<LifePillar, string> = {
    training: 'fa-dumbbell',
    nutrition: 'fa-bowl-food',
    money: 'fa-wallet',
    study: 'fa-graduation-cap',
    life: 'fa-compass',
}

/** What a season is trying to do in one pillar, in the user's own words. */
export interface SeasonIntent {
    pillar: LifePillar
    text: string
}

/**
 * What a season pulls in from elsewhere in the app — references only. The linked
 * records stay owned by their own modules, so the timeline always reflects their
 * current dates rather than a copy taken when the season was written.
 */
export interface SeasonLinks {
    trainingPlans: string[]
    nutritionPhases: string[]
    savingsTargets: string[]
    goals: string[]
    courses: string[]
    monthNotes: string[]
}

/** A season's retro, written once it has elapsed. */
export interface SeasonReview {
    reviewedAt?: string
    notes?: string
    /** How it went overall, 1–5. */
    rating?: number
}

/**
 * One chapter of a life plan: a run of months with a focus and an intent per
 * pillar. Seasons within a plan never overlap, so "which season is this month
 * in" has exactly one answer.
 */
export interface Season {
    _id: string
    name: string
    /** Inclusive YYYY-MM bounds. */
    startMonth: string
    endMonth: string
    focus?: string
    color: CalendarColor
    intent: SeasonIntent[]
    links: SeasonLinks
    review?: SeasonReview
    order: number
}

/** A dated horizon — usually a year — divided into seasons. */
export interface LifePlan {
    _id: string
    name: string
    /** Inclusive YYYY-MM bounds of the whole plan. */
    start: string
    end: string
    /** The multi-year theme this plan serves. */
    vision?: string
    pillars: LifePillar[]
    seasons: Season[]
    order: number
    createdAt: string
    updatedAt: string
}

export interface LifePlanInput {
    name: string
    start: string
    end: string
    vision?: string
    pillars?: LifePillar[]
}

export interface SeasonInput {
    name: string
    startMonth: string
    endMonth: string
    focus?: string
    color: CalendarColor
    intent: SeasonIntent[]
    links: SeasonLinks
}

/** An empty link set — what a new season starts from. */
export const EMPTY_SEASON_LINKS: SeasonLinks = {
    trainingPlans: [],
    nutritionPhases: [],
    savingsTargets: [],
    goals: [],
    courses: [],
    monthNotes: [],
}

// ─── Nutrition phases ─────────────────────────────────────────────────────────

export const NUTRITION_PHASE_KINDS = ['cut', 'maintain', 'gain'] as const
export type NutritionPhaseKind = (typeof NUTRITION_PHASE_KINDS)[number]

export const NUTRITION_PHASE_LABELS: Record<NutritionPhaseKind, string> = {
    cut: 'Cut',
    maintain: 'Maintain',
    gain: 'Gain',
}

/**
 * A dated stretch of eating with its own daily targets. Gives the nutrition lane
 * something to draw and gives adherence a target with dates on it, rather than
 * one global setting standing in for every month of the year.
 */
export interface NutritionPhase {
    _id: string
    name: string
    /** Inclusive YYYY-MM-DD bounds — day-precise, since a cut rarely starts on the 1st. */
    startDate: string
    endDate: string
    kind: NutritionPhaseKind
    targets: MacroGoals
    /** Intended kg/week, signed: negative for a cut, positive for a gain. */
    weeklyRate?: number
    notes?: string
    createdAt: string
    updatedAt: string
}

export interface NutritionPhaseInput {
    name: string
    startDate: string
    endDate: string
    kind: NutritionPhaseKind
    targets: MacroGoals
    weeklyRate?: number
    notes?: string
}
