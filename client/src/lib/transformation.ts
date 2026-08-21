import { measurementDirection, type MeasurementGap, type MeasurementTrend } from './bodyMeasurements'
import { PERFORMANCE_LABELS, type PerformanceStatus, type StrengthSummary } from './strengthTrend'
import { daysBetween } from './weightTrend'
import type { Adherence } from './nutritionAdjustment'
import type { ProgressCheckIn } from '../types'

/**
 * Is the recomp working?
 *
 * No single number answers that, which is the entire reason this module exists.
 * The scale alone cannot tell a good week from a dehydrated one. Body fat off a
 * consumer scale swings more than the thing it is measuring. Strength alone says
 * nothing about fat. But together they form patterns that are genuinely
 * readable, and one of them matters more than all the rest:
 *
 *   **Weight flat, waist falling, strength rising.**
 *
 * That is a recomposition succeeding, and it is indistinguishable from a stall
 * if you only look at bodyweight. An adaptive system that sees a plateau and
 * cuts calories would, in that exact situation, be punishing the outcome it was
 * built to produce. Recognising this pattern is the point of the whole module.
 *
 * What this deliberately is *not*: a score. There is no number out of a hundred
 * here, because it would compress five signals of very different reliability
 * into one figure whose movements nobody could explain. The output is a named
 * pattern, the signals behind it, and a sentence — all of which can be argued
 * with.
 */

/** Which way bodyweight is going, judged against the goal's intended band. */
export type WeightDirection = 'falling-fast' | 'falling' | 'flat' | 'rising' | 'unknown'

/** Below this a weekly rate is noise rather than direction (kg/week). */
export const FLAT_RATE_KG = 0.05

/**
 * How the scale is moving relative to what was asked for. `band` is the goal's
 * acceptable weekly range, signed; without one, anything faster than half a kilo
 * a week counts as fast.
 */
export function weightDirection(
    rateKgPerWeek: number | null,
    band?: { min: number; max: number } | null
): WeightDirection {
    if (rateKgPerWeek === null) return 'unknown'
    if (Math.abs(rateKgPerWeek) < FLAT_RATE_KG) return 'flat'
    if (rateKgPerWeek > 0) return 'rising'
    // Losing. "Fast" means clearly past the fast edge of the intended band.
    const fastEdge = band ? band.min - 0.1 : -0.5
    return rateKgPerWeek < fastEdge ? 'falling-fast' : 'falling'
}

/** How far back check-ins are read for a recovery reading. */
export const CHECKIN_WINDOW_DAYS = 90

/** Fewest check-ins before their average is worth quoting. */
export const MIN_CHECKINS = 2

export interface SubjectiveRead {
    /** Mean recovery rating, 1–5. Null when there aren't enough check-ins. */
    recovery: number | null
    energy: number | null
    hunger: number | null
    trainingFeel: number | null
    /** How the most recent check-in reported clothes fitting. */
    clothesFit: ProgressCheckIn['clothesFit'] | null
    checkIns: number
}

/**
 * Average the recent check-ins.
 *
 * Averaged rather than taken from the latest because a single check-in records a
 * mood as much as a month — and because two poor recovery scores in a row is a
 * signal, while one is a bad week.
 */
export function subjectiveRead(
    checkIns: ProgressCheckIn[],
    asOf: string,
    windowDays = CHECKIN_WINDOW_DAYS
): SubjectiveRead {
    const recent = checkIns
        .filter((c) => {
            const age = daysBetween(c.date, asOf)
            return age >= 0 && age < windowDays
        })
        .sort((a, b) => a.date.localeCompare(b.date))

    const mean = (pick: (c: ProgressCheckIn) => number | undefined): number | null => {
        const values = recent.map(pick).filter((v): v is number => typeof v === 'number')
        if (values.length < MIN_CHECKINS) return null
        return values.reduce((a, b) => a + b, 0) / values.length
    }

    return {
        recovery: mean((c) => c.recovery),
        energy: mean((c) => c.energy),
        hunger: mean((c) => c.hunger),
        trainingFeel: mean((c) => c.trainingFeel),
        clothesFit: recent.length ? (recent[recent.length - 1].clothesFit ?? null) : null,
        checkIns: recent.length,
    }
}

