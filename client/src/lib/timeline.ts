import type {
    BodyGoals,
    BodyProfile,
    ConditioningLog,
    MealPlanEntry,
    NutritionPhase,
    NutritionPhaseKind,
    TimelineQuiz,
    TrainingAge,
    TrainingPlan,
    WeightLog,
    WorkoutLog,
} from '../types'
import { addDays } from './calendar'
import { ageOn, mifflinStJeor } from './bmr'
import { dailyIntake, targetVerdict } from './energy'
import { phaseFor, phaseTargetsOn, targetsFor } from './nutrition'
import { KEY_LIFTS, liftTrend, sessionBests, type LiftKey, type SessionBest } from './strengthTrend'
import { bodyFatSeries, daysBetween, trendSeries } from './weightTrend'

/**
 * The Timeline: where the plans could take you, week by week, until the last
 * one ends.
 *
 * It is a projection, built in two layers:
 *
 *   1. **The plans, as written.** From the first view there is a full timeline:
 *      each day's calorie target comes from the nutrition phase on that day, each
 *      day's training from the training plans' schedules, and each day's burn from
 *      BMR (Mifflin–St Jeor at the projected weight) plus activity and sessions.
 *      The quiz says how much of the plan actually happens.
 *   2. **Your own data.** Once there are a couple of weeks of weigh-ins, the last
 *      four are replayed through the same model and the gap between what it
 *      predicted and what the trend did becomes a standing kcal/day correction.
 *      Lifts do the same against their own six-week trend, and the quiz's
 *      adherence gives way to what the logs show: sessions done against the
 *      schedule, days eaten on target against days logged. Every new weigh-in or
 *      logged session moves the projection; nothing has to be pressed.
 *
 * Weight is split into fat and lean so body fat can be projected honestly: lean
 * gain is capped by training age and the energy balance, and only what's left of
 * the balance moves fat. Water is tracked separately — creatine and glycogen move
 * the scale by a kilo without touching fat, and saying so in advance is half the
 * point of a motivational timeline.
 *
 * Everything here is pure: no fetching, no dates read from the clock.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * kcal per kg of fat mass lost or gained. Adipose tissue is ~87% lipid at
 * ~9,400 kcal/kg, so ~8,000 — higher than the familiar 7,700, which quietly
 * assumes some lean tissue goes too. Lean mass is modelled on its own here.
 */
export const FAT_KCAL_PER_KG = 8000

/** kcal to lay down a kg of lean tissue (mostly water; the cost is synthesis). */
export const LEAN_KCAL_PER_KG = 1800

/** Non-exercise multiplier on BMR by daily activity (includes digesting food). */
export const ACTIVITY_FACTOR = { low: 1.2, some: 1.3, active: 1.4, very: 1.5 } as const

/** Burn per session, kcal, before adherence. Deliberately modest. */
export const SESSION_KCAL = { strength: 220, cardio: 350 } as const

/** Upper bound of lean gain per month, kg, for men; women get ~55%. */
export const LEAN_GAIN_PER_MONTH: Record<TrainingAge, number> = {
    beginner: 0.9,
    intermediate: 0.45,
    advanced: 0.2,
}

/** Strength gain per week on a key lift, %, in good conditions. */
export const STRENGTH_GAIN_PER_WEEK: Record<TrainingAge, number> = {
    beginner: 1.2,
    intermediate: 0.4,
    advanced: 0.15,
}

export const PROTEIN_FACTOR = { always: 1, mostly: 0.85, rarely: 0.6 } as const
export const SLEEP_FACTOR = { under6: 0.8, '6to7': 0.9, '7to8': 1, over8: 1.05 } as const

/** Scale water from a full creatine load, kg. */
export const CREATINE_WATER_KG = 1
/** Scale water that leaves at the start of a cut and returns after it, kg. */
export const GLYCOGEN_WATER_KG = 0.8

/** How wrong a predicted burn can be, as a fraction, before and after calibration. */
const BURN_ERROR = { uncalibrated: 0.025, calibrated: 0.012 }

/** Days of weigh-ins needed before the trend can correct the model. */
export const MIN_CALIBRATION_DAYS = 14
/** The calibration window. */
export const CALIBRATION_WINDOW_DAYS = 28
/** Largest correction ever applied, kcal/day. */
const MAX_OFFSET = 600

/** How far back measured adherence looks, and the evidence at which it's fully trusted. */
export const ADHERENCE_WINDOW_DAYS = 28
/** Days of evidence before a measured adherence is used at all. */
export const MIN_ADHERENCE_DAYS = 7

/** The weight a lift's own six-week trend carries against the model. */
const LIFT_TREND_WEIGHT = 0.4

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimelineInputs {
    /** "YYYY-MM-DD". */
    today: string
    /** Training plans, with `schedule`. */
    plans: TrainingPlan[]
    phases: NutritionPhase[]
    weightLogs: WeightLog[]
    workoutLogs: WorkoutLog[]
    /** For measured training adherence, alongside workoutLogs. */
    conditioningLogs?: ConditioningLog[]
    /** The meal plan over at least the last four weeks, for measured nutrition adherence. */
    mealEntries?: MealPlanEntry[]
    profile: BodyProfile | undefined
    quiz: TimelineQuiz
    bodyGoals?: BodyGoals
}

/** What's missing before a timeline can be drawn. */
export type TimelineGap = 'training-plan' | 'nutrition-plan' | 'body-profile' | 'weigh-in'

/** A projected figure and its likely spread. */
export interface Range {
    mid: number
    low: number
    high: number
}

export type MilestoneKind = 'plan' | 'fat' | 'muscle' | 'strength' | 'water' | 'goal' | 'progress'

export interface Milestone {
    date: string
    kind: MilestoneKind
    title: string
    detail: string
}

export interface LiftProjection {
    lift: LiftKey
    label: string
    /** Estimated 1RM, kg. */
    range: Range
}

export interface TimelineWeek {
    /** 1-based. */
    index: number
    /** First and last day the week covers. The snapshot is taken on `end`. */
    start: string
    end: string
    phase: { name: string; kind: NutritionPhaseKind } | null
    /** Training plans running this week. */
    training: string[]
    strengthSessions: number
    cardioSessions: number
    /** Planned daily calories (from the phase), averaged. Null outside any phase. */
    targetKcal: number | null
    /** Daily balance after adherence and calibration, averaged. */
    balanceKcal: number
    weight: Range
    bodyFat: Range
    /** Cumulative since today, kg. */
    fatChange: number
    leanChange: number
    lifts: LiftProjection[]
    /** Main lifts as a % change since today, for when no lift has a baseline. */
    strengthPct: number
    milestones: Milestone[]
}

export type BodyFatSource = 'logged' | 'quiz' | 'estimated'

export interface TimelineStart {
    weight: number
    bodyFat: number
    bodyFatSource: BodyFatSource
    lifts: { lift: LiftKey; label: string; kg: number; from: string }[]
}

export interface Calibration {
    /** Correction added to every day's balance, kcal/day. */
    offsetKcal: number
    /** 0–1: how much the correction is trusted. */
    weight: number
    spanDays: number
    /** kg/week, net of water. */
    observedRate: number
    predictedRate: number
}

export interface TimelineEnd {
    weight: Range
    bodyFat: Range
    fatChange: number
    leanChange: number
    lifts: LiftProjection[]
    strengthPct: number
}

/** One plan's adherence: what the quiz said, what the logs show, and the blend the projection runs on. */
export interface AdherenceReading {
    stated: number
    /** Null until there are MIN_ADHERENCE_DAYS of evidence. */
    measured: number | null
    /** Training: sessions done and scheduled. Nutrition: days on target and days logged. */
    hit: number
    total: number
    /** Days of evidence: days a training plan ran, or days with food logged. */
    days: number
    /** 0–1: the share of the blend the measured figure carries. */
    weight: number
    /** What the projection uses. */
    used: number
}

export interface Adherence {
    training: AdherenceReading
    nutrition: AdherenceReading
}

/** One change worth making, and what it does to the finish. */
export interface Suggestion {
    key: string
    title: string
    detail: string
    final: TimelineEnd
    /** How much better the finish is: body-fat points lower on a cut, lean kg higher on a build. */
    gain: number
    measure: 'bodyFat' | 'lean'
    /**
     * The week-end the goal is first reached, or null when it isn't. Extra effort
     * past the goal means getting there sooner and then holding — not cutting on
     * past it — so this, not the finish, is what's worth showing.
     */
    reaches: string | null
}

