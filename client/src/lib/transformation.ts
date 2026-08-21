import { measurementDirection, type MeasurementGap, type MeasurementTrend } from './bodyMeasurements'
import { centreRate, type RateIntent } from './nutritionConfig'
import { PERFORMANCE_LABELS, type PerformanceStatus, type StrengthSummary } from './strengthTrend'
import { daysBetween } from './weightTrend'
import type { Adherence } from './nutritionAdjustment'
import type { GoalMode, ProgressCheckIn } from '../types'

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

/**
 * How the scale is moving *relative to what was asked for*.
 *
 * Not "up" or "down" — that framing is what made the first version of this
 * module quietly assume everyone was dieting, and report a lean bulk gaining
 * exactly on plan as a failure. What matters is the relationship between the
 * observed rate and the intended one, which reads the same whether the intent
 * is to lose, hold or gain.
 */
export type Pace = 'as-intended' | 'faster' | 'slower' | 'flat' | 'wrong-way' | 'unknown'

export const PACE_LABELS: Record<Pace, string> = {
    'as-intended': 'As intended',
    faster: 'Faster than intended',
    slower: 'Slower than intended',
    flat: 'Flat',
    'wrong-way': 'Moving the wrong way',
    unknown: 'Unknown',
}

/** Below this a weekly rate is noise rather than movement (kg/week). */
export const FLAT_RATE_KG = 0.05

/**
 * Where an observed rate sits against the intent.
 *
 * "Faster" always means further along the intended direction than asked for, and
 * "slower" always means short of it — so on a cut, faster is losing harder, and
 * on a bulk, faster is gaining harder. A maintenance intent has no direction to
 * be fast in, so any real drift is simply not as intended.
 */
export function paceOf(rateKgPerWeek: number | null, rate: RateIntent | null): Pace {
    if (rateKgPerWeek === null) return 'unknown'
    if (!rate) return Math.abs(rateKgPerWeek) < FLAT_RATE_KG ? 'flat' : 'unknown'

    const band = rate.acceptable
    if (band && rateKgPerWeek >= band.min && rateKgPerWeek <= band.max) return 'as-intended'

    if (rate.direction === 'hold') {
        return Math.abs(rateKgPerWeek) < FLAT_RATE_KG ? 'as-intended' : 'wrong-way'
    }

    const intended = rate.direction === 'down' ? -1 : 1
    const along = rateKgPerWeek * intended // positive = moving the intended way

    if (along <= -FLAT_RATE_KG) return 'wrong-way'
    if (Math.abs(rateKgPerWeek) < FLAT_RATE_KG) return 'flat'

    const centre = centreRate(rate)
    if (centre === null) return 'unknown'
    return Math.abs(rateKgPerWeek) > Math.abs(centre) ? 'faster' : 'slower'
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
    'wrong-way',
    'mixed',
    'insufficient-data',
] as const
export type ProgressPattern = (typeof PROGRESS_PATTERNS)[number]

export interface TransformationSignals {
    /** Where the scale sits against what was asked for. */
    pace: Pace
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
    /**
     * The goal's rate intent — target, band and direction. Absent for a phase
     * that never stated one, which limits what can be concluded but breaks
     * nothing.
     */
    rate?: RateIntent | null
    /**
     * What the goal is for. Reserved for wording that `rate.direction` cannot
     * settle on its own; the pattern logic reads the rate intent.
     */
    goalMode?: GoalMode
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
    const {
        rateKgPerWeek,
        rate = null,
        waist,
        strength,
        adherence,
        checkIns,
        asOf,
    } = input

    const pace = paceOf(rateKgPerWeek, rate)
    const waistDirection = measurementDirection(waist)
    const subjective = subjectiveRead(checkIns, asOf)
    const adherenceIsGood = adherence.coverage >= GOOD_COVERAGE && adherence.loggedDays >= 14

    const signals: TransformationSignals = {
        pace,
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
    /*
     * Whether the tape contradicts the scale — not whether it confirms it.
     *
     * The distinction matters because most people will not have measured a waist
     * at all, and an absent measurement is not evidence against progress. Only a
     * waist actually going the wrong way counts against a rate that is otherwise
     * on plan. On a bulk it never does: a slowly growing waist is the expected
     * cost of gaining, and this model cannot tell slow growth from fast.
     */
    const wantsWaistDown = rate?.direction !== 'up'
    const waistHelping = wantsWaistDown ? waistDirection !== 'rising' : true

    if (pace === 'unknown') {
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
        (pace === 'flat' || pace === 'slower') &&
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

    // Moving faster than intended, with the cost showing. On the way down that
    // cost is muscle and training quality; on the way up it is fat gained faster
    // than it needs to be. Both are worth flagging, for different reasons.
    if (pace === 'faster' && rate?.direction === 'down' && (strength.overall === 'declining' || poorRecovery(subjective))) {
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

    if (pace === 'faster' && rate?.direction === 'up') {
        return read(
            'too-aggressive',
            'Gaining faster than planned',
            `Weight is going on at ${rateText(rateKgPerWeek)}, faster than the plan asked for. More of that is likely to be fat than you intended — easing the surplus back keeps the gain leaner.`
        )
    }

    // The good case: moving as asked, with nothing contradicting it.
    if (pace === 'as-intended' && waistHelping && strength.overall !== 'declining') {
        const strengthNote =
            strength.overall === 'insufficient-data' ? '' : ` and strength is ${strengthPhrase}`
        const waistNote = waistDirection === 'falling' ? `, ${waistPhrase}` : ''
        return read(
            'recomp-going-well',
            'Progressing well',
            `Bodyweight is moving at ${rateText(rateKgPerWeek)}, inside the intended range${waistNote}${strengthNote}. Continue the current nutrition target.`
        )
    }

    // Short of the intended pace — but only callable a stall when the intake
    // behind it was actually logged, and the tape agrees with the scale.
    if (pace === 'flat' || pace === 'slower') {
        if (!adherenceIsGood) {
            return read(
                'insufficient-data',
                'Not enough logged intake to tell',
                `Progress has been slower than intended, but intake is only logged on ${Math.round(adherence.coverage * 100)}% of recent days. That is not enough to know whether the target is wrong or simply was not followed.`,
                true
            )
        }
        if (waistDirection === 'unknown' && wantsWaistDown) {
            return read(
                'stalled',
                'Weight has been flat',
                'Bodyweight has been stable despite well-logged intake. A waist measurement or two would settle whether this is a genuine stall or a recomposition the scale cannot see.',
                true
            )
        }
        return read(
            'stalled',
            'Short of the intended pace',
            `The scale is moving at ${rateText(rateKgPerWeek)}, short of what the plan asked for, and ${waistPhrase}. Adherence has been strong, so a small calorie adjustment may be appropriate.`
        )
    }

    if (pace === 'wrong-way') {
        return read(
            'wrong-way',
            'Moving the wrong way',
            `The scale is moving at ${rateText(rateKgPerWeek)}, against the direction this phase is aiming for. Worth checking intake logging is complete before changing anything.`
        )
    }

    // Everything else: the signals disagree, which is worth saying plainly
    // rather than forcing into one of the tidy cases above.
    return read(
        'mixed',
        'Signals are mixed',
        `The scale is ${PACE_LABELS[pace].toLowerCase()}, ${waistPhrase}, and strength is ${strengthPhrase}. No single reading here is decisive — give it another few weeks before drawing a conclusion.`
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