/** Below this average, recovery is poor enough to mention alongside a fast loss. */
export const POOR_RECOVERY = 2.5

/** The named situations worth telling apart. */
export const PROGRESS_PATTERNS = [
    'recomp-going-well',
    'recomp-despite-plateau',
    'too-aggressive',
    'stalled',
    'gaining',
    'mixed',
    'insufficient-data',
] as const
export type ProgressPattern = (typeof PROGRESS_PATTERNS)[number]

export interface TransformationSignals {
    weight: WeightDirection
    rateKgPerWeek: number | null
    waist: MeasurementTrend | MeasurementGap
    waistDirection: ReturnType<typeof measurementDirection>
    strength: PerformanceStatus
    /** Whether intake was logged well enough for its absence of movement to mean anything. */
    adherenceIsGood: boolean
    subjective: SubjectiveRead
}

export interface TransformationRead {
    pattern: ProgressPattern
    /** A few words: what is happening. */
    headline: string
    /** A sentence or two: the evidence, and what follows from it. */
    detail: string
    signals: TransformationSignals
    /**
     * Whether the evidence argues against cutting calories right now. Only ever
     * set to true — this can withhold a reduction, never cause one.
     */
    holdsAgainstReduction: boolean
}

export interface TransformationInput {
    rateKgPerWeek: number | null
    /** The goal's acceptable weekly range, signed. */
    rateBand?: { min: number; max: number } | null
    waist: MeasurementTrend | MeasurementGap
    strength: StrengthSummary
    adherence: Adherence
    checkIns: ProgressCheckIn[]
    asOf: string
}

/** Coverage below which nothing about intake can be concluded. */
const GOOD_COVERAGE = 0.7

/**
 * Read the combination.
 *
 * The order of the checks is the argument, as it is in the calorie engine. The
 * plateau-that-is-really-a-recomp is tested *before* the stall, because the two
 * look identical on the scale and only one of them wants a calorie change — and
 * getting that precedence backwards is the single most damaging mistake this
 * module could make.
 */
