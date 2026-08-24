import { daysInMonth } from './calendar'
import { weekStartOf } from './budget'
import { RESERVES, type Capacities, type Capacity, type MonthLoad, type Reserve } from './lifeLoad'
import type { EntryStatus, FitnessPlanKind } from '../types'

/**
 * Finding out where *your* ceiling actually is.
 *
 * `lifeLoad.ts` ships priors: nine discretionary hours a week, six hard sessions'
 * worth of recovery, three concurrent behaviour changes. They're reasonable and
 * they're not yours. The question worth answering isn't "is six sessions a lot"
 * — it's the one the app is uniquely placed to answer, because it has been
 * keeping the receipts:
 *
 *   **The last time a month looked like this, what happened?**
 *
 * Every month of history carries both halves of that: what was asked of it (the
 * reserve demands, computed the same way as any future month) and what came of
 * it (sessions logged against sessions planned, meals eaten against meals
 * planned, habit ticks landed against ticks available). Put the two together and
 * the ceiling stops being a constant somebody chose and becomes a measurement:
 * the demand past which your own adherence historically falls over.
 *
 * The fit is deliberately the simplest thing that could work — a single split
 * point, chosen to maximise the gap in mean adherence either side of it. Nothing
 * here is trying to be a model of a person. It's trying to say "four of the five
 * months you ran above 8 went badly" with the arithmetic on show, and to say
 * nothing at all when there isn't enough to go on.
 */

// ─── Outcomes ───────────────────────────────────────────────────────────────

/**
 * How much of what a month planned actually happened, 0–1.
 *
 * Pooled rather than kept per pillar: a month that breaks you doesn't break you
 * neatly down one column, and pooling is what lets a body overload show up in
 * missed *meals* as well as missed sessions. Null when the month planned nothing
 * — an empty month is not a perfect one, and scoring it as 1 would drag every
 * ceiling upwards.
 */
export interface MonthOutcome {
    month: string
    adherence: number | null
    /** What the figure rests on, for the "n months" line. */
    signals: number
}

/** The logs a month's adherence is read from. Every array may be empty. */
export interface OutcomeInput {
    /** Training placed on the planner. */
    fitnessEntries: { date: string; kind: FitnessPlanKind }[]
    workoutLogs: { date: string }[]
    conditioningLogs: { date: string }[]
    mealEntries: { date: string; status: EntryStatus }[]
    habitLogs: { date: string; completed: boolean }[]
    /** How many habits were being tracked — the denominator for consistency. */
    habitCount: number
}

/** A ratio, clamped to 1: over-delivery isn't extra credit. */
function ratio(done: number, planned: number): number {
    return planned <= 0 ? 0 : Math.min(1, done / planned)
}

function monthOf(date: string): string {
    return date.slice(0, 7)
}

/**
 * A month's adherence, pooled across every signal that had something to say.
 *
 * Each signal is weighted by how much it was measuring — twenty planned sessions
 * count for more than two — so a month with one planned meal can't swing the
 * figure on its own.
 */
export function monthOutcome(month: string, input: OutcomeInput): MonthOutcome {
    const pairs: { done: number; planned: number }[] = []

    const plannedSessions = input.fitnessEntries.filter(
        (e) => monthOf(e.date) === month && (e.kind === 'workout' || e.kind === 'conditioning')
    ).length
    if (plannedSessions > 0) {
        const logged =
            input.workoutLogs.filter((l) => monthOf(l.date) === month).length +
            input.conditioningLogs.filter((l) => monthOf(l.date) === month).length
        pairs.push({ done: logged, planned: plannedSessions })
    }

    const meals = input.mealEntries.filter((e) => monthOf(e.date) === month)
    if (meals.length > 0) {
        pairs.push({ done: meals.filter((e) => e.status === 'eaten').length, planned: meals.length })
    }

    if (input.habitCount > 0) {
        const [year, m] = month.split('-').map(Number)
        const available = input.habitCount * daysInMonth(year, m - 1)
        const done = input.habitLogs.filter((l) => monthOf(l.date) === month && l.completed).length
        pairs.push({ done, planned: available })
    }

    if (pairs.length === 0) return { month, adherence: null, signals: 0 }

    const planned = pairs.reduce((sum, p) => sum + p.planned, 0)
    const done = pairs.reduce((sum, p) => sum + Math.min(p.done, p.planned), 0)
    return { month, adherence: ratio(done, planned), signals: pairs.length }
}

