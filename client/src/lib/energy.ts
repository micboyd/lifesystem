import type { DailyEnergy, MealPlanEntry, NutritionPhaseKind } from '../types'
import { entryMacros } from './nutrition'
import { daysBetween, weeklyRate, type TrendPoint } from './weightTrend'

/**
 * Calories in against calories out.
 *
 * Two separate questions live here and they are deliberately kept apart:
 *
 *   - **Target adherence** — did you eat what the phase said to eat.
 *   - **Energy balance** — was the day actually a deficit or a surplus.
 *
 * They come apart all the time. Hit 2,100 kcal exactly on a day you barely moved
 * and you've nailed the target while sitting at maintenance. Only the second one
 * moves bodyweight; only the first one is under your direct control. A day view
 * that collapsed them into one verdict would be lying about one of them.
 *
 * Both are read through the phase's mode, because the colours invert: a surplus
 * is the whole point of a bulk and the failure of a cut, and eating under target
 * is a bulk's characteristic failure while being unremarkable on a cut.
 */

/**
 * Energy in a kilogram of bodyweight change, in kcal. The familiar 7,700 —
 * roughly a kilo of adipose tissue. It's an approximation and it drifts (early
 * cut weeks shed water, bulks add some lean mass), which is exactly why the
 * maintenance figure below is measured from your own data rather than assumed.
 */
export const KCAL_PER_KG = 7700

/** Below this, a day's imbalance is rounding rather than a deficit or surplus. */
export const NEUTRAL_BAND = 50

/**
 * Days of logged intake needed before maintenance is worth quoting. Three weeks
 * of eating against a fortnight of scale movement is about the point where the
 * water noise stops dominating; quoting a figure sooner invites you to act on it.
 */
export const MIN_INTAKE_DAYS = 14

/** How far back the maintenance estimate looks. */
export const MAINTENANCE_WINDOW_DAYS = 28

/** A day's logged intake, keyed by date. */
export type IntakeByDate = Map<string, number>

/**
 * Calories actually eaten on each day, from entries marked 'eaten'.
 *
 * Days where nothing was marked eaten are left out entirely rather than recorded
 * as zero — a day you didn't log looks identical to a day you didn't eat, and
 * treating it as zero would drag the average down and overstate your deficit.
 * The cost is that forgetting to log looks like not existing, which is the safer
 * of the two failures.
 */
export function dailyIntake(entries: MealPlanEntry[]): IntakeByDate {
    const byDate: IntakeByDate = new Map()
    for (const e of entries) {
        if (e.status !== 'eaten') continue
        const kcal = entryMacros(e).calories
        byDate.set(e.date, (byDate.get(e.date) ?? 0) + kcal)
    }
    return byDate
}

/** Why a maintenance estimate couldn't be produced. */
export type MaintenanceGap = 'not-enough-intake' | 'not-enough-weight'

export interface Maintenance {
    /** Estimated daily maintenance calories. */
    kcal: number
    /** Mean logged intake across the window. */
    avgIntake: number
    /** Trend rate over the same window, kg/week (negative = losing). */
    rateKgPerWeek: number
    /** Days of logged intake the estimate rests on. */
    days: number
}

/**
 * Maintenance calories measured from your own data: what you ate, and what the
 * scale did about it.
 *
 *   maintenance = average intake − the daily imbalance the trend implies
 *
 * Losing half a kilo a week on 2,000 kcal means those 2,000 were about 550 short
 * of maintenance, so maintenance is roughly 2,550. This beats every predictive
 * formula available, because it needs to know nothing about your height, age or
 * how hard you think you train — it reads the answer off the only instrument
 * that can't be argued with.
 *
 * Returns a gap reason instead of a number when there isn't enough to go on. A
 * confidently wrong maintenance figure is worse than an absent one: it's the
 * number every calorie target downstream gets built from.
 */
export function measuredMaintenance(
    intake: IntakeByDate,
    points: TrendPoint[],
    windowDays = MAINTENANCE_WINDOW_DAYS,
    today?: string
): Maintenance | MaintenanceGap {
    // Anchor the window to the last thing that happened, so the estimate doesn't
    // evaporate the moment you stop logging for a few days.
    const lastIntake = [...intake.keys()].sort().pop()
    const lastPoint = points.length ? points[points.length - 1].date : undefined
    const anchor = today ?? [lastIntake, lastPoint].filter(Boolean).sort().pop()
    if (!anchor) return 'not-enough-intake'

    const inWindow: number[] = []
    for (const [date, kcal] of intake) {
        const age = daysBetween(date, anchor)
        if (age >= 0 && age < windowDays) inWindow.push(kcal)
    }
    if (inWindow.length < MIN_INTAKE_DAYS) return 'not-enough-intake'

    const rate = weeklyRate(points, windowDays)
    if (rate === null) return 'not-enough-weight'

    const avgIntake = inWindow.reduce((a, b) => a + b, 0) / inWindow.length
    const dailyImbalance = (rate * KCAL_PER_KG) / 7

    return {
        kcal: avgIntake - dailyImbalance,
        avgIntake,
        rateKgPerWeek: rate,
        days: inWindow.length,
    }
}

