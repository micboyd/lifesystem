import { daysInMonth, monthKeyOf, parseDateKey } from './calendar'
import { monthRange, overlapsWindow, type LaneSource } from './lifeTimeline'
import type { LifePillar, NutritionPhase, PlanRole, TrainingPlan } from '../types'
import type { TimelineInput } from './lifeTimeline'

/**
 * Pressure: how much a single month is being asked to carry.
 *
 * `overload.ts` asks the same question of one slot of one day — two hard sessions
 * in one sitting — and this is that question at month grain. Nothing here is a
 * diary clash; every commitment fits in the calendar on its own. What it catches
 * is the pile-up: a build block, an aggressive cut, an exam and a house move all
 * landing in the same six weeks, each reasonable alone and collectively not.
 *
 * ## Why a vector and not a score
 *
 * The obvious model — weigh every commitment, add them up, call anything over a
 * threshold overloaded — is wrong in a way that shows up immediately in use: it
 * lets a savings plan push you into "overloaded" alongside a training block.
 * Saving £400 a month costs nothing physically. Those two commitments don't
 * compete for anything, so summing them measures nothing.
 *
 * What they do compete for is a **reserve**: the thing actually being spent.
 * Four of them, and the point is that they cut *across* the pillars —
 *
 * - a cut and a training block are different pillars, both spending `body`;
 * - a savings target and a training block are both "commitments", spending
 *   nothing in common at all.
 *
 * So overload is per-reserve. Four savings targets can only ever overload
 * `money`, and they do it when they cost more than there is to spend — not when
 * you happen to have four of them. A build block plus a deep cut is only two
 * commitments and is the single most reliable way to fail, because both come out
 * of the same reserve.
 *
 * ## Why capacities, and why some of them are null
 *
 * A score of 6 raises the question "six of what?". Every reserve here is a real
 * quantity in a real unit measured against a denominator: hours in a week, hard
 * sessions the body can absorb, pounds of free cash, changes you can hold in
 * your head at once. `time`, `body` and `focus` have defensible universal
 * defaults. `money` does not — free cash is entirely personal — so its capacity
 * is null until the finance module supplies one, and a null capacity scores
 * null rather than guessing. Same reasoning as `measuredMaintenance`: a
 * confidently wrong denominator is worse than an absent one.
 *
 * ## Measured vs assumed
 *
 * Most of the intensity figures come off records the app already keeps — a
 * plan's own schedule, a savings target's `requiredMonthly`, a course's
 * remaining hours, a phase's intended rate. A few can't (what a month flag
 * labelled "Portugal" costs is unknowable), so those carry a prior instead.
 * Every contributor says which it is, so a month can be read as "four of five
 * inputs measured" rather than asking to be trusted whole.
 */

// ─── Reserves ───────────────────────────────────────────────────────────────

/**
 * The four things a commitment can spend. Deliberately not the pillars: pillars
 * say where a commitment lives, reserves say what it costs, and the whole point
 * of the model is that those two are different axes.
 */
export const RESERVES = ['time', 'body', 'money', 'focus'] as const
export type Reserve = (typeof RESERVES)[number]

export const RESERVE_LABELS: Record<Reserve, string> = {
    time: 'Time',
    body: 'Body',
    money: 'Money',
    focus: 'Focus',
}

/** What each reserve is counted in — always shown, so no number is unitless. */
export const RESERVE_UNITS: Record<Reserve, string> = {
    time: 'h/wk',
    body: 'load/wk',
    money: '£/mo',
    focus: 'changes',
}

export const RESERVE_ICONS: Record<Reserve, string> = {
    time: 'fa-clock',
    body: 'fa-heart-pulse',
    money: 'fa-sterling-sign',
    focus: 'fa-brain',
}

/** One line on what the reserve is, for the legend and the drawer. */
export const RESERVE_DESCRIPTIONS: Record<Reserve, string> = {
    time: 'Hours a week the month is already spoken for.',
    body: 'Recovery demand — hard sessions plus how deep the deficit runs.',
    money: 'Committed each month, against what is free to commit.',
    focus: 'Deliberate behaviour changes running at once. Few people hold more than three.',
}

/** What one commitment costs, reserve by reserve. Zero where it costs nothing. */
export type ReserveDemand = Record<Reserve, number>

export function emptyDemand(): ReserveDemand {
    return { time: 0, body: 0, money: 0, focus: 0 }
}

// ─── Contributors ───────────────────────────────────────────────────────────

