import { describe, it, expect } from 'vitest'
import {
    dayRecords,
    mondayOf,
    overallScore,
    summarise,
    weekScores,
    type ConsistencyInputs,
} from './consistency'
import type {
    ConditioningLog,
    DailyEnergy,
    FitnessPlanEntry,
    MacroGoals,
    MealPlanEntry,
    MealType,
    WeightLog,
    WorkoutLog,
} from '../types'

const TODAY = '2026-10-26' // a Monday
const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 }
const GOALS: MacroGoals = { calories: 2000, protein: 200 }

let seq = 0

function workout(date: string, id = 'w1', over: Partial<FitnessPlanEntry> = {}): FitnessPlanEntry {
    return {
        _id: `entry-${++seq}`,
        date,
        part: 'morning',
        kind: 'workout',
        workout: { _id: id, name: `Workout ${id}` },
        session: null,
        plan: null,
        order: 0,
        ...over,
    } as unknown as FitnessPlanEntry
}

function conditioning(date: string, id = 'c1', over: Partial<FitnessPlanEntry> = {}): FitnessPlanEntry {
    return workout(date, id, { kind: 'conditioning', workout: null, session: { _id: id } as never, ...over })
}

function wlog(date: string, workoutId = 'w1'): WorkoutLog {
    return { _id: `wl-${++seq}`, workout: workoutId, date } as WorkoutLog
}

function clog(date: string, sessionId = 'c1'): ConditioningLog {
    return { _id: `cl-${++seq}`, session: sessionId, date } as ConditioningLog
}

function meal(date: string, slot: MealType, calories: number, over: Partial<MealPlanEntry> = {}): MealPlanEntry {
    return {
        _id: `m-${++seq}`,
        date,
        slot,
        name: 'Chicken & rice',
        macros: { ...ZERO, calories, protein: calories / 10 },
        status: 'eaten',
        extra: false,
        order: 0,
        ...over,
    } as MealPlanEntry
}

function weigh(date: string): WeightLog {
    return { _id: date, date, weight: 100 } as WeightLog
}

function energy(date: string, caloriesOut: number): DailyEnergy {
    return { _id: date, date, caloriesOut } as DailyEnergy
}

function inputs(over: Partial<ConsistencyInputs> = {}): ConsistencyInputs {
    return {
        from: '2026-10-20',
        today: TODAY,
        training: [],
        workoutLogs: [],
        conditioningLogs: [],
        meals: [],
        targetsOn: () => ({ goals: GOALS, kind: 'cut' }),
        weightLogs: [],
        energy: [],
        ...over,
    }
}

const day = (i: ConsistencyInputs, date: string) => dayRecords(i).find((d) => d.date === date)!

describe('mondayOf', () => {
    it('finds the Monday of the week, Sunday included', () => {
        expect(mondayOf('2026-10-26')).toBe('2026-10-26')
        expect(mondayOf('2026-10-25')).toBe('2026-10-19')
        expect(mondayOf('2026-10-22')).toBe('2026-10-19')
    })
})

describe('training', () => {
    it('counts a planned session done when it was logged that day', () => {
        const i = inputs({ training: [workout('2026-10-21')], workoutLogs: [wlog('2026-10-21')] })
        expect(day(i, '2026-10-21').sessions).toMatchObject({ due: 1, done: 1, missed: 0 })
    })

    it('counts a session done a day late or a day early, one log per session', () => {
        const i = inputs({
            training: [workout('2026-10-21'), workout('2026-10-23')],
            workoutLogs: [wlog('2026-10-22')],
        })
        const s = summarise(dayRecords(i), TODAY).training
        expect(s.sessions).toMatchObject({ done: 1, of: 2 })
        expect(s.missed).toBe(1)
    })

    it('gives a same-day log to its own day before a shuffled neighbour', () => {
        const i = inputs({
            training: [workout('2026-10-21'), workout('2026-10-22')],
            workoutLogs: [wlog('2026-10-22')],
        })
        expect(day(i, '2026-10-22').sessions.done).toBe(1)
        expect(day(i, '2026-10-21').sessions.missed).toBe(1)
    })

    it('counts a skipped session as not done', () => {
        const i = inputs({ training: [workout('2026-10-21', 'w1', { skipped: true })] })
        expect(day(i, '2026-10-21').sessions).toMatchObject({ due: 1, done: 0, skipped: 1, missed: 0 })
    })

    it('leaves today’s still-to-do session out, but counts it once logged', () => {
        expect(day(inputs({ training: [workout(TODAY)] }), TODAY).sessions.due).toBe(0)
        const done = inputs({ training: [workout(TODAY)], workoutLogs: [wlog(TODAY)] })
        expect(day(done, TODAY).sessions).toMatchObject({ due: 1, done: 1 })
    })

    it('splits strength from conditioning and counts unplanned logs as extra', () => {
        const i = inputs({
            training: [workout('2026-10-21'), conditioning('2026-10-22')],
            workoutLogs: [wlog('2026-10-21'), wlog('2026-10-24', 'w9')],
        })
        const s = summarise(dayRecords(i), TODAY).training
        expect(s.strength).toMatchObject({ done: 1, of: 1 })
        expect(s.conditioning).toMatchObject({ done: 0, of: 1 })
        expect(s.extra).toBe(1)
        expect(s.score).toBe(50)
    })

    it('matches conditioning logs by session', () => {
        const i = inputs({ training: [conditioning('2026-10-22')], conditioningLogs: [clog('2026-10-22')] })
        expect(day(i, '2026-10-22').sessions.done).toBe(1)
    })
})