/** Whether the day's "out" figure was entered or inferred. */
export type BurnSource = 'logged' | 'maintenance' | 'unknown'

export interface DayEnergy {
    /** Calories marked eaten so far today. */
    eaten: number
    /** Calories still planned but not yet settled — the rest of the day as written. */
    pending: number
    /** eaten + pending: where the day lands if the plan is followed. */
    projected: number
    /** The day's expenditure, logged or fallen back to maintenance. */
    out: number | null
    source: BurnSource
    /**
     * eaten − out. Negative is a deficit. Null when there's no burn figure at
     * all. Note this reads low all morning by construction — see `projectedBalance`.
     */
    balance: number | null
    /**
     * projected − out: where the balance lands if the day goes to plan. This is
     * the figure worth acting on before the day is over. At nine in the morning
     * `balance` says you're 2,400 down, which is true and useless.
     */
    projectedBalance: number | null
}

/**
 * Pull one day together: what's been eaten, what's still coming, what's going
 * out, and the gap.
 */
export function dayEnergy(
    entries: MealPlanEntry[],
    logged: DailyEnergy | null,
    maintenance: Maintenance | MaintenanceGap
): DayEnergy {
    let eaten = 0
    let pending = 0
    for (const e of entries) {
        const kcal = entryMacros(e).calories
        if (e.status === 'eaten') eaten += kcal
        else if (e.status === 'planned') pending += kcal
    }
    const projected = eaten + pending

    let out: number | null = null
    let source: BurnSource = 'unknown'
    if (logged) {
        out = logged.caloriesOut
        source = 'logged'
    } else if (typeof maintenance === 'object') {
        out = maintenance.kcal
        source = 'maintenance'
    }

    return {
        eaten,
        pending,
        projected,
        out,
        source,
        balance: out === null ? null : eaten - out,
        projectedBalance: out === null ? null : projected - out,
    }
}

/**
 * How a figure reads against the plan. Deliberately coarse — the point is a
 * colour and a glance, not a score.
 */
export type Verdict = 'good' | 'warn' | 'bad' | 'none'

/**
 * How much either side of a calorie target still counts as hitting it. A flat
 * band would be far too tight on a 3,500 kcal bulk and far too loose on a 1,600
 * kcal cut, so it scales, with a floor for the small numbers.
 */
export function targetTolerance(target: number): number {
    return Math.max(100, target * 0.05)
}

/**
 * Did you eat what the phase asked for — read through the phase's mode.
 *
 * The asymmetry is the whole point. Overshooting is a cut's failure and a bulk's
 * mild excess; undershooting is a bulk's failure and, on a cut, mostly fine
 * until it becomes under-eating. A single "did you hit the number" verdict would
 * be exactly backwards for one of the two modes.
 */
export function targetVerdict(
    eaten: number,
    target: number | undefined,
    kind: NutritionPhaseKind | null
): Verdict {
    if (!target || target <= 0) return 'none'

    const tol = targetTolerance(target)
    const diff = eaten - target
    if (Math.abs(diff) <= tol) return 'good'

    const far = Math.abs(diff) > tol * 2

    if (diff > 0) {
        // Over target.
        if (kind === 'gain') return far ? 'warn' : 'good'
        if (kind === 'maintain') return 'warn'
        return 'bad' // cut, or no phase — over is the thing you were avoiding
    }

    // Under target.
    if (kind === 'gain') return 'bad'
    if (kind === 'maintain') return 'warn'
    return far ? 'warn' : 'good' // cut: a little under is fine, a lot is under-eating
}

/**
 * Was the day's energy balance the one the phase wanted. Same inversion: a
 * surplus is a bulk working and a cut failing.
 */
export function balanceVerdict(
    balance: number | null,
    kind: NutritionPhaseKind | null
): Verdict {
    if (balance === null) return 'none'

    const neutral = Math.abs(balance) <= NEUTRAL_BAND

    if (kind === 'gain') {
        if (neutral) return 'warn'
        return balance > 0 ? 'good' : 'bad'
    }
    if (kind === 'maintain') {
        return Math.abs(balance) <= 200 ? 'good' : 'warn'
    }
    // Cut, or no phase set: a deficit is the objective either way.
    if (neutral) return 'warn'
    return balance < 0 ? 'good' : 'bad'
}

/**
 * The weekly weight change a sustained daily balance implies, in kg/week. Turns
 * an abstract "−480 kcal" into "about half a kilo a week", which is the unit the
 * goal was set in and the only one worth checking against intent.
 */
export function impliedWeeklyRate(balance: number | null): number | null {
    if (balance === null) return null
    return (balance * 7) / KCAL_PER_KG
}