/**
 * Whether a contributor's demand was read off the record or stood in for.
 *
 * Kept per contributor rather than per reserve because it's a property of the
 * record: a training plan carries its own schedule and is measured across every
 * reserve it touches; a month flag carries a label and a date range and is
 * assumed across every reserve it touches.
 */
export type DemandBasis = 'measured' | 'assumed'

/** One commitment's contribution to a month's load. */
export interface LoadContributor {
    /** Unique within a month — `${source}:${recordId}`, matching `LaneItem.id`. */
    id: string
    source: LaneSource
    recordId: string
    label: string
    pillar: LifePillar
    demand: ReserveDemand
    basis: DemandBasis
    /** Where the numbers came from, e.g. "5 sessions/wk · 4.5h". */
    detail?: string
}

// ─── Capacity ───────────────────────────────────────────────────────────────

/**
 * Where a capacity came from. `default` is the shipped prior, `measured` is read
 * from the user's own records (free cash from the finance rows), and
 * `calibrated` is fitted from how their adherence has historically held up —
 * see `lifeCalibration.ts`.
 */
export type CapacityBasis = 'default' | 'measured' | 'calibrated'

export interface Capacity {
    /** Null when there is no honest denominator — scores null rather than guessing. */
    value: number | null
    basis: CapacityBasis
}

/**
 * The shipped priors.
 *
 * `time` is roughly what's left of a week after work, sleep and the ordinary
 * running of a life — nine hours is a generous read of "discretionary". `body`
 * is six hard sessions' worth of recovery a week, the point at which most people
 * training seriously start to fray. `focus` is three, which is about the ceiling
 * on deliberate behaviour changes anyone sustains at once. `money` has no prior
 * worth having.
 */
export const DEFAULT_CAPACITIES: Record<Reserve, number | null> = {
    time: 9,
    body: 6,
    money: null,
    focus: 3,
}

export type Capacities = Record<Reserve, Capacity>

export function defaultCapacities(): Capacities {
    return {
        time: { value: DEFAULT_CAPACITIES.time, basis: 'default' },
        body: { value: DEFAULT_CAPACITIES.body, basis: 'default' },
        money: { value: DEFAULT_CAPACITIES.money, basis: 'default' },
        focus: { value: DEFAULT_CAPACITIES.focus, basis: 'default' },
    }
}

// ─── Levels ─────────────────────────────────────────────────────────────────

export const LOAD_LEVELS = ['quiet', 'steady', 'busy', 'overloaded'] as const
export type LoadLevel = (typeof LOAD_LEVELS)[number]

export const LOAD_LEVEL_LABELS: Record<LoadLevel, string> = {
    quiet: 'Quiet',
    steady: 'Steady',
    busy: 'Busy',
    overloaded: 'Overloaded',
}

/**
 * Fractions of capacity the levels break at. `overloaded` starts at 1 for the
 * obvious reason — it's the point where the month is asking for more than there
 * is — which makes the word mean something rather than mark a chosen number.
 */
export const LEVEL_THRESHOLDS = { steady: 0.5, busy: 0.8, overloaded: 1 } as const

/** Where a demand/capacity ratio sits on the quiet → overloaded scale. */
export function levelForRatio(ratio: number): LoadLevel {
    if (ratio >= LEVEL_THRESHOLDS.overloaded) return 'overloaded'
    if (ratio >= LEVEL_THRESHOLDS.busy) return 'busy'
    if (ratio >= LEVEL_THRESHOLDS.steady) return 'steady'
    return 'quiet'
}

/** Rank for comparing levels — the worst level across reserves wins the month. */
export function levelRank(level: LoadLevel): number {
    return LOAD_LEVELS.indexOf(level)
}

// ─── Costs ──────────────────────────────────────────────────────────────────

/**
 * What an hour of each kind of session costs the week.
 *
 * Mobility and recovery take real time but no recovery, which is the same call
 * `overload.ts:isHardSession` makes a day at a time — they're what you'd pair a
 * hard session with, not another hard session.
 */
export const SESSION_HOURS: Record<PlanRole, number> = {
    strength: 1,
    run: 0.75,
    conditioning: 0.75,
    mobility: 0.25,
    recovery: 0.25,
}

/** The roles that spend `body`. */
export const HARD_ROLES: PlanRole[] = ['strength', 'run', 'conditioning']