describe('nutrition', () => {
    it('judges calories the way the planner does', () => {
        const i = inputs({
            meals: [
                meal('2026-10-20', 'dinner', 2050), // within tolerance
                meal('2026-10-21', 'dinner', 2400), // over on a cut
                meal('2026-10-22', 'dinner', 1850), // a little under on a cut is fine
                meal('2026-10-23', 'dinner', 1400), // far under
            ],
        })
        expect(day(i, '2026-10-20').calories).toBe('on')
        expect(day(i, '2026-10-21').calories).toBe('over')
        expect(day(i, '2026-10-22').calories).toBe('on')
        expect(day(i, '2026-10-23').calories).toBe('under')
    })

    it('counts a day with nothing ticked eaten as not logged — a miss', () => {
        const i = inputs({
            meals: [meal('2026-10-20', 'dinner', 2000), meal('2026-10-21', 'dinner', 2000, { status: 'planned' })],
        })
        expect(day(i, '2026-10-21')).toMatchObject({ calories: 'unlogged', protein: 'unlogged' })
        // Days after the last entry are still tracked days.
        expect(day(i, '2026-10-23').calories).toBe('unlogged')
        const s = summarise(dayRecords(i), TODAY).nutrition
        expect(s.calories).toMatchObject({ done: 1, unlogged: 5 })
    })

    it('doesn’t judge days before the first thing on the meal plan', () => {
        const i = inputs({ meals: [meal('2026-10-23', 'dinner', 2000)] })
        expect(day(i, '2026-10-22').calories).toBeNull()
        expect(day(i, '2026-10-23').calories).toBe('on')
    })

    it('doesn’t judge an away day on calories or protein', () => {
        const i = inputs({
            meals: [meal('2026-10-21', 'lunch', 0, { away: true, status: 'planned' }), meal('2026-10-21', 'dinner', 800)],
        })
        expect(day(i, '2026-10-21')).toMatchObject({ calories: null, protein: null })
        expect(day(i, '2026-10-21').meals).toEqual({ due: 1, eaten: 1 })
    })

    it('hits protein from 95%, with no ceiling', () => {
        const i = inputs({
            meals: [
                meal('2026-10-20', 'dinner', 2000, { macros: { ...ZERO, calories: 2000, protein: 190 } }),
                meal('2026-10-21', 'dinner', 2000, { macros: { ...ZERO, calories: 2000, protein: 189 } }),
                meal('2026-10-22', 'dinner', 2000, { macros: { ...ZERO, calories: 2000, protein: 260 } }),
            ],
        })
        expect(day(i, '2026-10-20').protein).toBe('hit')
        expect(day(i, '2026-10-21').protein).toBe('short')
        expect(day(i, '2026-10-22').protein).toBe('hit')
    })

    it('counts planned meals ticked eaten, leaving extras and away notes out', () => {
        const i = inputs({
            meals: [
                meal('2026-10-21', 'breakfast', 500),
                meal('2026-10-21', 'lunch', 700, { status: 'planned' }),
                meal('2026-10-21', 'dinner', 0, { away: true, status: 'planned' }),
                meal('2026-10-21', 'snack', 200, { extra: true }),
            ],
        })
        expect(day(i, '2026-10-21')).toMatchObject({ meals: { due: 2, eaten: 1 }, extras: 1 })
    })

    it('counts what’s done today, judges no calories until it’s over', () => {
        const i = inputs({
            from: TODAY,
            meals: [
                meal(TODAY, 'breakfast', 600, { macros: { ...ZERO, calories: 2500, protein: 200 } }),
                meal(TODAY, 'lunch', 700, { status: 'planned' }),
            ],
        })
        expect(day(i, TODAY)).toMatchObject({ meals: { due: 1, eaten: 1 }, calories: null, protein: 'hit' })
        const short = inputs({ from: TODAY, meals: [meal(TODAY, 'breakfast', 600)] })
        expect(day(short, TODAY).protein).toBeNull()
    })

    it('averages the judged days and the balance on days with calories out', () => {
        const i = inputs({
            meals: [meal('2026-10-20', 'dinner', 2000), meal('2026-10-21', 'dinner', 2200)],
            energy: [energy('2026-10-20', 2600), energy('2026-10-21', 2600)],
        })
        const s = summarise(dayRecords(i), TODAY).nutrition
        expect(s.average).toEqual({ calories: 2100, target: 2000, protein: 210, proteinTarget: 200 })
        expect(s.balance).toEqual({ kcal: -500, days: 2 })
    })

    it('scores nutrition as the mean of calories, protein and meals', () => {
        const i = inputs({
            from: '2026-10-24',
            meals: [
                meal('2026-10-24', 'dinner', 2000, { macros: { ...ZERO, calories: 2000, protein: 100 } }),
                meal('2026-10-25', 'dinner', 2000, { macros: { ...ZERO, calories: 2000, protein: 100 } }),
                meal('2026-10-25', 'lunch', 500, { status: 'planned' }),
            ],
        })
        const s = summarise(dayRecords(i), TODAY).nutrition
        expect(s.calories).toMatchObject({ done: 2, of: 2, pct: 100 })
        expect(s.protein).toMatchObject({ done: 0, of: 2, pct: 0 })
        expect(s.meals).toMatchObject({ done: 2, of: 3, pct: 67 })
        expect(s.score).toBe(56)
    })
})