/**
 * A week already lived, from the start of the plans to last week: what the
 * records say happened, so the whole timeline stays visible. Null where nothing
 * was measured that week.
 */
export interface PastWeek {
    index: number
    start: string
    end: string
    phase: { name: string; kind: NutritionPhaseKind } | null
    training: string[]
    strengthSessions: number
    cardioSessions: number
    targetKcal: number | null
    /** Weigh-in trend at the last reading that week. */
    weight: number | null
    /** Body-fat trend at the last reading that week. */
    bodyFat: number | null
    /** Best estimated 1RM logged that week, for the projected lifts. */
    lifts: { lift: LiftKey; label: string; kg: number | null }[]
}

export interface Timeline {
    /** Today — where the projection starts. */
    start: string
    /** The first day of the earliest plan still running; the timeline is drawn from here. */
    chainStart: string
    /** Weeks from `chainStart` up to the one before this week. */
    past: PastWeek[]
    end: string
    initial: TimelineStart
    weeks: TimelineWeek[]
    final: TimelineEnd
    /** Null until there are enough weigh-ins. */
    calibration: Calibration | null
    /** Stated against measured adherence; `used` is what every run but "all in" projects. */
    adherence: Adherence
    /** The same plans followed to the letter — only when the adherence used says otherwise. */
    perfect: { weeks: TimelineWeek[]; final: TimelineEnd } | null
    /** What would move the result most, each measured by re-running the projection. */
    suggestions: Suggestion[]
    /** Every suggestion at once. Null when there are none. */
    combined: Suggestion | null
    /** Where the burn came from before weigh-ins correct it. */
    burn: BurnAnchor
    /** The goal the plans are aiming at: the last phase's, else Profile's. */
    goal: { weightKg: number | null; bodyFatPct: number | null; date: string | null }
    /** Stretches of a fortnight or more inside the window with no training plan. */
    trainingGaps: { start: string; end: string }[]
    plans: {
        /** The TrainingPlan or NutritionPhase id, for opening it. */
        id: string
        name: string
        start: string
        end: string
        type: 'training' | 'nutrition'
        kind?: NutritionPhaseKind
    }[]
}

// ── Readiness ────────────────────────────────────────────────────────────────

/** Plans still running or yet to start. */
export function livePlans(plans: TrainingPlan[], today: string): TrainingPlan[] {
    return plans.filter((p) => p.planEnd >= today)
}

export function livePhases(phases: NutritionPhase[], today: string): NutritionPhase[] {
    return phases.filter((p) => p.endDate >= today)
}

export function timelineGaps(
    today: string,
    plans: TrainingPlan[],
    phases: NutritionPhase[],
    profile: BodyProfile | undefined,
    weightLogs: WeightLog[]
): TimelineGap[] {
    const gaps: TimelineGap[] = []
    if (livePlans(plans, today).length === 0) gaps.push('training-plan')
    if (livePhases(phases, today).length === 0) gaps.push('nutrition-plan')
    if (!profile?.heightCm || !profile.birthDate || !profile.sex) gaps.push('body-profile')
    if (weightLogs.length === 0) gaps.push('weigh-in')
    return gaps
}

// ── Model context ────────────────────────────────────────────────────────────

interface DaySessions {
    strength: number
    cardio: number
}

interface Context {
    profile: Required<BodyProfile>
    quiz: TimelineQuiz
    phases: NutritionPhase[]
    sessions: Map<string, DaySessions>
    plans: TrainingPlan[]
    /** Adherence the run uses — the quiz's, or 1 for the "to the letter" run. */
    trainingAdherence: number
    nutritionAdherence: number
    /** Calibration correction, kcal/day. */
    offset: number
    /** Multiplier on the formula burn so it agrees with the nutrition plan (see anchorBurn). */
    burnScale: number
    /** kcal/day added to every phase target — the "trim 150 kcal" what-if. */
    intakeShift: number
    /** kcal/day added to the burn — the "walk more" what-if. */
    burnShift: number
    water: (date: string) => number
}

/** Every scheduled session by date, de-duplicated across overlapping plans. */
export function sessionsByDate(plans: TrainingPlan[]): Map<string, DaySessions> {
    const seen = new Set<string>()
    const byDate = new Map<string, DaySessions>()
    for (const plan of plans) {
        for (const e of plan.schedule ?? []) {
            const key = `${e.date}|${e.item}|${e.part}`
            if (seen.has(key)) continue
            seen.add(key)
            const day = byDate.get(e.date) ?? { strength: 0, cardio: 0 }
            if (e.role === 'strength') day.strength += 1
            else day.cardio += 1
            byDate.set(e.date, day)
        }
    }
    return byDate
}

/** The last day of any plan still running — where the timeline ends. */
function windowEnd(inputs: TimelineInputs): string {
    const { today } = inputs
    return (
        [
            ...livePlans(inputs.plans, today).map((p) => p.planEnd),
            ...livePhases(inputs.phases, today).map((p) => p.endDate),
        ]
            .sort()
            .pop() ?? today
    )
}

/**
 * Days from today to `to` that no training plan covers get the last four weeks
 * of the most recent plan before them, repeated. Nobody stops training because
 * the next block isn't written yet, and assuming they do turns every cut that
 * outlasts its training plan into a stall. The page says this is assumed.
 */
export function fillTrainingGaps(
    sessions: Map<string, DaySessions>,
    plans: TrainingPlan[],
    from: string,
    to: string
): Map<string, DaySessions> {
    const filled = new Map(sessions)
    const total = daysBetween(from, to)
    for (let d = 0; d <= total; d++) {
        const date = addDays(from, d)
        if (plans.some((p) => p.planStart <= date && p.planEnd >= date)) continue
        const last = plans
            .filter((p) => p.planEnd < date)
            .sort((a, b) => a.planEnd.localeCompare(b.planEnd))
            .pop()
        if (!last) continue
        const span = Math.min(28, daysBetween(last.planStart, last.planEnd) + 1)
        const since = daysBetween(last.planEnd, date) - 1
        // Map back onto the block's final `span` days, keeping the weekday when
        // the span is whole weeks.
        const source = addDays(last.planEnd, -(span - 1) + (since % span))
        const s = sessions.get(source)
        if (s) filled.set(date, s)
    }
    return filled
}

/** Strength sessions in the seven days ending on `date`. */
function strengthThisWeek(ctx: Context, date: string): number {
    let n = 0
    for (let i = 0; i < 7; i++) n += ctx.sessions.get(addDays(date, -i))?.strength ?? 0
    return n
}

/** How much of a full training stimulus a week's sessions give. */
function sessionFactor(perWeek: number): number {
    if (perWeek >= 3) return 1
    if (perWeek === 2) return 0.85
    if (perWeek === 1) return 0.5
    return 0
}

/**
 * Scale water relative to nothing at all, on a date: a creatine load coming
 * in, glycogen leaving at the start of a cut and coming back after it. Only
 * differences are ever used, so what happened before today cancels out.
 */
export function makeWater(quiz: TimelineQuiz, phases: NutritionPhase[]): (date: string) => number {
    const ramps: { from: string; days: number; kg: number }[] = []

    if (quiz.creatine === 'new' && quiz.creatineStart) {
        const dose = quiz.creatineDoseG ?? 5
        const days = quiz.creatineLoading ? 7 : dose >= 3 ? 28 : 42
        const kg = quiz.creatineLoading || dose >= 3 ? CREATINE_WATER_KG : CREATINE_WATER_KG * 0.8
        ramps.push({ from: quiz.creatineStart, days, kg })
    }

    for (const run of cutRuns(phases)) {
        ramps.push({ from: run.start, days: 7, kg: -GLYCOGEN_WATER_KG })
        if (run.refeedAfter) ramps.push({ from: addDays(run.end, 1), days: 7, kg: GLYCOGEN_WATER_KG })
    }

    return (date) => {
        let total = 0
        for (const r of ramps) {
            const t = daysBetween(r.from, date)
            if (t < 0) continue
            total += r.kg * Math.min(1, (t + 1) / r.days)
        }
        return total
    }
}

/**
 * Back-to-back cut phases count as one cut: glycogen leaves once at the start
 * and comes back once at the end, and only if a non-cut phase follows.
 */