/**
 * What a deficit does to the body reserve.
 *
 * The first version added it to the demand — a −500 cut counted as two extra
 * hard sessions a week. That's the wrong shape, and it's the reason an ordinary
 * setup (a cut and the training you were already doing) read as an overload.
 *
 * A deficit doesn't make the week busier. It makes you worse at recovering from
 * the week you already have. So it belongs on the **capacity** side, as a
 * multiplier on the training ceiling, not on the demand side as an addend. The
 * physiology and the arithmetic agree: cutting while training hard is risky
 * because the ceiling comes down, and a cut with no training at all costs your
 * body nothing — which the old model couldn't say, and this one gets right for
 * free.
 *
 * A surplus doesn't raise the ceiling here. Eating over maintenance helps
 * recovery, but crediting it would let a bulk license a volume the person has
 * never actually run, which is not a trade this should be making on their
 * behalf.
 */
export const RECOVERY_COST_PER_500 = 0.1

/** However deep the cut, never model away more than half the ceiling. */
export const MIN_RECOVERY_FACTOR = 0.5

/** Kilocalories in a kilogram of bodyweight — matches `energy.ts:KCAL_PER_KG`. */
const KCAL_PER_KG = 7700

/**
 * Hours a week that eating to a prescription costs: shopping to it, preparing it
 * and recording it. A maintain phase is the absence of a demand rather than a
 * demand, so it costs nothing anywhere. Assumed, not measured.
 */
export const PHASE_HOURS: Record<NutritionPhase['kind'], number> = {
    cut: 1.5,
    gain: 1.5,
    maintain: 0,
}

/**
 * `focus` costs, in concurrent deliberate behaviour changes.
 *
 * A phase is a whole change (weighing food, hitting protein every day). Running
 * a written plan is half of one — the decisions are already made, you only have
 * to turn up. A deadline is a spike in the month it lands rather than a load
 * across the months before it.
 */
export const FOCUS_COSTS = {
    phase: { cut: 1, gain: 1, maintain: 0 } as Record<NutritionPhase['kind'], number>,
    trainingPlan: 0.5,
    course: 1,
    monthNote: 0.5,
    goalDeadline: 1,
} as const

/**
 * What a month flag costs when all that's known is a label and a date range.
 *
 * A house move and a dry January are the same record, so this is a flat prior
 * and marked assumed. Erring low is deliberate: an inflated guess would drown
 * out four measured figures sitting beside it.
 */
export const MONTH_NOTE_HOURS = 2

/**
 * A cut costing at least this share of the training ceiling counts as deep —
 * with the default coefficient, roughly −750 kcal/day.
 */
export const DEEP_CUT_COST = 0.15

/** Hard sessions a week at or past which the training week counts as heavy. */
export const HEAVY_WEEK_SESSIONS = 4

/** Longest a course's implied study rate is allowed to read, h/wk. */
const MAX_COURSE_HOURS = 20

// ─── Per-month results ──────────────────────────────────────────────────────

/** How much of a reserve's demand one contributor accounts for. */
export interface ReserveContribution {
    contributor: LoadContributor
    amount: number
}

/**
 * Something that moved a reserve's capacity rather than spending it.
 *
 * Kept separate from the contributors so the drawer can say "7 → 6, because of
 * the cut" rather than burying it in a total. A commitment that lowers what you
 * can carry is a different fact from one that carries something.
 */
export interface CapacityAdjustment {
    /** `LoadContributor.id` of whatever caused it. */
    contributorId: string
    label: string
    /** Multiplier on the base capacity — 0.85 costs 15% of it. */
    factor: number
    detail: string
}

export interface ReserveLoad {
    reserve: Reserve
    /** Total demand in the reserve's own unit. */
    demand: number
    /** The capacity before anything adjusted it. */
    baseCapacity: number | null
    /** What moved it, and why. */
    adjustments: CapacityAdjustment[]
    /** The capacity actually measured against, after `adjustments`. */
    capacity: number | null
    capacityBasis: CapacityBasis
    /** demand ÷ capacity. Null when the capacity is unknown. */
    ratio: number | null
    /** Null when the capacity is unknown — unscorable, not zero. */
    level: LoadLevel | null
    /** What's spending it, heaviest first. Contributors costing nothing are left out. */
    contributions: ReserveContribution[]
    /** How much of the demand rests on assumed rather than measured figures. */
    assumedShare: number
}

/**
 * Two commitments that don't merely stack but actively work against each other.
 *
 * Kept apart from load because it's a different claim. Load says "this month is
 * expensive"; a conflict says "these two cannot both go well", and no amount of
 * spare capacity fixes it.
 */