export function readTransformation(input: TransformationInput): TransformationRead {
    const { rateKgPerWeek, rateBand, waist, strength, adherence, checkIns, asOf } = input

    const weight = weightDirection(rateKgPerWeek, rateBand)
    const waistDirection = measurementDirection(waist)
    const subjective = subjectiveRead(checkIns, asOf)
    const adherenceIsGood = adherence.coverage >= GOOD_COVERAGE && adherence.loggedDays >= 14

    const signals: TransformationSignals = {
        weight,
        rateKgPerWeek,
        waist,
        waistDirection,
        strength: strength.overall,
        adherenceIsGood,
        subjective,
    }

    const read = (
        pattern: ProgressPattern,
        headline: string,
        detail: string,
        holdsAgainstReduction = false
    ): TransformationRead => ({ pattern, headline, detail, signals, holdsAgainstReduction })

    const waistPhrase = waistText(waist)
    const strengthPhrase = PERFORMANCE_LABELS[strength.overall].toLowerCase()

    if (weight === 'unknown') {
        return read(
            'insufficient-data',
            'Not enough data yet',
            'There is no reliable weight trend to read yet. Keep logging weigh-ins and intake — three weeks of both is enough to say something useful.'
        )
    }

    // The important one. Scale flat, tape moving, training holding: this is a
    // recomposition working, and it is the exact shape a naive system mistakes
    // for a stall and responds to by cutting food.
    if (
        weight === 'flat' &&
        waistDirection === 'falling' &&
        (strength.overall === 'improving' || strength.overall === 'stable')
    ) {
        return read(
            'recomp-despite-plateau',
            'Recomposition, not a stall',
            `Scale weight has been broadly stable, but ${waistPhrase} and strength is ${strengthPhrase}. That combination is what successful recomposition looks like — you are losing fat and holding or adding muscle, which the scale cannot show. Hold the current target rather than reacting to the plateau.`,
            true
        )
    }

    // Losing too fast with the training suffering. The priority here is muscle,
    // not the timetable.
    if (weight === 'falling-fast' && (strength.overall === 'declining' || poorRecovery(subjective))) {
        const recoveryNote =
            subjective.recovery !== null && subjective.recovery < POOR_RECOVERY
                ? ` Recovery has also been rated ${subjective.recovery.toFixed(1)} out of 5 across your recent check-ins.`
                : ''
        return read(
            'too-aggressive',
            'Losing faster than planned',
            `Weight is coming off at ${rateText(rateKgPerWeek)}, faster than intended, and performance is ${strengthPhrase}.${recoveryNote} Do not reduce calories further — this is the point where the loss starts coming out of muscle and training quality.`,
            true
        )
    }

    // The good case.
    if (
        weight === 'falling' &&
        (waistDirection === 'falling' || waistDirection === 'unknown') &&
        strength.overall !== 'declining'
    ) {
        const strengthNote =
            strength.overall === 'insufficient-data'
                ? ''
                : ` and strength is ${strengthPhrase}`
        const waistNote = waistDirection === 'falling' ? `, ${waistPhrase}` : ''
        return read(
            'recomp-going-well',
            'Progressing well',
            `Bodyweight is falling at ${rateText(rateKgPerWeek)}${waistNote}${strengthNote}. Continue the current nutrition target.`
        )
    }

    // A genuine stall — but only callable as one when the intake behind it was
    // actually logged, and the tape agrees with the scale.
    if (weight === 'flat' && waistDirection !== 'falling') {
        if (!adherenceIsGood) {
            return read(
                'insufficient-data',
                'Not enough logged intake to tell',
                `Weight has been flat, but intake is only logged on ${Math.round(adherence.coverage * 100)}% of recent days. That is not enough to know whether the target is wrong or simply was not followed.`,
                true
            )
        }
        if (waistDirection === 'unknown') {
            return read(
                'stalled',
                'Weight has been flat',
                'Bodyweight has been stable despite well-logged intake. A waist measurement or two would settle whether this is a genuine stall or a recomposition the scale cannot see.',
                true
            )
        }
        return read(
            'stalled',
            'Weight and waist both flat',
            'Both bodyweight and waist have been stable despite strong intake adherence. A small calorie reduction may be appropriate.'
        )
    }

    if (weight === 'rising') {
        return read(
            'gaining',
            'Weight is rising',
            `The scale is moving up at ${rateText(rateKgPerWeek)} against a phase meant to bring it down. Worth checking intake logging is complete before changing anything.`
        )
    }

    // Everything else: the signals disagree, which is worth saying plainly
    // rather than forcing into one of the tidy cases above.
    return read(
        'mixed',
        'Signals are mixed',
        `Weight is ${weight === 'falling-fast' ? 'falling quickly' : weight}, ${waistPhrase}, and strength is ${strengthPhrase}. No single reading here is decisive — give it another few weeks before drawing a conclusion.`
    )
}

/** Whether recent check-ins report recovery poor enough to be worth mentioning. */
function poorRecovery(s: SubjectiveRead): boolean {
    return s.recovery !== null && s.recovery < POOR_RECOVERY
}

/** "−0.21 kg/week", with a real minus sign. */
function rateText(rate: number | null): string {
    if (rate === null) return 'an unknown rate'
    return `${rate < 0 ? '−' : '+'}${Math.abs(rate).toFixed(2)} kg/week`
}

/** The waist clause of a sentence, or a neutral phrase when there is no reading. */
function waistText(waist: MeasurementTrend | MeasurementGap): string {
    if (typeof waist === 'string') return 'waist has not been measured enough to read'
    const change = waist.recentChangeCm
    if (change === null) {
        return `waist is ${waist.current.cm.toFixed(1)} cm`
    }
    if (Math.abs(change) < 0.5) return 'waist has held steady this month'
    return `waist is ${change < 0 ? 'down' : 'up'} ${Math.abs(change).toFixed(1)} cm this month`
}