export function cutRuns(phases: NutritionPhase[]): { start: string; end: string; refeedAfter: boolean }[] {
    const sorted = [...phases].sort((a, b) => a.startDate.localeCompare(b.startDate))
    const runs: { start: string; end: string; refeedAfter: boolean }[] = []
    let current: { start: string; end: string } | null = null
    for (const p of sorted) {
        const adjacent = current && daysBetween(current.end, p.startDate) <= 2
        if (p.kind === 'cut') {
            if (current && adjacent) current.end = p.endDate > current.end ? p.endDate : current.end
            else {
                if (current) runs.push({ ...current, refeedAfter: false })
                current = { start: p.startDate, end: p.endDate }
            }
        } else if (current) {
            runs.push({ ...current, refeedAfter: !!adjacent })
            current = null
        }
    }
    if (current) runs.push({ ...current, refeedAfter: false })
    return runs
}

/** A phase's daily calorie target on a date, or what its rate implies. */
function targetOn(phase: NutritionPhase, date: string, burn: number): number {
    const kcal = phaseTargetsOn(phase, date).calories
    if (kcal && kcal > 0) return kcal
    const rate =
        phase.weeklyRate ??
        phase.goal?.targetWeeklyRateKg ??
        (phase.kind === 'cut' ? -0.5 : phase.kind === 'gain' ? 0.25 : 0)
    return burn + (rate * 7700) / 7
}

/** What a day off the plan looks like: a bit over maintenance, or under it on a bulk. */
function offPlanIntake(kind: NutritionPhaseKind, burn: number): number {
    if (kind === 'gain') return burn * 0.97
    if (kind === 'maintain') return burn * 1.05
    return burn * 1.1
}

function leanEnergyFactor(balance: number, age: TrainingAge): number {
    if (balance >= 150) return 1
    if (balance >= -150) return { beginner: 0.75, intermediate: 0.45, advanced: 0.25 }[age]
    if (balance >= -500) return { beginner: 0.5, intermediate: 0.2, advanced: 0.05 }[age]
    return { beginner: 0.25, intermediate: 0, advanced: 0 }[age]
}

function strengthEnergyFactor(balance: number): number {
    if (balance >= 150) return 1.15
    if (balance >= -150) return 1
    if (balance >= -500) return 0.7
    return 0.4
}

// ── Simulation ───────────────────────────────────────────────────────────────

interface State {
    fat: number
    lean: number
    /** Consecutive-ish days in a real deficit, for metabolic adaptation. */
    deficitDays: number
    /** Days since the last scheduled strength session. */
    sinceStrength: number
    /** Strength index, 100 = today. */
    strength: number
    lifts: Map<LiftKey, number>
}

interface DayOut {
    burn: number
    target: number | null
    balance: number
}

/**
 * Advance the state one day. `day` counts from the run's first day, for the
 * beginner taper: novice gains are front-loaded and fade over the first year.
 */
function step(state: State, date: string, day: number, ctx: Context, liftRates: Map<LiftKey, number>): DayOut {
    const { profile, quiz } = ctx
    const weight = state.fat + state.lean
    const bmr = mifflinStJeor(weight, profile.heightCm, ageOn(profile.birthDate, date), profile.sex)
    const sessions = ctx.sessions.get(date) ?? { strength: 0, cardio: 0 }
    // Weeks of deficit shave a little more off the burn than the lost weight alone
    // explains. Kept to 3% at most: for a moderate cut that's what's measured, and
    // more would quietly cancel a modest planned deficit.
    const adaptation = Math.min(0.03, (state.deficitDays / 7) * 0.002)
    const burn =
        (bmr * ACTIVITY_FACTOR[quiz.activity] * (1 - adaptation) +
            (sessions.strength * SESSION_KCAL.strength + sessions.cardio * SESSION_KCAL.cardio) *
                ctx.trainingAdherence) *
            ctx.burnScale +
        ctx.burnShift

    const phase = phaseFor(date, ctx.phases)
    let target: number | null = null
    let intake = burn
    if (phase) {
        target = targetOn(phase, date, burn) + ctx.intakeShift
        const a = ctx.nutritionAdherence
        intake = a * target + (1 - a) * offPlanIntake(phase.kind, burn)
    }
    const balance = intake - burn + ctx.offset

    state.deficitDays = balance < -250 ? state.deficitDays + 1 : Math.max(0, state.deficitDays - 2)

    // Lean mass: capped by training age, scaled by how much training there is
    // and how much of it happens, then by the fuel available.
    const perWeek = strengthThisWeek(ctx, date)
    state.sinceStrength = sessions.strength > 0 ? 0 : state.sinceStrength + 1
    const taper = quiz.trainingAge === 'beginner' ? 1 - 0.4 * Math.min(1, day / 365) : 1
    const sexFactor = profile.sex === 'female' ? 0.55 : 1
    const creatine = quiz.creatine === 'no' ? 1 : 1.08
    const habits = PROTEIN_FACTOR[quiz.protein] * SLEEP_FACTOR[quiz.sleep]
    const stimulus = sessionFactor(perWeek) * Math.pow(ctx.trainingAdherence, 1.2)

    let lean = 0
    if (stimulus > 0) {
        lean =
            ((LEAN_GAIN_PER_MONTH[quiz.trainingAge] * 12) / 365) *
            sexFactor *
            taper *
            stimulus *
            habits *
            creatine *
            leanEnergyFactor(balance, quiz.trainingAge)
    } else if (balance < -150) {
        // No lifting through a deficit: some of what comes off is muscle.
        lean = (balance / FAT_KCAL_PER_KG) * 0.2
    }
    // Lean tissue lost gives its energy back, so a little less fat goes with it.
    const fat = (balance - lean * LEAN_KCAL_PER_KG) / FAT_KCAL_PER_KG
    state.lean += lean
    state.fat = Math.max(weight * 0.03, state.fat + fat)

    // Strength: same stimulus, its own energy sensitivity, detraining after a
    // fortnight without a session.
    let pct: number
    if (state.sinceStrength > 14) pct = -0.4 / 7
    else
        pct =
            (STRENGTH_GAIN_PER_WEEK[quiz.trainingAge] / 7) *
            taper *
            stimulus *
            SLEEP_FACTOR[quiz.sleep] *
            (quiz.creatine === 'no' ? 1 : 1.1) *
            strengthEnergyFactor(balance)
    state.strength *= 1 + pct / 100
    for (const [lift, kg] of state.lifts) {
        const observed = liftRates.get(lift)
        const blended = observed === undefined ? pct : pct * (1 - LIFT_TREND_WEIGHT) + (observed / 7) * LIFT_TREND_WEIGHT
        state.lifts.set(lift, kg * (1 + (state.sinceStrength > 14 ? pct : blended) / 100))
    }

    return { burn, target, balance }
}

function makeContext(
    inputs: TimelineInputs,
    offset: number,
    burnScale: number,
    perfect = false,
    intakeShift = 0,
    burnShift = 0
): Context {
    const { profile, quiz, phases, plans } = inputs
    return {
        burnScale,
        intakeShift,
        burnShift,
        profile: profile as Required<BodyProfile>,
        quiz,
        phases,
        plans,
        sessions: fillTrainingGaps(sessionsByDate(plans), plans, inputs.today, windowEnd(inputs)),
        trainingAdherence: perfect ? 1 : quiz.trainingAdherence,
        nutritionAdherence: perfect ? 1 : quiz.nutritionAdherence,
        offset,
        water: makeWater(quiz, phases),
    }
}

// ── What the plan says maintenance is ────────────────────────────────────────

/**
 * Where the burn comes from before any weigh-ins can say.
 *
 * The formula (BMR × activity + sessions) is a population average, and it runs
 * low for big, muscular, active people — a 105 kg prop can burn hundreds more
 * than it predicts. Trusting it over the nutrition plan turns a 2,850 kcal cut
 * into a surplus and projects a cut that gains weight, which is nonsense.
 *
 * So the plan is read back for the maintenance it assumes: its calories plus
 * the deficit its rate (or goal weight and date) implies. The formula burn is
 * scaled to agree with that, so it still moves with weight and sessions. Real
 * weigh-ins then correct both through calibration.
 */
export interface BurnAnchor {
    /**
     * 'goal': solved so the plan, followed fully, lands on its own goal.
     * 'plan': read from the phase's calories and rate. 'formula': no phase sets calories.
     */
    source: 'goal' | 'plan' | 'formula'
    /** For 'goal': which target it was solved against. */
    goalBasis?: 'bodyFat' | 'weight'
    /** False when even a generous maintenance can't reach the goal on these calories. */
    goalReachable?: boolean
    /** Daily maintenance the formula predicts at the start, kcal. */
    formulaKcal: number
    /** Daily maintenance the plan implies, kcal. Null when no phase sets calories. */
    planKcal: number | null
    /** The phase it was read from, and the weekly rate it was read with. */
    phaseName: string | null
    rateKg: number | null
    scale: number
}