export type ConflictKind = 'opposing-phases' | 'deep-cut-in-heavy-block' | 'unfundable'

export interface Conflict {
    kind: ConflictKind
    month: string
    /** `LoadContributor.id`s of the commitments involved. */
    between: string[]
    title: string
    detail: string
}

export interface MonthLoad {
    month: string
    reserves: Record<Reserve, ReserveLoad>
    /** Everything live in the month, whatever it costs. */
    contributors: LoadContributor[]
    conflicts: Conflict[]
    /** The reserve under the most strain. Null when nothing scorable is live. */
    peak: Reserve | null
    /** The worst level across every scorable reserve. */
    level: LoadLevel | null
}

// ─── Input ──────────────────────────────────────────────────────────────────

export interface LoadInput extends TimelineInput {
    /**
     * Free cash by month, YYYY-MM → £: income less everything already committed
     * elsewhere. Months not present fall back to `capacities.money`, and if that
     * is null too the money reserve goes unscored.
     */
    freeCash?: Record<string, number>
    /**
     * Measured maintenance calories, from `energy.ts:measuredMaintenance`. When
     * present a phase's deficit is read as maintenance − target, which is the
     * true depth; without it the phase's intended `weeklyRate` stands in.
     */
    maintenanceKcal?: number
    /** Overrides for the shipped priors — measured or calibrated capacities. */
    capacities?: Partial<Capacities>
}

// ─── Month arithmetic ───────────────────────────────────────────────────────

/** Weeks in a month, so an hours-a-week rate can be averaged over one. */
function weeksInMonth(month: string): number {
    const [year, m] = month.split('-').map(Number)
    return daysInMonth(year, m - 1) / 7
}

/** Days of `month` covered by an inclusive YYYY-MM-DD range. */
function daysCovered(month: string, start: string, end: string): number {
    const [year, m] = month.split('-').map(Number)
    const total = daysInMonth(year, m - 1)
    const firstDay = monthKeyOf(start) < month ? 1 : parseDateKey(start).day
    const lastDay = monthKeyOf(end) > month ? total : parseDateKey(end).day
    return Math.max(0, Math.min(lastDay, total) - Math.max(firstDay, 1) + 1)
}

/** What fraction of a month an inclusive day range covers, 0–1. */
function coverageOf(month: string, start: string, end: string): number {
    const [year, m] = month.split('-').map(Number)
    return daysCovered(month, start, end) / daysInMonth(year, m - 1)
}

/** Whole months from the first of `from` to `to`, never below a quarter month. */
function monthsUntil(from: string, to: string): number {
    const [fy, fm] = from.split('-').map(Number)
    const [ty, tm] = to.split('-').map(Number)
    return Math.max(0.25, (ty - fy) * 12 + (tm - fm) + 1)
}

// ─── Reading intensity off the records ──────────────────────────────────────

/** A cell of a plan's weekly template that names no session. */
const EMPTY_CELL = /^(|-|–|—|rest|none|off|n\/a)$/i

/**
 * Mon = 0 … Sun = 6 for a YYYY-MM-DD.
 *
 * Shifted off `Date.getDay()`'s Sunday-first numbering so a dated session lands
 * on the same index as the matching row of a `weeklyTemplate`, which is what
 * lets a plan carrying a schedule and a plan carrying only a template be
 * compared at all.
 */
function weekdayOf(date: string): number {
    return (new Date(`${date}T00:00:00`).getDay() + 6) % 7
}

/** One plan's share of a month's training, after overlaps with the plans before it. */
interface PlanShare {
    plan: TrainingPlan
    byRole: Record<PlanRole, number>
    basis: DemandBasis
    /** The plan that had already claimed part of this one's week, if any. */
    overlaps?: string
    /** 0–1: how much of this plan's week was still unclaimed. */
    share: number
}

function emptyRoles(): Record<PlanRole, number> {
    return { strength: 0, run: 0, conditioning: 0, mobility: 0, recovery: 0 }
}