// ─── The volume baseline ────────────────────────────────────────────────────

/** How far back the volume baseline looks. */
export const VOLUME_WEEKS = 12

/** Weeks a volume has to have been hit in before it counts as sustained. */
export const SUSTAINED_WEEKS = 3

/**
 * How far above your proven volume the ceiling sits.
 *
 * Sustaining a volume is evidence it's *under* your ceiling, not at it — so a
 * capacity set equal to what you already do would score your ordinary week at
 * 100% and call it an overload every time. One session of headroom is the
 * smallest honest gap.
 */
export const VOLUME_HEADROOM = 1

/** `n` days before a YYYY-MM-DD. */
function daysBefore(date: string, n: number): string {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() - n)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The training volume you have actually proven you can carry, plus headroom.
 *
 * This is the honest answer to "is five hard sessions a week a lot" — it isn't a
 * number anyone can pick for you, and the shipped default of six is a guess
 * about people in general. What isn't a guess is that you have done this before:
 * the busiest week you have repeatedly managed is a measurement, available from
 * the first month of logs rather than after the eight the adherence fit needs.
 *
 * "Repeatedly" is doing real work. One freak week says nothing about a ceiling,
 * so a volume only counts once it has been hit in `SUSTAINED_WEEKS` separate
 * weeks. Weeks with nothing logged are left in the denominator on purpose —
 * a fortnight off doesn't raise your ceiling, and it shouldn't lower it either.
 *
 * Returns null when there isn't enough logged to say, leaving the prior in place.
 */
export function sustainedVolume(
    logs: { date: string }[],
    today: string,
    weeks = VOLUME_WEEKS
): number | null {
    const since = daysBefore(today, weeks * 7)
    const perWeek = new Map<string, number>()
    for (const log of logs) {
        if (log.date < since || log.date > today) continue
        const week = weekStartOf(log.date)
        perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
    }
    if (perWeek.size < SUSTAINED_WEEKS) return null

    const counts = [...perWeek.values()]
    const highest = Math.max(...counts)
    for (let v = highest; v >= 1; v--) {
        if (counts.filter((c) => c >= v).length >= SUSTAINED_WEEKS) return v + VOLUME_HEADROOM
    }
    return null
}

// ─── Fitting ────────────────────────────────────────────────────────────────

/** One month of history: what was asked of it, and what came of it. */
export interface Sample {
    month: string
    demand: number
    adherence: number
}

/** A fitted ceiling for one reserve, with the arithmetic that produced it. */
export interface ReserveCalibration {
    reserve: Reserve
    /** The demand at or above which adherence historically falls away. */
    ceiling: number
    /**
     * Typical adherence at or above the ceiling, and below it. Both 0–1.
     *
     * Medians, not means. A bucket only has to hold three months, and one
     * catastrophic month — an injury, a fortnight in hospital — would drag a
     * three-month mean far enough to invent a ceiling out of two good months
     * standing next to a bad one. The median ignores it, which is the right
     * instinct: a ceiling is a claim about what usually happens.
     */
    above: number
    below: number
    monthsAbove: number
    monthsBelow: number
    /** below − above: how much worse the heavy months went. */
    drop: number
}

/** Why a reserve couldn't be calibrated. Both keep the shipped prior in place. */
export type CalibrationGap = 'not-enough-history' | 'no-clear-break'

/** Months of history below which no fit is attempted at all. */
export const MIN_MONTHS = 8

/** Months required on each side of a split, so one bad month can't set a ceiling. */
export const MIN_BUCKET = 3

/**
 * How much worse the heavy months have to have gone before a split counts.
 *
 * Ten points of adherence is about the difference between a month you'd call
 * good and one you'd call patchy. Below that the split is noise, and reporting
 * it as a personal ceiling would be worse than the prior it replaced.
 */
export const MIN_DROP = 0.1

/**
 * How close a split has to be to the best one to count as explaining the history
 * just as well.
 *
 * Two split points often separate the same months almost identically, and the
 * arithmetic picks between them on a rounding error. Where that happens the
 * higher ceiling wins: a ceiling set too low nags about months that went
 * perfectly well, and an alarm that cries wolf is worse than no alarm.
 */