/** A phase's intended kg/week, signed, from the most specific thing it says. */
export function plannedRate(phase: NutritionPhase, weight: number, from: string): number {
    const kindDefault = phase.kind === 'cut' ? -0.5 : phase.kind === 'gain' ? 0.25 : 0
    if (phase.kind === 'maintain') return 0
    let rate = phase.weeklyRate ?? phase.goal?.targetWeeklyRateKg ?? null
    const goalKg = phase.goal?.targetWeightKg
    const by = phase.goal?.targetDate ?? phase.endDate
    if (rate === null && goalKg && by > from) {
        const weeks = Math.max(1, daysBetween(from, by) / 7)
        rate = (goalKg - weight) / weeks
    }
    if (rate === null) rate = kindDefault
    // A rate pointing the wrong way for the phase (a cut whose goal is above you)
    // is ignored; one past 1% of bodyweight a week is held to it.
    if (phase.kind === 'cut') return rate < -0.05 ? Math.max(rate, -weight * 0.01) : kindDefault
    return rate > 0.05 ? Math.min(rate, weight * 0.005) : kindDefault
}

export function anchorBurn(inputs: TimelineInputs, weight: number): BurnAnchor {
    const { today, profile, quiz } = inputs
    const sessions = sessionsByDate(inputs.plans)
    const formulaAt = (date: string) => {
        let extra = 0
        for (let i = 0; i < 14; i++) {
            const s = sessions.get(addDays(date, i))
            if (s) extra += s.strength * SESSION_KCAL.strength + s.cardio * SESSION_KCAL.cardio
        }
        const bmr = mifflinStJeor(weight, profile!.heightCm!, ageOn(profile!.birthDate!, date), profile!.sex!)
        return bmr * ACTIVITY_FACTOR[quiz.activity] + extra / 14
    }

    const phase = livePhases(inputs.phases, today)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .find((p) => {
            const from = p.startDate > today ? p.startDate : today
            return (phaseTargetsOn(p, from).calories ?? 0) > 0
        })
    if (!phase) {
        const formulaKcal = formulaAt(today)
        return { source: 'formula', formulaKcal, planKcal: null, phaseName: null, rateKg: null, scale: 1 }
    }

    const from = phase.startDate > today ? phase.startDate : today
    const formulaKcal = formulaAt(from)
    const rateKg = plannedRate(phase, weight, from)
    const planKcal = phaseTargetsOn(phase, from).calories! - (rateKg * 7700) / 7
    const scale = Math.max(0.8, Math.min(1.35, planKcal / formulaKcal))
    return { source: 'plan', formulaKcal, planKcal, phaseName: phase.name, rateKg, scale }
}

// ── Starting point ───────────────────────────────────────────────────────────

/** Body fat older than this isn't used as the starting point. */
const BODY_FAT_FRESH_DAYS = 60

/** Deurenberg's BMI-based estimate — rough, but better than nothing. */
export function estimateBodyFat(weight: number, heightCm: number, age: number, sex: 'male' | 'female'): number {
    const bmi = weight / Math.pow(heightCm / 100, 2)
    return Math.min(50, Math.max(6, 1.2 * bmi + 0.23 * age - 10.8 * (sex === 'male' ? 1 : 0) - 5.4))
}

/** Which key lifts to project: the three logged most in the last four months. */
export function chooseLifts(bests: SessionBest[], today: string): LiftKey[] {
    const since = addDays(today, -120)
    const counts = new Map<LiftKey, number>()
    for (const b of bests) if (b.date >= since && b.date <= today) counts.set(b.lift, (counts.get(b.lift) ?? 0) + 1)
    return [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([lift]) => lift)
}

export function startingPoint(inputs: TimelineInputs): TimelineStart {
    const { today, weightLogs, profile, quiz } = inputs
    const trend = trendSeries(weightLogs.filter((l) => l.date <= today))
    const weight = (trend.length ? trend[trend.length - 1] : trendSeries(weightLogs)[0]).trend

    const fat = bodyFatSeries(weightLogs).filter((p) => p.date <= today)
    const lastFat = fat[fat.length - 1]
    let bodyFat: number
    let bodyFatSource: BodyFatSource
    if (lastFat && daysBetween(lastFat.date, today) <= BODY_FAT_FRESH_DAYS) {
        bodyFat = lastFat.trend
        bodyFatSource = 'logged'
    } else if (quiz.bodyFatPct) {
        bodyFat = quiz.bodyFatPct
        bodyFatSource = 'quiz'
    } else {
        bodyFat = estimateBodyFat(weight, profile!.heightCm!, ageOn(profile!.birthDate!, today), profile!.sex!)
        bodyFatSource = 'estimated'
    }

    const bests = sessionBests(inputs.workoutLogs)
    const lifts = chooseLifts(bests, today).map((lift) => {
        const recent = bests.filter((b) => b.lift === lift && b.date <= today).slice(-3)
        const top = recent.reduce((best, b) => (b.estimatedMaxKg > best.estimatedMaxKg ? b : best))
        return {
            lift,
            label: KEY_LIFTS.find((l) => l.key === lift)!.label,
            kg: top.estimatedMaxKg,
            from: recent[recent.length - 1].date,
        }
    })

    return { weight, bodyFat, bodyFatSource, lifts }
}

// ── Calibration ──────────────────────────────────────────────────────────────

/**
 * Replay the last four weeks of weigh-ins through the model. Whatever the trend
 * did that the model didn't predict — an underestimated burn, weekends eating
 * more than the quiz admitted — becomes a kcal/day correction carried forward,
 * trusted more the longer the span it was measured over.
 */
export function calibrate(inputs: TimelineInputs, bodyFatPct: number, burnScale = 1): Calibration | null {
    const { today, weightLogs } = inputs
    const from = addDays(today, -CALIBRATION_WINDOW_DAYS)
    const points = trendSeries(weightLogs).filter((p) => p.date <= today)
    const window = points.filter((p) => p.date >= from)
    if (window.length < 4) return null
    const first = window[0]
    const last = window[window.length - 1]
    const span = daysBetween(first.date, last.date)
    if (span < MIN_CALIBRATION_DAYS || daysBetween(last.date, today) > 10) return null

    const ctx = makeContext(inputs, 0, burnScale)
    const fat = (first.trend * bodyFatPct) / 100
    const state: State = {
        fat,
        lean: first.trend - fat,
        deficitDays: 0,
        sinceStrength: 0,
        strength: 100,
        lifts: new Map(),
    }
    for (let d = 0; d < span; d++) step(state, addDays(first.date, d), d, ctx, new Map())
    const predicted = state.fat + state.lean - first.trend
    const observed = last.trend - first.trend - (ctx.water(last.date) - ctx.water(first.date))

    const weight = Math.min(1, span / 42) * 0.8
    const raw = ((observed - predicted) * FAT_KCAL_PER_KG) / span
    return {
        offsetKcal: Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, raw * weight)),
        weight,
        spanDays: span,
        observedRate: (observed / span) * 7,
        predictedRate: (predicted / span) * 7,
    }
}

// ── Measured adherence ───────────────────────────────────────────────────────

function reading(stated: number, hit: number, total: number, days: number): AdherenceReading {
    if (days < MIN_ADHERENCE_DAYS || total === 0) return { stated, measured: null, hit, total, days, weight: 0, used: stated }
    const measured = hit / total
    const weight = Math.min(1, days / ADHERENCE_WINDOW_DAYS)
    return { stated, measured, hit, total, days, weight, used: stated * (1 - weight) + measured * weight }
}

/**
 * Training: every session the plans scheduled in the last four weeks (today
 * excluded — it isn't over) against the logs. A session counts as done when
 * the same workout or conditioning session was logged that day or a day either
 * side, since sessions get shuffled; each log settles one session. Four weeks
 * with plans running and not a single log reads as not logging, not as not
 * training, so it isn't measured.
 */