/**
 * What every training plan asks of a month, with overlaps counted once.
 *
 * The version this replaced summed the plans, which is wrong for a reason that
 * shows up the first time two blocks run at the same time: **a week is a week**.
 * Two plans live in the same month are two prescriptions for the same seven
 * days, not fourteen days of training. Summing them turned "a strength block and
 * a running block" into ten hard sessions a week and called a perfectly ordinary
 * setup an overload.
 *
 * So the plans are unioned on the slots they claim — the same move
 * `overload.ts` makes at day grain, where a slot holds one hard session however
 * many things want it. Slots are keyed by weekday and role: a plan that wants
 * Monday strength and another that also wants Monday strength are describing one
 * Monday, while Monday strength and Monday intervals are genuinely two sessions.
 * Weekday rather than date because most plans reach this function through the
 * list endpoint, which omits `schedule` — keying on what both paths can always
 * produce keeps a dated plan and a templated one comparable.
 *
 * Plans are walked in order and each is charged only for the share of its own
 * week nothing before it had claimed, so the shares still add up to the union.
 * A plan that adds nothing is kept and says whose week it duplicates, because
 * "these two blocks are the same block" is the useful thing to learn.
 */
function trainingShares(plans: TrainingPlan[], month: string): PlanShare[] {
    const live = plans.filter((p) =>
        overlapsWindow(monthKeyOf(p.planStart), monthKeyOf(p.planEnd), month, month)
    )
    const claimedBy = new Map<string, string>()
    const weeks = weeksInMonth(month)

    return live.map((plan) => {
        /** This plan's week as slot keys, and what each is worth per week. */
        const slots = new Map<string, { role: PlanRole; perWeek: number }>()
        let basis: DemandBasis

        if (plan.schedule && plan.schedule.length > 0) {
            basis = 'measured'
            for (const entry of plan.schedule) {
                if (monthKeyOf(entry.date) !== month) continue
                const key = `${weekdayOf(entry.date)}|${entry.role}`
                const existing = slots.get(key)
                // A slot recurring three times in a four-week month is 0.75/wk, not 1.
                if (existing) existing.perWeek += 1 / weeks
                else slots.set(key, { role: entry.role, perWeek: 1 / weeks })
            }
        } else {
            basis = 'assumed'
            const coverage = coverageOf(month, plan.planStart, plan.planEnd)
            for (const [i, day] of plan.weeklyTemplate.entries()) {
                for (const role of ['strength', 'conditioning', 'mobility', 'recovery'] as const) {
                    const cell = day[role]
                    if (!cell || EMPTY_CELL.test(cell.trim())) continue
                    slots.set(`${i}|${role}`, { role, perWeek: coverage })
                }
            }
        }

        const byRole = emptyRoles()
        let total = 0
        let kept = 0
        let overlaps: string | undefined

        for (const [key, slot] of slots) {
            total += slot.perWeek
            const owner = claimedBy.get(key)
            if (owner) {
                overlaps ??= owner
                continue
            }
            claimedBy.set(key, plan.name)
            byRole[slot.role] += slot.perWeek
            kept += slot.perWeek
        }

        return { plan, byRole, basis, overlaps, share: total > 0 ? kept / total : 1 }
    })
}

/**
 * A phase's daily deficit in kcal, positive when eating under maintenance.
 *
 * Measured maintenance against the phase's own calorie target is the real depth,
 * and is preferred whenever both are known. Failing that the phase's intended
 * `weeklyRate` implies one: half a kilo a week is about 550 kcal a day. A phase
 * with neither has no depth to read and costs nothing on `body`.
 */
function phaseDeficit(phase: NutritionPhase, maintenanceKcal?: number): number | null {
    const target = phase.targets.calories
    if (maintenanceKcal && target) return maintenanceKcal - target
    if (typeof phase.weeklyRate === 'number' && phase.weeklyRate !== 0)
        return (-phase.weeklyRate * KCAL_PER_KG) / 7
    return null
}

// ─── Building a month ───────────────────────────────────────────────────────