describe('weigh-ins', () => {
    it('keeps a day up with a weigh-in in the 7 days up to it', () => {
        const i = inputs({ from: '2026-10-10', weightLogs: [weigh('2026-10-12'), weigh('2026-10-19')] })
        expect(day(i, '2026-10-11').weighIn).toBeNull() // none in the 30 days before
        expect(day(i, '2026-10-12').weighIn).toBe('done')
        expect(day(i, '2026-10-18').weighIn).toBe('done') // six days on
        expect(day(i, '2026-10-25').weighIn).toBe('done')
        expect(summarise(dayRecords(i), TODAY).body.weighIns).toMatchObject({ done: 14, of: 14 })
    })

    it('misses a day once a week has gone by, but leaves today open', () => {
        const i = inputs({ weightLogs: [weigh('2026-10-14')] })
        expect(day(i, '2026-10-20').weighIn).toBe('done')
        expect(day(i, '2026-10-21').weighIn).toBe('missed') // seven days on
        expect(day(i, TODAY).weighIn).toBeNull() // today, not yet
    })
})

describe('summarise', () => {
    it('weights the overall score: training and nutrition 40%, body 20%', () => {
        expect(overallScore({ training: 100, nutrition: 50, body: 0 })).toBe(60)
        expect(overallScore({ training: 100, nutrition: null, body: 50 })).toBe(83)
        expect(overallScore({ training: null, nutrition: null, body: null })).toBeNull()
    })

    it('counts finished days where everything due was met', () => {
        const i = inputs({
            from: '2026-10-24',
            training: [workout('2026-10-24'), workout('2026-10-25')],
            workoutLogs: [wlog('2026-10-24')],
            meals: [meal('2026-10-24', 'dinner', 2000), meal('2026-10-25', 'dinner', 2000)],
        })
        // The 25th's session went unlogged — the log on the 24th is spoken for.
        expect(summarise(dayRecords(i), TODAY).perfectDays).toEqual({ done: 1, of: 2, pct: 50 })
    })

    it('leaves days with nothing but a weigh-in out of the full days', () => {
        const i = inputs({ from: '2026-10-24', weightLogs: [weigh('2026-10-24')] })
        expect(summarise(dayRecords(i), TODAY).perfectDays.of).toBe(0)
    })

    it('doesn’t count a day as full when a weigh-in was missed', () => {
        const i = inputs({
            from: '2026-10-24',
            training: [workout('2026-10-24')],
            workoutLogs: [wlog('2026-10-24')],
            weightLogs: [weigh('2026-10-10')],
        })
        expect(summarise(dayRecords(i), TODAY).perfectDays).toMatchObject({ done: 0, of: 1 })
    })

    it('has nothing to score with nothing planned or logged', () => {
        const s = summarise(dayRecords(inputs()), TODAY)
        expect(s.overall).toBeNull()
        expect(s.perfectDays.of).toBe(0)
    })
})

describe('weekScores', () => {
    it('scores each Monday-to-Sunday week, newest first', () => {
        const i = inputs({
            from: '2026-10-12',
            training: [workout('2026-10-14'), workout('2026-10-21'), workout('2026-10-23')],
            workoutLogs: [wlog('2026-10-14'), wlog('2026-10-21')],
        })
        const weeks = weekScores(dayRecords(i), TODAY, 8)
        expect(weeks.map((w) => w.start)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12'])
        expect(weeks[0]).toMatchObject({ current: true, training: null })
        expect(weeks[1].training).toBe(50)
        expect(weeks[2].training).toBe(100)
    })
})