export function measureTraining(inputs: TimelineInputs): AdherenceReading {
    const { today, plans, quiz } = inputs
    const from = addDays(today, -ADHERENCE_WINDOW_DAYS)
    const before = (d: string) => d >= from && d < today

    const seen = new Set<string>()
    const scheduled: { date: string; kind: string; item: string }[] = []
    for (const plan of plans) {
        for (const e of plan.schedule ?? []) {
            const key = `${e.date}|${e.item}|${e.part}`
            if (!before(e.date) || seen.has(key)) continue
            seen.add(key)
            scheduled.push({ date: e.date, kind: e.kind, item: e.item })
        }
    }
    scheduled.sort((a, b) => a.date.localeCompare(b.date))

    // Logs still free to settle a session, by library item.
    const free = new Map<string, string[]>()
    const addLog = (kind: string, item: string | null, date: string) => {
        if (!item) return
        const key = `${kind}|${item}`
        free.set(key, [...(free.get(key) ?? []), date])
    }
    for (const l of inputs.workoutLogs) addLog('workout', l.workout, l.date)
    for (const l of inputs.conditioningLogs ?? []) addLog('conditioning', l.session, l.date)
    const anyLogged =
        inputs.workoutLogs.some((l) => before(l.date)) || (inputs.conditioningLogs ?? []).some((l) => before(l.date))

    let hit = 0
    for (const s of scheduled) {
        const dates = free.get(`${s.kind}|${s.item}`)
        if (!dates) continue
        // Same day first, then the day after, then the day before.
        const i = [0, 1, -1].map((off) => dates.indexOf(addDays(s.date, off))).find((x) => x >= 0)
        if (i === undefined) continue
        dates.splice(i, 1)
        hit += 1
    }

    let days = 0
    for (let d = 0; d < ADHERENCE_WINDOW_DAYS; d++) {
        const date = addDays(from, d)
        if (plans.some((p) => p.planStart <= date && p.planEnd >= date)) days += 1
    }
    return reading(quiz.trainingAdherence, hit, scheduled.length, anyLogged ? days : 0)
}

/**
 * Nutrition: each of the last four weeks' days with food marked eaten and a
 * phase calorie target, judged the way the planner judges it (lib/energy.ts
 * targetVerdict): within tolerance of the target, or a little under on a cut and
 * a little over on a build. Days with nothing logged are left out, not failed.
 */
export function measureNutrition(inputs: TimelineInputs): AdherenceReading {
    const { today, phases, quiz } = inputs
    const from = addDays(today, -ADHERENCE_WINDOW_DAYS)
    let hit = 0
    let total = 0
    for (const [date, eaten] of dailyIntake(inputs.mealEntries ?? [])) {
        if (date < from || date >= today || eaten <= 0) continue
        const { goals, phase } = targetsFor(date, phases)
        if (!goals?.calories) continue
        total += 1
        if (targetVerdict(eaten, goals.calories, phase?.kind ?? null) === 'good') hit += 1
    }
    return reading(quiz.nutritionAdherence, hit, total, total)
}

export function measureAdherence(inputs: TimelineInputs): Adherence {
    return { training: measureTraining(inputs), nutrition: measureNutrition(inputs) }
}

/** Each lift's own weekly % change over the last six weeks, where there is one. */
function observedLiftRates(inputs: TimelineInputs, lifts: LiftKey[]): Map<LiftKey, number> {
    const bests = sessionBests(inputs.workoutLogs)
    const rates = new Map<LiftKey, number>()
    for (const lift of lifts) {
        const t = liftTrend(bests, lift, inputs.today)
        if (t.changePct !== null) rates.set(lift, Math.max(-1.5, Math.min(2.5, t.changePct / 6)))
    }
    return rates
}

// ── The timeline ─────────────────────────────────────────────────────────────

const LABELS: Record<NutritionPhaseKind, string> = { cut: 'Cut', maintain: 'Maintenance', gain: 'Build' }

function range(mid: number, half: number): Range {
    return { mid, low: mid - half, high: mid + half }
}

/** The body on one day of a run. */
interface Snapshot {
    weight: Range
    bodyFat: Range
    fatChange: number
    leanChange: number
    lifts: LiftProjection[]
    strengthPct: number
}

interface RunResult {
    weeks: TimelineWeek[]
    final: TimelineEnd
}

export function buildTimeline(given: TimelineInputs): Timeline {
    // Everything downstream reads adherence off the quiz, so the blend goes in there.
    const adherence = measureAdherence(given)
    const inputs: TimelineInputs = {
        ...given,
        quiz: {
            ...given.quiz,
            trainingAdherence: adherence.training.used,
            nutritionAdherence: adherence.nutrition.used,
        },
    }
    const { today } = inputs
    const plans = livePlans(inputs.plans, today)
    const phases = livePhases(inputs.phases, today)
    const end = windowEnd(inputs)

    const initial = startingPoint(inputs)
    const burn = solveForGoal(inputs, initial, end, anchorBurn(inputs, initial.weight))
    const calibration = calibrate(inputs, initial.bodyFat, burn.scale)
    const offset = calibration?.offsetKcal ?? 0
    const burnError =
        BURN_ERROR.uncalibrated * (1 - (calibration?.weight ?? 0)) + BURN_ERROR.calibrated * (calibration?.weight ?? 0)

    // The whole chain stays on screen: it starts at the earliest plan still running.
    const chainStart = [today, ...plans.map((p) => p.planStart), ...phases.map((p) => p.startDate)].sort()[0]
    const main = run(inputs, initial, end, makeContext(inputs, offset, burn.scale), burnError, true, chainStart)
    const imperfect = inputs.quiz.trainingAdherence < 1 || inputs.quiz.nutritionAdherence < 1
    const perfect = imperfect
        ? run(inputs, initial, end, makeContext(inputs, offset, burn.scale, true), burnError, true, chainStart)
        : null
    const goal = goalOf(phases, inputs.bodyGoals)
    const { suggestions, combined } = suggest(
        inputs,
        initial,
        end,
        offset,
        burn.scale,
        burnError,
        main.final,
        adherence,
        goal
    )

    return {
        start: today,
        chainStart,
        past: pastWeeks(inputs, chainStart, initial),
        end,
        initial,
        weeks: main.weeks,
        final: main.final,
        calibration,
        adherence,
        perfect,
        suggestions,
        combined,
        burn,
        trainingGaps: trainingGaps(plans, today, end),
        goal,
        plans: [
            ...plans.map((p) => ({
                id: p._id,
                name: p.name,
                start: p.planStart,
                end: p.planEnd,
                type: 'training' as const,
            })),
            ...phases.map((p) => ({
                id: p._id,
                name: p.name,
                start: p.startDate,
                end: p.endDate,
                type: 'nutrition' as const,
                kind: p.kind,
            })),
        ].sort((a, b) => a.start.localeCompare(b.start)),
    }
}

// ── Reading the plan's goal back ─────────────────────────────────────────────

/** Highest maintenance multiple ever assumed — past this the goal isn't reachable on these calories. */
const MAX_GOAL_SCALE = 1.45

/**
 * A plan with a goal ("95 kg at 20% by June") was written to reach it. So
 * before any weigh-ins, assume it does: find the maintenance at which the plan,
 * followed to the letter, lands on its own goal — and project the quiz's
 * adherence from there. Reading only the scale goal undershot: losing fat while
 * building muscle needs a bigger deficit than the weight change alone implies,
 * and the deficit shrinks as you get lighter.
 *
 * Never makes the projection less aggressive than the plan's own rate, and
 * never assumes a maintenance past MAX_GOAL_SCALE × the formula: a goal that
 * needs more than that is flagged instead of quietly promised.
 */
function solveForGoal(inputs: TimelineInputs, initial: TimelineStart, end: string, base: BurnAnchor): BurnAnchor {
    if (base.source === 'formula') return base
    const phase = livePhases(inputs.phases, inputs.today)
        .filter((p) => p.kind !== 'maintain' && (p.goal?.targetBodyFatPct || p.goal?.targetWeightKg))
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .pop()
    if (!phase) return base

    const goal = phase.goal!
    const basis: 'bodyFat' | 'weight' = goal.targetBodyFatPct ? 'bodyFat' : 'weight'
    const target = basis === 'bodyFat' ? goal.targetBodyFatPct! : goal.targetWeightKg!
    const startValue = basis === 'bodyFat' ? initial.bodyFat : initial.weight
    const dir = target < startValue ? -1 : 1
    const at = [goal.targetDate ?? phase.endDate, end].sort()[0]

    const valueAt = (scale: number): number => {
        const { weeks } = run(inputs, initial, end, makeContext(inputs, 0, scale, true), 0, false)
        const week = weeks.find((w) => w.end >= at) ?? weeks[weeks.length - 1]
        return basis === 'bodyFat' ? week.bodyFat.mid : week.weight.mid
    }
    const reaches = (scale: number) => (dir < 0 ? valueAt(scale) <= target : valueAt(scale) >= target)

    if (reaches(base.scale)) return base
    // More burn helps a cut; less helps a build.
    const limit = dir < 0 ? MAX_GOAL_SCALE : 0.8
    if (!reaches(limit)) return { ...base, goalBasis: basis, goalReachable: false }

    let lo = base.scale
    let hi = limit
    for (let i = 0; i < 18; i++) {
        const mid = (lo + hi) / 2
        if (reaches(mid)) hi = mid
        else lo = mid
    }
    return {
        ...base,
        source: 'goal',
        goalBasis: basis,
        goalReachable: true,
        scale: hi,
        planKcal: base.formulaKcal * hi,
    }
}