function contributorsForMonth(input: LoadInput, month: string): LoadContributor[] {
    const out: LoadContributor[] = []
    const weeks = weeksInMonth(month)

    for (const { plan: tp, byRole, basis, overlaps, share } of trainingShares(
        input.trainingPlans ?? [],
        month
    )) {
        const roles = Object.keys(byRole) as PlanRole[]
        const hours = roles.reduce((sum, r) => sum + byRole[r] * SESSION_HOURS[r], 0)
        const hard = HARD_ROLES.reduce((sum, r) => sum + byRole[r], 0)
        const demand = emptyDemand()
        demand.time = hours
        demand.body = hard
        // Following a second plan that adds nothing to the week is still a
        // second thing to keep track of, but it isn't half a plan's worth.
        demand.focus = FOCUS_COSTS.trainingPlan * (share > 0 ? 1 : 0.5)
        out.push({
            id: `trainingPlan:${tp._id}`,
            source: 'trainingPlan',
            recordId: tp._id,
            label: tp.name,
            pillar: 'training',
            demand,
            basis,
            detail: overlaps
                ? share > 0
                    ? `adds ${round(hard, 1)} hard sessions/wk on top of ${overlaps}`
                    : `same week as ${overlaps} — counted once`
                : hard > 0
                  ? `${round(hard, 1)} hard sessions/wk · ${round(hours, 1)}h`
                  : `${round(hours, 1)}h/wk`,
        })
    }

    for (const phase of input.nutritionPhases ?? []) {
        if (!overlapsWindow(monthKeyOf(phase.startDate), monthKeyOf(phase.endDate), month, month))
            continue
        const coverage = coverageOf(month, phase.startDate, phase.endDate)
        const deficit = phaseDeficit(phase, input.maintenanceKcal)
        const demand = emptyDemand()
        demand.time = PHASE_HOURS[phase.kind] * coverage
        // No body demand: a deficit lowers the ceiling rather than filling it —
        // see `RECOVERY_COST_PER_500` and `recoveryAdjustments`.
        demand.focus = FOCUS_COSTS.phase[phase.kind] * coverage
        out.push({
            id: `nutritionPhase:${phase._id}`,
            source: 'nutritionPhase',
            recordId: phase._id,
            label: phase.name,
            pillar: 'nutrition',
            demand,
            // The depth is read off the record; the hours it costs are a prior.
            basis: deficit === null ? 'assumed' : 'measured',
            detail:
                deficit && deficit > 0
                    ? `−${Math.round(deficit)} kcal/day`
                    : deficit && deficit < 0
                      ? `+${Math.round(-deficit)} kcal/day`
                      : 'no rate set',
        })
    }

    for (const target of input.savingsTargets ?? []) {
        if (!overlapsWindow(target.startMonth, target.targetMonth, month, month)) continue
        const demand = emptyDemand()
        demand.money = target.requiredMonthly
        out.push({
            id: `savingsTarget:${target._id}`,
            source: 'savingsTarget',
            recordId: target._id,
            label: target.name,
            pillar: 'money',
            demand,
            basis: 'measured',
            detail: `£${Math.round(target.requiredMonthly)}/mo`,
        })
    }

    for (const course of input.courses ?? []) {
        // A Course records no start date, so it's read as live from the opening of
        // the window until its deadline. A course with no deadline has no span at
        // all and is left off, as it is on the timeline.
        if (!course.targetDate) continue
        const deadlineMonth = monthKeyOf(course.targetDate)
        if (month > deadlineMonth) continue
        const remaining = Math.max(0, course.requiredHours - course.completedHours)
        // Hours left spread over the months left, so the rate rises as the deadline
        // closes — which is what actually happens, and worth seeing before it does.
        const perWeek = Math.min(
            MAX_COURSE_HOURS,
            remaining / (monthsUntil(month, deadlineMonth) * weeks)
        )
        const demand = emptyDemand()
        demand.time = perWeek
        demand.focus = FOCUS_COSTS.course
        out.push({
            id: `course:${course._id}`,
            source: 'course',
            recordId: course._id,
            label: course.name,
            pillar: 'study',
            demand,
            basis: 'measured',
            detail:
                remaining > 0
                    ? `${remaining}h left · ${round(perWeek, 1)}h/wk to the deadline`
                    : 'Complete',
        })
    }

    for (const note of input.monthNotes ?? []) {
        if (!overlapsWindow(note.startMonth, note.endMonth, month, month)) continue
        const demand = emptyDemand()
        demand.time = MONTH_NOTE_HOURS
        demand.focus = FOCUS_COSTS.monthNote
        out.push({
            id: `monthNote:${note._id}`,
            source: 'monthNote',
            recordId: note._id,
            label: note.label,
            pillar: 'life',
            demand,
            basis: 'assumed',
            detail: note.note,
        })
    }

    for (const goal of input.goals ?? []) {
        if (!goal.targetDate || goal.status !== 'active') continue
        if (monthKeyOf(goal.targetDate) !== month) continue
        const demand = emptyDemand()
        demand.focus = FOCUS_COSTS.goalDeadline
        out.push({
            id: `goal:${goal._id}`,
            source: 'goal',
            recordId: goal._id,
            label: goal.title,
            pillar: 'life',
            demand,
            basis: 'measured',
            detail: 'Deadline lands this month',
        })
    }

    return out
}

function round(n: number, dp: number): number {
    const f = 10 ** dp
    return Math.round(n * f) / f
}