export const TIE_MARGIN = 0.05

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * The demand at which this reserve's adherence breaks, if it breaks anywhere.
 *
 * Every observed demand is tried as a split point and scored by how much worse
 * the months above it typically went. `MIN_BUCKET`, `MIN_DROP` and the median are
 * all doing the same job: without them the winning split is always whatever
 * isolates the single worst month, which is a fact about that month and not a
 * ceiling. `TIE_MARGIN` then settles the near-draws in favour of the more
 * generous reading.
 *
 * Months where the reserve wasn't being spent at all are left out — they say
 * nothing about a ceiling, and there are usually enough of them to swamp the
 * months that do.
 */
export function calibrateReserve(
    reserve: Reserve,
    samples: Sample[]
): ReserveCalibration | CalibrationGap {
    const usable = samples.filter((s) => s.demand > 0)
    if (usable.length < MIN_MONTHS) return 'not-enough-history'

    const candidates = [...new Set(usable.map((s) => s.demand))].sort((a, b) => a - b)
    const qualifying: ReserveCalibration[] = []

    for (const ceiling of candidates) {
        const above = usable.filter((s) => s.demand >= ceiling)
        const below = usable.filter((s) => s.demand < ceiling)
        if (above.length < MIN_BUCKET || below.length < MIN_BUCKET) continue

        const aboveTypical = median(above.map((s) => s.adherence))
        const belowTypical = median(below.map((s) => s.adherence))
        const drop = belowTypical - aboveTypical
        if (drop < MIN_DROP) continue

        qualifying.push({
            reserve,
            ceiling,
            above: aboveTypical,
            below: belowTypical,
            monthsAbove: above.length,
            monthsBelow: below.length,
            drop,
        })
    }

    if (qualifying.length === 0) return 'no-clear-break'

    const bestDrop = Math.max(...qualifying.map((q) => q.drop))
    return qualifying
        .filter((q) => q.drop >= bestDrop - TIE_MARGIN)
        .reduce((best, q) => (q.ceiling > best.ceiling ? q : best))
}

export type Calibration = Partial<Record<Reserve, ReserveCalibration>>

/**
 * Fit every reserve it can, from months that have both a load and an outcome.
 *
 * `loads` and `outcomes` are matched by month, so a month with no logs simply
 * doesn't take part rather than counting as a failure.
 */
export function calibrate(loads: MonthLoad[], outcomes: MonthOutcome[]): Calibration {
    const byMonth = new Map(outcomes.map((o) => [o.month, o]))
    const out: Calibration = {}

    for (const reserve of RESERVES) {
        const samples: Sample[] = []
        for (const load of loads) {
            const outcome = byMonth.get(load.month)
            if (!outcome || outcome.adherence === null) continue
            samples.push({
                month: load.month,
                demand: load.reserves[reserve].demand,
                adherence: outcome.adherence,
            })
        }
        const fitted = calibrateReserve(reserve, samples)
        if (typeof fitted !== 'string') out[reserve] = fitted
    }

    return out
}

/**
 * Fitted ceilings as capacity overrides, ready to hand back to `computeMonthLoads`.
 *
 * A fitted ceiling is the demand at which things started going wrong, which is
 * exactly what a capacity is meant to be — so it replaces the prior directly, and
 * says so through its `calibrated` basis rather than quietly.
 */
export function capacitiesFrom(calibration: Calibration): Partial<Capacities> {
    const out: Partial<Capacities> = {}
    for (const reserve of RESERVES) {
        const fitted = calibration[reserve]
        if (!fitted) continue
        out[reserve] = { value: fitted.ceiling, basis: 'calibrated' } satisfies Capacity
    }
    return out
}

/** The evidence for a ceiling, in a line the Pressure tab can print as-is. */
export function explain(calibration: ReserveCalibration): string {
    const pct = (n: number) => `${Math.round(n * 100)}%`
    return `${calibration.monthsAbove} months at or above ${Math.round(calibration.ceiling * 10) / 10} typically ran at ${pct(calibration.above)} adherence, against ${pct(calibration.below)} across the ${calibration.monthsBelow} below it.`
}