// ── Suggestions ──────────────────────────────────────────────────────────────

/** Walking cost, kcal per step per kg of bodyweight (~0.5 kcal/kg/km). */
const KCAL_PER_STEP_KG = 0.0005

/**
 * What would most improve the finish, each lever re-run through the same model
 * on its own, then all of them together. Only levers that apply are offered: no
 * "make every session" for someone who already said they will.
 */
function suggest(
    inputs: TimelineInputs,
    initial: TimelineStart,
    end: string,
    offset: number,
    scale: number,
    burnError: number,
    base: TimelineEnd,
    adherence: Adherence,
    goal: Timeline['goal']
): { suggestions: Suggestion[]; combined: Suggestion | null } {
    const { quiz } = inputs
    const cutting = livePhases(inputs.phases, inputs.today).some((p) => p.kind === 'cut')
    const measure: Suggestion['measure'] = cutting ? 'bodyFat' : 'lean'
    const pct = (n: number) => `${Math.round(n * 100)}%`
    // Say where the figure came from: the logs once they carry most of the blend.
    const said = (r: AdherenceReading, unit: string) =>
        r.measured !== null && r.weight >= 0.5
            ? `You’ve hit ${r.hit} of ${r.total} ${unit} lately (${pct(r.measured)}).`
            : `You said ${pct(r.stated)}.`

    type Lever = {
        key: string
        title: string
        detail: string
        quiz?: Partial<TimelineQuiz>
        shift?: number
        burn?: number
    }
    const levers: Lever[] = []
    if (quiz.nutritionAdherence < 1)
        levers.push({
            key: 'nutrition',
            title: 'Stick to your calories every day',
            detail: `${said(adherence.nutrition, 'logged days')} Weekends count — that’s where most cuts leak.`,
            quiz: { nutritionAdherence: 1 },
        })
    if (quiz.trainingAdherence < 1)
        levers.push({
            key: 'training',
            title: 'Make every session',
            detail: `${said(adherence.training, 'sessions')} Book them in like meetings.`,
            quiz: { trainingAdherence: 1 },
        })
    levers.push(
        cutting
            ? {
                  key: 'calories',
                  title: 'Trim 150 kcal a day',
                  detail: 'A slice of toast or one snack. Keep protein where it is and take it from carbs or fat.',
                  shift: -150,
              }
            : {
                  key: 'calories',
                  title: 'Add 150 kcal a day',
                  detail: 'A shake or an extra snack — more fuel for building.',
                  shift: 150,
              }
    )
    if (cutting && quiz.activity !== 'very') {
        const burn = Math.round(3000 * KCAL_PER_STEP_KG * initial.weight)
        levers.push({
            key: 'steps',
            title: 'Walk 3,000 more steps a day',
            detail: `About 30 minutes, ~${burn} kcal. The easiest extra burn there is, and it barely touches recovery.`,
            burn,
        })
    }
    if (quiz.protein !== 'always')
        levers.push({
            key: 'protein',
            title: 'Hit your protein every day',
            detail: 'Holds on to muscle while the fat comes off, and keeps you fuller.',
            quiz: { protein: 'always' },
        })
    if (quiz.sleep === 'under6' || quiz.sleep === '6to7')
        levers.push({
            key: 'sleep',
            title: 'Get 7–8 hours of sleep',
            detail: 'Better recovery, more muscle kept, fewer cravings the next day.',
            quiz: { sleep: '7to8' },
        })
    if (quiz.creatine === 'no')
        levers.push({
            key: 'creatine',
            title: 'Take 5 g of creatine a day',
            detail: 'Cheap and well proven: a little more strength and muscle. Expect ~1 kg of water on the scale.',
            quiz: { creatine: 'already', creatineDoseG: 5 },
        })

    // The first week a run reaches the goal: body fat when the goal names it, else weight.
    const target = goal.bodyFatPct ?? goal.weightKg
    const pick = (w: TimelineWeek) => (goal.bodyFatPct !== null ? w.bodyFat.mid : w.weight.mid)
    const startValue = goal.bodyFatPct !== null ? initial.bodyFat : initial.weight
    const down = target !== null && target < startValue
    const reachedOn = (weeks: TimelineWeek[]): string | null => {
        if (target === null) return null
        return weeks.find((w) => (down ? pick(w) <= target : pick(w) >= target))?.end ?? null
    }

    const runWith = (q: Partial<TimelineQuiz>, shift: number, burn: number) => {
        const next = { ...inputs, quiz: { ...quiz, ...q } }
        const r = run(next, initial, end, makeContext(next, offset, scale, false, shift, burn), burnError, false)
        return { final: r.final, reaches: reachedOn(r.weeks) }
    }
    const gainOf = (f: TimelineEnd) =>
        measure === 'bodyFat' ? base.bodyFat.mid - f.bodyFat.mid : f.leanChange - base.leanChange

    const suggestions = levers
        .map((l): Suggestion => {
            const { final, reaches } = runWith(l.quiz ?? {}, l.shift ?? 0, l.burn ?? 0)
            return { key: l.key, title: l.title, detail: l.detail, final, gain: gainOf(final), measure, reaches }
        })
        .filter((s) => s.gain >= (measure === 'bodyFat' ? 0.15 : 0.1))
        .sort((a, b) => b.gain - a.gain)

    if (suggestions.length < 2) return { suggestions, combined: null }
    const chosen = levers.filter((l) => suggestions.some((s) => s.key === l.key))
    const allQuiz = Object.assign({}, ...chosen.map((l) => l.quiz ?? {}))
    const shift = chosen.reduce((sum, l) => sum + (l.shift ?? 0), 0)
    const burn = chosen.reduce((sum, l) => sum + (l.burn ?? 0), 0)
    const { final, reaches } = runWith(allQuiz, shift, burn)
    return {
        suggestions,
        combined: { key: 'all', title: 'All of them together', detail: '', final, gain: gainOf(final), measure, reaches },
    }
}