/**
 * How much of the body ceiling this month's eating takes away.
 *
 * Only a deficit, and only for the share of the month it actually covers — a cut
 * starting on the 20th has taken three weeks off nothing.
 */
function recoveryAdjustments(
    input: LoadInput,
    month: string,
    contributors: LoadContributor[]
): CapacityAdjustment[] {
    const out: CapacityAdjustment[] = []

    for (const phase of input.nutritionPhases ?? []) {
        if (!overlapsWindow(monthKeyOf(phase.startDate), monthKeyOf(phase.endDate), month, month))
            continue
        const deficit = phaseDeficit(phase, input.maintenanceKcal)
        if (!deficit || deficit <= 0) continue

        const id = `nutritionPhase:${phase._id}`
        if (!contributors.some((c) => c.id === id)) continue

        const coverage = coverageOf(month, phase.startDate, phase.endDate)
        const cost = (deficit / 500) * RECOVERY_COST_PER_500 * coverage
        out.push({
            contributorId: id,
            label: phase.name,
            factor: Math.max(MIN_RECOVERY_FACTOR, 1 - cost),
            detail: `−${Math.round(deficit)} kcal/day leaves less to recover with`,
        })
    }

    return out
}

/** Roll a month's contributors up into one reserve. */
function rollUp(
    reserve: Reserve,
    contributors: LoadContributor[],
    capacity: Capacity,
    adjustments: CapacityAdjustment[] = []
): ReserveLoad {
    const contributions = contributors
        .map((contributor) => ({ contributor, amount: contributor.demand[reserve] }))
        .filter((c) => c.amount > 0)
        .sort((a, b) => b.amount - a.amount || a.contributor.label.localeCompare(b.contributor.label))

    const demand = contributions.reduce((sum, c) => sum + c.amount, 0)
    const assumed = contributions
        .filter((c) => c.contributor.basis === 'assumed')
        .reduce((sum, c) => sum + c.amount, 0)

    const base = capacity.value
    const adjusted =
        base === null ? null : adjustments.reduce((v, a) => v * a.factor, base)
    const ratio = adjusted && adjusted > 0 ? demand / adjusted : null

    return {
        reserve,
        demand: round(demand, 2),
        baseCapacity: base,
        adjustments,
        capacity: adjusted === null ? null : round(adjusted, 2),
        capacityBasis: capacity.basis,
        ratio: ratio === null ? null : round(ratio, 3),
        level: ratio === null ? null : levelForRatio(ratio),
        contributions,
        assumedShare: demand > 0 ? round(assumed / demand, 2) : 0,
    }
}

/**
 * The pairs that fight rather than merely stack.
 *
 * Every rule here is gated on intensity, not on presence. Cutting while training
 * is ordinary and often the whole point of a season — "Cut & 10K" is a sensible
 * plan — so a rule that fired on the pairing alone would be noise. It fires when
 * the cut is deep *and* the week is heavy, which is the version that actually
 * costs you the block.
 */
function findConflicts(
    month: string,
    contributors: LoadContributor[],
    reserves: Record<Reserve, ReserveLoad>,
    input: LoadInput
): Conflict[] {
    const conflicts: Conflict[] = []
    const phases = (input.nutritionPhases ?? []).filter((p) =>
        overlapsWindow(monthKeyOf(p.startDate), monthKeyOf(p.endDate), month, month)
    )

    const cuts = phases.filter((p) => p.kind === 'cut')
    const gains = phases.filter((p) => p.kind === 'gain')
    for (const cut of cuts) {
        for (const gain of gains) {
            conflicts.push({
                kind: 'opposing-phases',
                month,
                between: [`nutritionPhase:${cut._id}`, `nutritionPhase:${gain._id}`],
                title: 'Two phases pulling opposite ways',
                detail: `${cut.name} and ${gain.name} overlap this month. One of them has to move.`,
            })
        }
    }

    const training = contributors.filter((c) => c.source === 'trainingPlan')
    // The union, not the sum — two blocks describing one week are one week.
    const hardSessions = reserves.body.demand
    if (hardSessions >= HEAVY_WEEK_SESSIONS) {
        for (const adjustment of reserves.body.adjustments) {
            if (adjustment.factor > 1 - DEEP_CUT_COST) continue
            conflicts.push({
                kind: 'deep-cut-in-heavy-block',
                month,
                between: [adjustment.contributorId, ...training.map((t) => t.id)],
                title: 'A deep cut under a heavy week',
                detail: `${adjustment.label} takes ${Math.round((1 - adjustment.factor) * 100)}% off what you can recover from, and the week is already asking for ${round(hardSessions, 1)} hard sessions.`,
            })
        }
    }

    const money = reserves.money
    if (money.capacity !== null && money.demand > money.capacity) {
        conflicts.push({
            kind: 'unfundable',
            month,
            between: money.contributions.map((c) => c.contributor.id),
            title: 'Committed beyond what is free',
            detail: `£${Math.round(money.demand)} committed against £${Math.round(money.capacity)} free. This one isn't heavy — it doesn't add up.`,
        })
    }

    return conflicts
}

