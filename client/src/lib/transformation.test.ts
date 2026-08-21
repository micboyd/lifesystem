import { describe, it, expect } from 'vitest'
import {
    readTransformation,
    weightDirection,
    subjectiveRead,
    POOR_RECOVERY,
    type TransformationInput,
} from './transformation'
import { measurementTrend } from './bodyMeasurements'
import { strengthSummary } from './strengthTrend'
import { adherence, reviewNutrition } from './nutritionAdjustment'
import { weightTrend } from './nutritionTrend'
import { trendSeries } from './weightTrend'
import type {
    EntryStatus,
    MealPlanEntry,
    NutritionPhase,
    PhaseGoal,
    ProgressCheckIn,
    WeightLog,
    WorkoutLog,
} from '../types'

const ASOF = '2026-11-01'
const BAND = { min: -0.3, max: -0.15 }

function plus(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

/**
 * Weekly waist readings ending at ASOF, starting at `from` and losing `perMonth`
 * cm every four weeks — so the oldest reading is the largest.
 */
function waistLogs(from: number, perMonth: number, weeks = 13): WeightLog[] {
    const span = (weeks - 1) * 7
    return Array.from({ length: weeks }, (_, i) => {
        const back = span - i * 7
        return {
            _id: String(i),
            date: plus(ASOF, -back),
            weight: 100,
            waist: from - (perMonth * (span - back)) / 28,
            createdAt: '',
            updatedAt: '',
        }
    })
}

function workouts(name: string, topSet: number, perSession: number, count = 12): WorkoutLog[] {
    return Array.from({ length: count }, (_, i) => ({
        _id: `${name}-${i}`,
        workout: null,
        name: 'Session',
        date: plus(ASOF, -(count - 1 - i) * 7),
        exercises: [{ name, loggedSets: [{ weight: topSet + perSession * i, reps: 5 }] }],
        createdAt: '',
        updatedAt: '',
    })) as WorkoutLog[]
}

function checkIn(date: string, recovery: number, extra: Partial<ProgressCheckIn> = {}): ProgressCheckIn {
    return { _id: date, date, recovery, createdAt: '', updatedAt: '', ...extra }
}

function entry(date: string, calories: number, protein: number, status: EntryStatus = 'eaten'): MealPlanEntry {
    return {
        _id: `${date}`,
        date,
        slot: 'dinner',
        adhoc: { name: 'day', macros: { calories, protein, carbs: 0, fat: 0 } },
        servings: 1,
        status,
        order: 0,
        createdAt: '',
        updatedAt: '',
    } as MealPlanEntry
}

const GOAL: PhaseGoal = {
    style: 'recomp',
    startWeightKg: 103,
    targetDate: '2027-05-31',
    targetWeightKg: 95,
    targetWeeklyRateKg: -0.2,
    acceptableWeeklyRateKg: BAND,
    proteinFloorG: 210,
    adaptive: true,
}

function phase(): NutritionPhase {
    return {
        _id: 'p1',
        name: 'Recomp to 20%',
        startDate: '2026-08-21',
        endDate: '2027-05-31',
        kind: 'cut',
        targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
        weeklyRate: -0.2,
        goal: GOAL,
        createdAt: '',
        updatedAt: '',
    } as NutritionPhase
}

/** 21 well-logged days on target. */
const GOOD_LOG = Array.from({ length: 21 }, (_, i) => entry(plus(ASOF, -(20 - i)), 2950, 211))

function build(over: Partial<TransformationInput> = {}): TransformationInput {
    return {
        rateKgPerWeek: -0.2,
        rateBand: BAND,
        waist: measurementTrend(waistLogs(112, 1.2), 'waist', ASOF),
        strength: strengthSummary(workouts('Back Squat', 120, 0), ASOF),
        adherence: adherence(GOOD_LOG, [phase()], null, ASOF),
        checkIns: [],
        asOf: ASOF,
        ...over,
    }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('weightDirection', () => {
    it('calls a rate inside the band falling', () => {
        expect(weightDirection(-0.2, BAND)).toBe('falling')
    })

    it('calls a rate well past the band falling fast', () => {
        expect(weightDirection(-0.55, BAND)).toBe('falling-fast')
    })

    it('does not call a rate just outside the band fast', () => {
        expect(weightDirection(-0.35, BAND)).toBe('falling')
    })

    it('calls a near-zero rate flat', () => {
        expect(weightDirection(-0.02, BAND)).toBe('flat')
        expect(weightDirection(0.03, BAND)).toBe('flat')
    })

    it('calls a rising scale rising', () => {
        expect(weightDirection(0.2, BAND)).toBe('rising')
    })

    it('is unknown without a rate', () => {
        expect(weightDirection(null, BAND)).toBe('unknown')
    })

    it('falls back to half a kilo a week without a band', () => {
        expect(weightDirection(-0.4, null)).toBe('falling')
        expect(weightDirection(-0.7, null)).toBe('falling-fast')
    })
})

describe('subjectiveRead', () => {
    it('averages recent check-ins', () => {
        const s = subjectiveRead(
            [checkIn(plus(ASOF, -60), 2), checkIn(plus(ASOF, -30), 4)],
            ASOF
        )
        expect(s.recovery).toBe(3)
        expect(s.checkIns).toBe(2)
    })

    it('refuses an average from a single check-in', () => {
        expect(subjectiveRead([checkIn(plus(ASOF, -10), 2)], ASOF).recovery).toBeNull()
    })

    it('ignores check-ins outside the window', () => {
        const s = subjectiveRead(
            [checkIn(plus(ASOF, -200), 1), checkIn(plus(ASOF, -10), 4)],
            ASOF
        )
        expect(s.checkIns).toBe(1)
        expect(s.recovery).toBeNull()
    })

    it('takes clothes fit from the most recent check-in', () => {
        const s = subjectiveRead(
            [
                checkIn(plus(ASOF, -60), 3, { clothesFit: 'same' }),
                checkIn(plus(ASOF, -20), 3, { clothesFit: 'looser' }),
            ],
            ASOF
        )
        expect(s.clothesFit).toBe('looser')
    })

    it('leaves unanswered ratings null rather than zero', () => {
        const s = subjectiveRead([checkIn(plus(ASOF, -30), 4), checkIn(plus(ASOF, -10), 4)], ASOF)
        expect(s.recovery).toBe(4)
        expect(s.energy).toBeNull()
        expect(s.hunger).toBeNull()
    })
})

describe('readTransformation', () => {
    it('recognises a recomp going well', () => {
        const r = readTransformation(build())
        expect(r.pattern).toBe('recomp-going-well')
        expect(r.holdsAgainstReduction).toBe(false)
        expect(r.detail).toMatch(/waist is down/)
    })

    it('recognises a recomp behind a scale plateau', () => {
        const r = readTransformation(
            build({
                rateKgPerWeek: -0.01,
                strength: strengthSummary(workouts('Back Squat', 110, 2.5), ASOF),
            })
        )
        expect(r.pattern).toBe('recomp-despite-plateau')
        expect(r.holdsAgainstReduction).toBe(true)
        expect(r.detail).toMatch(/recomposition/i)
    })

    it('recognises a cut that has gone too far', () => {
        const r = readTransformation(
            build({
                rateKgPerWeek: -0.6,
                strength: strengthSummary(workouts('Back Squat', 130, -3), ASOF),
                checkIns: [checkIn(plus(ASOF, -40), 2), checkIn(plus(ASOF, -10), 2)],
            })
        )
        expect(r.pattern).toBe('too-aggressive')
        expect(r.holdsAgainstReduction).toBe(true)
        expect(r.detail).toMatch(/Do not reduce calories further/)
        expect(r.detail).toMatch(/Recovery has also been rated/)
    })

    it('flags a fast loss on poor recovery even with strength holding', () => {
        const r = readTransformation(
            build({
                rateKgPerWeek: -0.6,
                checkIns: [
                    checkIn(plus(ASOF, -40), POOR_RECOVERY - 1),
                    checkIn(plus(ASOF, -10), POOR_RECOVERY - 1),
                ],
            })
        )
        expect(r.pattern).toBe('too-aggressive')
    })

    it('recognises a genuine stall', () => {
        const r = readTransformation(
            build({ rateKgPerWeek: -0.01, waist: measurementTrend(waistLogs(112, 0), 'waist', ASOF) })
        )
        expect(r.pattern).toBe('stalled')
        expect(r.holdsAgainstReduction).toBe(false)
        expect(r.detail).toMatch(/small calorie reduction may be appropriate/)
    })

    it('will not call a plateau a stall when intake was barely logged', () => {
        const thin = Array.from({ length: 6 }, (_, i) => entry(plus(ASOF, -i), 2950, 211))
        const r = readTransformation(
            build({
                rateKgPerWeek: -0.01,
                waist: measurementTrend(waistLogs(112, 0), 'waist', ASOF),
                adherence: adherence(thin, [phase()], null, ASOF),
            })
        )
        expect(r.pattern).toBe('insufficient-data')
        expect(r.holdsAgainstReduction).toBe(true)
    })

    it('asks for a waist reading before calling a plateau a stall', () => {
        const r = readTransformation(build({ rateKgPerWeek: -0.01, waist: 'none' }))
        expect(r.pattern).toBe('stalled')
        expect(r.holdsAgainstReduction).toBe(true)
        expect(r.detail).toMatch(/waist measurement/)
    })

    it('reports a rising scale', () => {
        expect(readTransformation(build({ rateKgPerWeek: 0.25 })).pattern).toBe('gaining')
    })

    it('does not pretend certainty without a weight trend', () => {
        const r = readTransformation(build({ rateKgPerWeek: null }))
        expect(r.pattern).toBe('insufficient-data')
        expect(r.holdsAgainstReduction).toBe(false)
    })

    it('works with no waist, no strength history and no check-ins', () => {
        const r = readTransformation(
            build({ waist: 'none', strength: strengthSummary([], ASOF), checkIns: [] })
        )
        expect(r.pattern).toBe('recomp-going-well')
        expect(r.signals.strength).toBe('insufficient-data')
    })
})

describe('the veto in the calorie engine', () => {
    /** A review of a dead-flat, well-logged month with the given context. */
    function reviewFlat(context: ReturnType<typeof readTransformation> | null) {
        const logs: WeightLog[] = Array.from({ length: 28 }, (_, i) => ({
            _id: String(i),
            date: plus(ASOF, -(27 - i)),
            weight: 100,
            createdAt: '',
            updatedAt: '',
        }))
        const p = phase()
        return reviewNutrition({
            phase: p,
            entries: GOOD_LOG,
            phases: [p],
            settingsGoals: null,
            trend: weightTrend(logs, ASOF),
            weightPoints: trendSeries(logs),
            asOf: ASOF,
            context,
        })
    }

    it('reduces on a flat scale when nothing contradicts it', () => {
        expect(reviewFlat(null).action).toBe('reduce')
    })

    it('withholds the reduction when waist and strength say recomposition', () => {
        const context = readTransformation(
            build({
                rateKgPerWeek: -0.01,
                strength: strengthSummary(workouts('Back Squat', 110, 2.5), ASOF),
            })
        )
        const r = reviewFlat(context)
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('contradicted')
        expect(r.deltaKcal).toBe(0)
        expect(r.reason).toMatch(/recomposition/i)
    })

    it('still reduces when waist agrees the stall is real', () => {
        const context = readTransformation(
            build({ rateKgPerWeek: -0.01, waist: measurementTrend(waistLogs(112, 0), 'waist', ASOF) })
        )
        expect(reviewFlat(context).action).toBe('reduce')
    })

    it('never lets context cause a reduction that the scale did not', () => {
        // A rate squarely on target, with every supporting signal at its worst.
        const logs: WeightLog[] = Array.from({ length: 28 }, (_, i) => ({
            _id: String(i),
            date: plus(ASOF, -(27 - i)),
            weight: 100 + (0.2 * (27 - i)) / 7,
            createdAt: '',
            updatedAt: '',
        }))
        const p = phase()
        const context = readTransformation(
            build({
                rateKgPerWeek: -0.2,
                waist: measurementTrend(waistLogs(112, 0), 'waist', ASOF),
                strength: strengthSummary(workouts('Back Squat', 130, -3), ASOF),
                checkIns: [checkIn(plus(ASOF, -40), 1), checkIn(plus(ASOF, -10), 1)],
            })
        )
        const r = reviewNutrition({
            phase: p,
            entries: GOOD_LOG,
            phases: [p],
            settingsGoals: null,
            trend: weightTrend(logs, ASOF),
            weightPoints: trendSeries(logs),
            asOf: ASOF,
            context,
        })
        expect(r.action).toBe('hold')
        expect(r.holdReason).toBe('on-target')
    })
})