function run(
    inputs: TimelineInputs,
    initial: TimelineStart,
    end: string,
    ctx: Context,
    burnError: number,
    withMilestones: boolean,
    /** Weeks are counted from here, so projected weeks line up with the past ones. */
    gridStart: string = inputs.today
): RunResult {
    const { today } = inputs
    const startFat = (initial.weight * initial.bodyFat) / 100
    const state: State = {
        fat: startFat,
        lean: initial.weight - startFat,
        deficitDays: 0,
        sinceStrength: daysSinceLastStrength(ctx, today),
        strength: 100,
        lifts: new Map(initial.lifts.map((l) => [l.lift, l.kg])),
    }
    const liftRates = observedLiftRates(
        inputs,
        initial.lifts.map((l) => l.lift)
    )
    const water0 = ctx.water(today)
    // How far off the starting body fat could be — a scale reading, a number you
    // know, or a guess from height and weight.
    const bfBase = { logged: 0.4, quiz: 0.7, estimated: 1.2 }[initial.bodyFatSource]

    const total = Math.max(1, daysBetween(today, end) + 1)
    const weeks: TimelineWeek[] = []
    const milestones = withMilestones ? new MilestoneTracker(inputs, initial, ctx, end) : null
    let burnSum = 0

    // The current week began on the grid, maybe a few days ago; its snapshot is still
    // taken at its end, so it reads as the same week the past ones count in.
    let weekStart = addDays(gridStart, Math.floor(daysBetween(gridStart, today) / 7) * 7)
    let week = { target: 0, targetDays: 0, balance: 0, days: 0, strength: 0, cardio: 0 }

    const snapshot = (date: string): Snapshot => {
        const weight = state.fat + state.lean + ctx.water(date) - water0
        const days = daysBetween(today, date) + 1
        const avgBurn = burnSum / days
        const wHalf = Math.min(2.5, 0.3 + (burnError * avgBurn * days) / FAT_KCAL_PER_KG)
        const bf = (state.fat / weight) * 100
        // Most of the weight error is fat, but not all of it shifts the percentage.
        const bfHalf = Math.min(3, bfBase + ((wHalf - 0.3) / weight) * 80)
        const liftHalf = Math.min(8, 2 + 0.2 * (days / 7)) / 100
        return {
            weight: range(weight, wHalf),
            bodyFat: range(bf, bfHalf),
            fatChange: state.fat - startFat,
            leanChange: state.lean - (initial.weight - startFat),
            lifts: initial.lifts.map((l) => {
                const kg = state.lifts.get(l.lift)!
                return { lift: l.lift, label: l.label, range: range(kg, kg * liftHalf) }
            }),
            strengthPct: state.strength - 100,
        }
    }

    for (let d = 0; d < total; d++) {
        const date = addDays(today, d)
        const out = step(state, date, d, ctx, liftRates)
        burnSum += out.burn
        week.balance += out.balance
        week.days += 1
        if (out.target !== null) {
            week.target += out.target
            week.targetDays += 1
        }
        const s = ctx.sessions.get(date)
        week.strength += s?.strength ?? 0
        week.cardio += s?.cardio ?? 0

        const snap = snapshot(date)
        milestones?.check(date, d, snap)

        if (daysBetween(gridStart, date) % 7 === 6 || date === end) {
            const mid = addDays(weekStart, Math.floor((daysBetween(weekStart, date) + 1) / 2))
            const phase = phaseFor(mid, ctx.phases)
            weeks.push({
                index: Math.floor(daysBetween(gridStart, weekStart) / 7) + 1,
                start: weekStart,
                end: date,
                phase: phase ? { name: phase.name, kind: phase.kind } : null,
                training: ctx.plans.filter((p) => p.planStart <= date && p.planEnd >= weekStart).map((p) => p.name),
                strengthSessions: week.strength,
                cardioSessions: week.cardio,
                targetKcal: week.targetDays ? Math.round(week.target / week.targetDays) : null,
                balanceKcal: Math.round(week.balance / week.days),
                ...snap,
                milestones: [],
            })
            weekStart = addDays(date, 1)
            week = { target: 0, targetDays: 0, balance: 0, days: 0, strength: 0, cardio: 0 }
        }
    }

    const last = weeks[weeks.length - 1]
    if (milestones) {
        for (const m of milestones.finish(last)) {
            const w = weeks.find((wk) => m.date >= wk.start && m.date <= wk.end) ?? last
            w.milestones.push(m)
        }
    }

    // Keep the order the tracker found them in, but plan changes lead their week.
    const order: MilestoneKind[] = ['plan', 'water', 'strength', 'muscle', 'fat', 'goal', 'progress']
    for (const w of weeks) w.milestones.sort((a, b) => a.date.localeCompare(b.date) || order.indexOf(a.kind) - order.indexOf(b.kind))

    return {
        weeks,
        final: {
            weight: last.weight,
            bodyFat: last.bodyFat,
            fatChange: last.fatChange,
            leanChange: last.leanChange,
            lifts: last.lifts,
            strengthPct: last.strengthPct,
        },
    }
}

function pastWeeks(inputs: TimelineInputs, chainStart: string, initial: TimelineStart): PastWeek[] {
    const { today } = inputs
    const thisWeek = addDays(chainStart, Math.floor(daysBetween(chainStart, today) / 7) * 7)
    const trend = trendSeries(inputs.weightLogs)
    const fat = bodyFatSeries(inputs.weightLogs)
    const bests = sessionBests(inputs.workoutLogs)
    const sessions = sessionsByDate(inputs.plans)
    const lastIn = <T extends { date: string }>(xs: T[], from: string, to: string) =>
        [...xs].reverse().find((x) => x.date >= from && x.date <= to) ?? null

    const out: PastWeek[] = []
    for (let start = chainStart; start < thisWeek; start = addDays(start, 7)) {
        const end = addDays(start, 6)
        let strength = 0
        let cardio = 0
        let kcalSum = 0
        let kcalDays = 0
        for (let d = 0; d < 7; d++) {
            const date = addDays(start, d)
            const s = sessions.get(date)
            strength += s?.strength ?? 0
            cardio += s?.cardio ?? 0
            const phase = phaseFor(date, inputs.phases)
            const kcal = phase ? phaseTargetsOn(phase, date).calories : undefined
            if (kcal) {
                kcalSum += kcal
                kcalDays += 1
            }
        }
        const phase = phaseFor(addDays(start, 3), inputs.phases)
        out.push({
            index: out.length + 1,
            start,
            end,
            phase: phase ? { name: phase.name, kind: phase.kind } : null,
            training: inputs.plans.filter((p) => p.planStart <= end && p.planEnd >= start).map((p) => p.name),
            strengthSessions: strength,
            cardioSessions: cardio,
            targetKcal: kcalDays ? Math.round(kcalSum / kcalDays) : null,
            weight: lastIn(trend, start, end)?.trend ?? null,
            bodyFat: lastIn(fat, start, end)?.trend ?? null,
            lifts: initial.lifts.map((l) => {
                const inWeek = bests.filter((b) => b.lift === l.lift && b.date >= start && b.date <= end)
                return {
                    lift: l.lift,
                    label: l.label,
                    kg: inWeek.length ? Math.max(...inWeek.map((b) => b.estimatedMaxKg)) : null,
                }
            }),
        })
    }
    return out
}

function goalOf(phases: NutritionPhase[], bodyGoals: BodyGoals | undefined): Timeline['goal'] {
    const withGoal = [...phases]
        .sort((a, b) => a.endDate.localeCompare(b.endDate))
        .filter((p) => p.goal?.targetWeightKg || p.goal?.targetBodyFatPct)
        .pop()
    return {
        weightKg: withGoal?.goal?.targetWeightKg ?? bodyGoals?.targetWeight ?? null,
        bodyFatPct: withGoal?.goal?.targetBodyFatPct ?? bodyGoals?.targetBodyFat ?? null,
        date: withGoal ? (withGoal.goal?.targetDate ?? withGoal.endDate) : null,
    }
}

/** Runs of 14+ days between `from` and `to` that no training plan covers. */
export function trainingGaps(plans: TrainingPlan[], from: string, to: string): { start: string; end: string }[] {
    const gaps: { start: string; end: string }[] = []
    let gapStart: string | null = null
    const total = daysBetween(from, to)
    for (let d = 0; d <= total + 1; d++) {
        const date = addDays(from, d)
        const covered = d > total || plans.some((p) => p.planStart <= date && p.planEnd >= date)
        if (!covered && gapStart === null) gapStart = date
        if (covered && gapStart !== null) {
            const end = addDays(date, -1)
            if (daysBetween(gapStart, end) >= 13) gaps.push({ start: gapStart, end })
            gapStart = null
        }
    }
    return gaps
}

function daysSinceLastStrength(ctx: Context, today: string): number {
    for (let i = 0; i <= 30; i++) if ((ctx.sessions.get(addDays(today, -i))?.strength ?? 0) > 0) return i
    // No scheduled history to go on (a plan starting today, say): assume trained.
    return 0
}

// ── Milestones ───────────────────────────────────────────────────────────────

const FAT_STEPS: [number, string, string][] = [
    [1, 'First kilo of fat gone', 'Not visible yet — but it’s real, and it’s the hardest one.'],
    [2.5, 'Waistband feels looser', 'Usually the first thing you notice, before the mirror does.'],
    [4, 'Leaner in photos', 'Face and jawline tend to show it first.'],
    [6, 'Other people start to notice', 'Expect the first “have you lost weight?”'],
    [9, 'Likely down a clothes size', 'Time to check the belt holes.'],
    [12, 'A different body', 'Compare against a day-one photo — it won’t look like the same person.'],
]

const LEAN_STEPS: [number, string, string][] = [
    [0.5, 'Muscles feel fuller', 'Pumps last longer and sleeves start to fit differently.'],
    [1, 'You might start noticing muscle growth', 'Shoulders and arms usually show it first.'],
    [2, 'Visible in side-by-side photos', 'Line a photo up with week one — the difference is there.'],
    [3.5, 'Shirts tighter across chest and arms', 'That’s real tissue, built week by week.'],
]

/** Body fat lines worth crossing, with what tends to show there (men; women +8). */
const BF_STEPS: [number, string][] = [
    [25, 'Waist visibly smaller and clothes hang differently.'],
    [20, 'An outline of the upper abs in good light.'],
    [17, 'Top of the abs showing, more shape in the arms.'],
    [15, 'Abs visible in most light.'],
    [12, 'Clear abs and veins showing on the arms.'],
    [10, 'Very lean — hard to hold for long.'],
]