// ─── Entry points ───────────────────────────────────────────────────────────

/**
 * The load on every month of the plan's window, in order.
 *
 * Reads the same input the timeline is built from, so the two can never disagree
 * about what's live in a month.
 */
export function computeMonthLoads(input: LoadInput): MonthLoad[] {
    const { plan } = input
    const months = monthRange(plan.start, plan.end)
    const base = { ...defaultCapacities(), ...(input.capacities ?? {}) }

    return months.map((month) => {
        const contributors = contributorsForMonth(input, month)

        // Free cash is per-month where the finance rows can say, since income and
        // outgoings both move; the supplied capacity is the fallback for months
        // they can't reach.
        const freeThisMonth = input.freeCash?.[month]
        const capacities: Capacities = {
            ...base,
            money:
                freeThisMonth === undefined
                    ? base.money
                    : { value: freeThisMonth, basis: 'measured' },
        }

        const reserves = {
            time: rollUp('time', contributors, capacities.time),
            body: rollUp(
                'body',
                contributors,
                capacities.body,
                recoveryAdjustments(input, month, contributors)
            ),
            money: rollUp('money', contributors, capacities.money),
            focus: rollUp('focus', contributors, capacities.focus),
        }

        const scorable = RESERVES.map((r) => reserves[r]).filter(
            (r): r is ReserveLoad & { ratio: number; level: LoadLevel } => r.ratio !== null
        )
        const hottest = scorable.reduce<(ReserveLoad & { ratio: number }) | null>(
            (peak, r) => (!peak || r.ratio > peak.ratio ? r : peak),
            null
        )

        return {
            month,
            reserves,
            contributors,
            conflicts: findConflicts(month, contributors, reserves, input),
            peak: hottest && hottest.demand > 0 ? hottest.reserve : null,
            level: hottest && hottest.demand > 0 ? levelForRatio(hottest.ratio) : null,
        }
    })
}

/** Every reserve of a month that is over its capacity, hottest first. */
export function overloadedReserves(load: MonthLoad): ReserveLoad[] {
    return RESERVES.map((r) => load.reserves[r])
        .filter((r) => r.level === 'overloaded')
        .sort((a, b) => (b.ratio ?? 0) - (a.ratio ?? 0))
}

/**
 * The months worth stopping on: something is over capacity, or two commitments
 * are working against each other.
 *
 * The old summed score needed a "at least two commitments" guard, because one
 * heavy thing could carry a month over the line on its own and that isn't a
 * collision. Measuring against a capacity removes the need for it — a single
 * savings target larger than the free cash is a genuine problem, and saying so
 * is the point.
 */
export function findPressurePoints(loads: MonthLoad[]): MonthLoad[] {
    return loads.filter((l) => overloadedReserves(l).length > 0 || l.conflicts.length > 0)
}

/** The most strained month in the window, by its hottest reserve. Undefined if empty. */
export function peakMonth(loads: MonthLoad[]): MonthLoad | undefined {
    const ratioOf = (l: MonthLoad) =>
        l.peak === null ? -1 : (l.reserves[l.peak].ratio ?? -1)
    return loads.reduce<MonthLoad | undefined>(
        (peak, l) => (!peak || ratioOf(l) > ratioOf(peak) ? l : peak),
        undefined
    )
}

/**
 * A season's shape: how much of each reserve it spends at its worst month.
 *
 * A season that runs heavy in one reserve and quiet in the rest is a season with
 * a point. One that runs heavy in three is a wish list, and this is what lets the
 * Seasons tab say so.
 */
export function reserveShape(loads: MonthLoad[]): Record<Reserve, number | null> {
    const shape = {} as Record<Reserve, number | null>
    for (const reserve of RESERVES) {
        const ratios = loads
            .map((l) => l.reserves[reserve].ratio)
            .filter((r): r is number => r !== null)
        shape[reserve] = ratios.length > 0 ? Math.max(...ratios) : null
    }
    return shape
}