class MilestoneTracker {
    private out: Milestone[] = []
    private fatDone = new Set<number>()
    private leanDone = new Set<number>()
    private bfDone = new Set<number>()
    private liftDone = new Set<string>()
    private goalDone = new Set<string>()
    private halfway: string
    private startBf: number
    private bfShift: number

    constructor(
        private inputs: TimelineInputs,
        private initial: TimelineStart,
        private ctx: Context,
        private end: string
    ) {
        const { today, quiz } = inputs
        this.halfway = addDays(today, Math.floor(daysBetween(today, end) / 2))
        this.startBf = initial.bodyFat
        this.bfShift = inputs.profile?.sex === 'female' ? 8 : 0

        // Plan changes, chained in order.
        for (const p of livePhases(ctx.phases, today)) {
            if (p.startDate > today && p.startDate <= end)
                this.add(p.startDate, 'plan', `${LABELS[p.kind]} starts — ${p.name}`, phaseIntro(p.kind))
        }
        for (const p of livePlans(ctx.plans, today)) {
            if (p.planStart > today && p.planStart <= end)
                this.add(p.planStart, 'plan', `Training plan starts — ${p.name}`, 'New block, new stimulus.')
            if (p.planEnd < end) {
                const next = livePlans(ctx.plans, today).some(
                    (q) => q !== p && q.planStart > p.planStart && daysBetween(p.planEnd, q.planStart) <= 14
                )
                this.add(
                    p.planEnd,
                    'plan',
                    `Training plan ends — ${p.name}`,
                    next
                        ? 'Block complete.'
                        : 'Block complete. Nothing is scheduled after it, so the timeline assumes you keep training the way this block ended — add your next block to make it exact.'
                )
            }
        }

        // Water: say it before it happens.
        if (quiz.creatine === 'new' && quiz.creatineStart && quiz.creatineStart >= addDays(today, -7)) {
            const days = quiz.creatineLoading ? 5 : 14
            const at = addDays(quiz.creatineStart, days)
            if (at <= end)
                this.add(
                    at,
                    'water',
                    'Scale up ~1 kg — that’s creatine',
                    'Water stored in the muscle, not fat. Your body fat projection ignores it.'
                )
            const full = addDays(quiz.creatineStart, quiz.creatineLoading ? 7 : 28)
            if (full <= end && full >= today)
                this.add(full, 'strength', 'Creatine fully loaded', 'Expect an extra rep or two on hard sets from here.')
        }
        for (const run of cutRuns(ctx.phases)) {
            if (run.start >= today && run.start <= end)
                this.add(
                    addDays(run.start, 6),
                    'water',
                    'Fast first week on the scale',
                    'Part of it is glycogen and water. It slows after — that’s normal, not a stall.'
                )
            const after = addDays(run.end, 1)
            if (run.refeedAfter && after >= today && after <= end)
                this.add(
                    addDays(after, 4),
                    'water',
                    'Scale up ~0.8 kg after the cut',
                    'Glycogen refilling as calories rise. It isn’t fat coming back.'
                )
        }

        // Early strength: the nervous system learns the lifts before muscle grows.
        const firstLift = [...ctx.sessions.entries()]
            .filter(([date, s]) => s.strength > 0 && date >= addDays(today, -7))
            .map(([date]) => date)
            .sort()[0]
        const learning = livePlans(ctx.plans, today).some((p) => p.planStart >= addDays(today, -7))
        if (firstLift && learning && quiz.trainingAge !== 'advanced') {
            const at = addDays(firstLift < today ? today : firstLift, 13)
            if (at <= end)
                this.add(
                    at,
                    'strength',
                    'Weights moving easier',
                    'Early strength comes from your nervous system learning the lifts — muscle follows.'
                )
        }
    }

    private add(date: string, kind: MilestoneKind, title: string, detail: string) {
        this.out.push({ date, kind, title, detail })
    }

    check(date: string, day: number, snap: Snapshot) {
        const lost = -snap.fatChange
        for (const [kg, title, detail] of FAT_STEPS) {
            if (lost >= kg && !this.fatDone.has(kg)) {
                this.fatDone.add(kg)
                this.add(date, 'fat', title, `${detail} About ${fmtKg(lost)} of fat down.`)
            }
        }
        for (const [kg, title, detail] of LEAN_STEPS) {
            if (snap.leanChange >= kg && !this.leanDone.has(kg)) {
                this.leanDone.add(kg)
                this.add(date, 'muscle', title, `${detail} About ${fmtKg(snap.leanChange)} of lean mass built.`)
            }
        }
        for (const [line, detail] of BF_STEPS) {
            const at = line + this.bfShift
            if (this.startBf > at + 0.5 && snap.bodyFat.mid <= at && !this.bfDone.has(at)) {
                this.bfDone.add(at)
                this.add(date, 'fat', `Body fat could dip under ${at}%`, detail)
            }
        }
        for (const l of snap.lifts) {
            const start = this.initial.lifts.find((x) => x.lift === l.lift)!.kg
            const next = Math.floor(start / 20) * 20 + 20
            for (let kg = next; kg <= l.range.mid; kg += 20) {
                const key = `${l.lift}:${kg}`
                if (this.liftDone.has(key)) continue
                this.liftDone.add(key)
                this.add(date, 'strength', `${l.label} could pass ${kg} kg`, 'Estimated one-rep max, from your logged sets.')
            }
        }
        this.checkGoals(date, snap)
        if (date === this.halfway && day > 14) {
            const change = snap.weight.mid - this.initial.weight
            const kind = phaseFor(date, this.ctx.phases)?.kind
            const wanted = kind === 'cut' ? change <= -0.3 : kind === 'gain' ? change >= 0.3 : Math.abs(change) < 1
            this.add(
                date,
                'progress',
                'Halfway there',
                wanted && Math.abs(change) >= 0.3
                    ? `About ${fmtKg(Math.abs(change))} ${change < 0 ? 'down' : 'up'} on the scale so far.`
                    : 'Halfway through the plans.'
            )
        }
    }

    private checkGoals(date: string, snap: Snapshot) {
        const phase = phaseFor(date, this.ctx.phases)
        const goals: { key: string; weight?: number; bf?: number }[] = [
            { key: 'settings', weight: this.inputs.bodyGoals?.targetWeight, bf: this.inputs.bodyGoals?.targetBodyFat },
        ]
        if (phase?.goal) goals.push({ key: phase._id, weight: phase.goal.targetWeightKg, bf: phase.goal.targetBodyFatPct })
        const start = this.initial
        for (const g of goals) {
            if (g.weight && !this.goalDone.has(`${g.weight}w`)) {
                const down = g.weight < start.weight
                if (down ? snap.weight.mid <= g.weight : snap.weight.mid >= g.weight) {
                    this.goalDone.add(`${g.weight}w`)
                    this.add(date, 'goal', `Target weight in reach — ${fmtKg(g.weight)}`, 'Your goal weight, on the plans as they stand.')
                }
            }
            if (g.bf && !this.goalDone.has(`${g.bf}bf`) && start.bodyFat > g.bf && snap.bodyFat.mid <= g.bf) {
                this.goalDone.add(`${g.bf}bf`)
                this.add(date, 'goal', `Target body fat in reach — ${g.bf}%`, 'Your goal body fat, on the plans as they stand.')
            }
        }
    }

    finish(last: TimelineWeek): Milestone[] {
        const parts: string[] = []
        const change = last.weight.mid - this.initial.weight
        if (Math.abs(change) >= 0.3) parts.push(`${fmtKg(Math.abs(change))} ${change < 0 ? 'lighter' : 'heavier'}`)
        if (last.fatChange <= -0.3) parts.push(`${fmtKg(-last.fatChange)} of fat gone`)
        if (last.leanChange >= 0.2) parts.push(`${fmtKg(last.leanChange)} of muscle built`)
        if (last.strengthPct >= 1) parts.push(`lifts up ~${Math.round(last.strengthPct)}%`)
        this.add(this.end, 'progress', 'Finish line', parts.length ? `${capitalise(parts.join(', '))}.` : 'The plans, done.')
        return this.out.sort((a, b) => a.date.localeCompare(b.date))
    }
}

function phaseIntro(kind: NutritionPhaseKind): string {
    if (kind === 'cut') return 'Calories come down. Keep protein high and the lifting heavy.'
    if (kind === 'gain') return 'Calories go up — this is where muscle gets built fastest.'
    return 'Calories back to maintenance. Hold what you’ve built.'
}

function fmtKg(kg: number): string {
    return `${kg >= 10 ? Math.round(kg) : Math.round(kg * 10) / 10} kg`
}

function capitalise(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1)
}
