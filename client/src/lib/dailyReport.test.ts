import { describe, expect, it } from 'vitest'
import {
    bannerReportDate,
    buildDailyReport,
    categoryLabel,
    reportHeadline,
    type ReportInputs,
} from './dailyReport'
import type {
    FitnessPlanEntry,
    HabitDef,
    MealPlanEntry,
    NutritionPhase,
    StarlingSpendItem,
    WorkoutLog,
} from '../types'

const DAY = '2026-09-23'
const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

function inputs(over: Partial<ReportInputs> = {}): ReportInputs {
    return {
        spend: { status: 'ok', items: [], from: '2026-09-16' },
        workouts: [],
        conditioning: [],
        mobility: [],
        recovery: [],
        habits: [],
        habitLogs: [],
        tasks: [],
        meals: [],
        phases: [],
        settingsGoals: null,
        fitnessPlan: [],
        weights: [],
        ...over,
    }
}

function spend(
    date: string,
    amount: number,
    over: Partial<StarlingSpendItem> = {}
): StarlingSpendItem {
    return {
        id: `${date}-${amount}-${Math.random()}`,
        date,
        time: `${date}T12:00:00Z`,
        amount,
        merchant: 'Tesco',
        category: 'GROCERIES',
        space: 'Spending',
        ...over,
    }
}

function habit(id: string, over: Partial<HabitDef> = {}): HabitDef {
    return { _id: id, name: id, order: 0, active: true, ...STAMP, ...over }
}

function workout(over: Partial<WorkoutLog> = {}): WorkoutLog {
    return {
        _id: 'w1',
        workout: 'lib1',
        name: 'Push',
        date: DAY,
        exercises: [],
        ...STAMP,
        ...over,
    }
}

function meal(over: Partial<MealPlanEntry> = {}): MealPlanEntry {
    return {
        _id: 'm1',
        date: DAY,
        slot: 'lunch',
        name: 'Lunch',
        macros: { calories: 600, protein: 40, carbs: 50, fat: 20 },
        status: 'eaten',
        extra: false,
        order: 0,
        ...STAMP,
        ...over,
    } as MealPlanEntry
}

describe('bannerReportDate', () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 23, h, m)

    it('is hidden through the afternoon and early evening', () => {
        expect(bannerReportDate(at(12))).toBeNull()
        expect(bannerReportDate(at(20, 59))).toBeNull()
    })

    it("offers today's report from 9pm", () => {
        expect(bannerReportDate(at(21))).toBe('2026-09-23')
        expect(bannerReportDate(at(23, 59))).toBe('2026-09-23')
    })

    it("keeps offering yesterday's report until noon", () => {
        expect(bannerReportDate(at(0, 5))).toBe('2026-09-22')
        expect(bannerReportDate(at(11, 59))).toBe('2026-09-22')
    })
})

describe('money', () => {
    it('totals every space and groups by category, biggest first', () => {
        const r = buildDailyReport(
            DAY,
            inputs({
                spend: {
                    status: 'ok',
                    from: '2026-09-16',
                    items: [
                        spend(DAY, 12.5),
                        spend(DAY, 30, {
                            category: 'EATING_OUT',
                            merchant: 'Dishoom',
                            space: 'Fun',
                        }),
                        spend(DAY, 4.2, { category: null, merchant: null }),
                        spend('2026-09-22', 99),
                    ],
                },
            })
        )
        expect(r.money?.total).toBe(46.7)
        expect(r.money?.count).toBe(3)
        expect(r.money?.categories.map((c) => c.label)).toEqual([
            'Eating out',
            'Groceries',
            'Other',
        ])
        expect(r.money?.largest?.merchant).toBe('Dishoom')
    })

    it('averages the week before, counting quiet days as zero', () => {
        const items = [spend('2026-09-22', 70), spend(DAY, 5)]
        const r = buildDailyReport(
            DAY,
            inputs({ spend: { status: 'ok', items, from: '2026-09-16' } })
        )
        expect(r.money?.weekAverage).toBe(10)
    })

    it("doesn't average days the fetch never covered", () => {
        const r = buildDailyReport(
            DAY,
            inputs({ spend: { status: 'ok', items: [], from: '2026-09-22' } })
        )
        expect(r.money?.weekAverage).toBeNull()
    })

    it('flags a spike and praises a no-spend day', () => {
        const spike = buildDailyReport(
            DAY,
            inputs({
                spend: {
                    status: 'ok',
                    from: '2026-09-16',
                    items: [spend('2026-09-20', 70), spend(DAY, 80)],
                },
            })
        )
        expect(spike.misses.some((n) => n.area === 'money')).toBe(true)

        const quiet = buildDailyReport(DAY, inputs())
        expect(quiet.wins.map((n) => n.text)).toContain('No-spend day')
    })

    it('carries on without spending when Starling is unavailable', () => {
        const r = buildDailyReport(
            DAY,
            inputs({ spend: { status: 'unavailable', message: 'nope' } })
        )
        expect(r.money).toBeNull()
        expect(r.moneyError).toBe('nope')
    })
})

describe('training', () => {
    it('reads logged sessions with sets and volume', () => {
        const r = buildDailyReport(
            DAY,
            inputs({
                workouts: [
                    workout({
                        durationMin: 55,
                        exercises: [
                            {
                                name: 'Bench',
                                loggedSets: [
                                    { weight: 80, reps: 8 },
                                    { weight: 80, reps: 6 },
                                ],
                            },
                            { name: 'Dips' },
                        ],
                    }),
                ],
            })
        )
        expect(r.training.minutes).toBe(55)
        expect(r.training.sessions[0].detail).toBe('2 exercises · 2 sets · 1,120 kg lifted')
    })

    it('names planned sessions that were never logged, and only those', () => {
        const plan = (id: string, name: string) =>
            ({
                _id: `p-${id}`,
                date: DAY,
                part: 'morning',
                kind: 'workout',
                workout: { _id: id, name },
                session: null,
                recovery: null,
                mobility: null,
                plan: null,
                order: 0,
                ...STAMP,
            }) as unknown as FitnessPlanEntry
        const r = buildDailyReport(
            DAY,
            inputs({
                workouts: [workout({ workout: 'lib1' })],
                fitnessPlan: [plan('lib1', 'Push'), plan('lib2', 'Pull')],
            })
        )
        expect(r.training.missed).toEqual(['Pull'])
    })
})

describe('habits', () => {
    it("doesn't count a habit that didn't exist yet as missed", () => {
        const r = buildDailyReport(
            DAY,
            inputs({
                habits: [
                    habit('read'),
                    habit('walk'),
                    habit('new', { createdAt: '2026-09-24T08:00:00.000Z' }),
                    habit('old', { active: false }),
                ],
                habitLogs: [{ _id: 'l1', habit: 'read', date: DAY, completed: true }],
            })
        )
        expect(r.habits.done.map((h) => h._id)).toEqual(['read'])
        expect(r.habits.missed.map((h) => h._id)).toEqual(['walk'])
    })
})

describe('food', () => {
    const phase = (kind: NutritionPhase['kind']) =>
        ({
            _id: 'ph',
            name: 'Phase',
            kind,
            startDate: '2026-09-01',
            endDate: '2026-12-01',
            targets: { calories: 2000, protein: 180 },
            adjustments: [],
            ...STAMP,
        }) as unknown as NutritionPhase

    it('calls out calories over target on a cut, and short protein', () => {
        const r = buildDailyReport(
            DAY,
            inputs({
                phases: [phase('cut')],
                meals: [
                    meal({
                        name: 'Big',
                        macros: { calories: 2500, protein: 100, carbs: 0, fat: 0 },
                    }),
                ],
            })
        )
        expect(r.misses.map((n) => n.text)).toEqual(
            expect.arrayContaining(['500 kcal over target', 'Protein short by 80 g'])
        )
    })

    it('treats undereating as the miss on a bulk', () => {
        const r = buildDailyReport(DAY, inputs({ phases: [phase('gain')], meals: [meal()] }))
        expect(r.misses.some((n) => n.text.includes('short of a bulk target'))).toBe(true)
    })

    it('notices a day where nothing was marked eaten', () => {
        const r = buildDailyReport(DAY, inputs({ meals: [meal({ status: 'planned' })] }))
        expect(r.nutrition?.mealsUnmarked).toBe(1)
        expect(r.misses.map((n) => n.text)).toContain('No meals marked as eaten')
    })
})

describe('headline', () => {
    it('says so when a day is empty', () => {
        const r = buildDailyReport(DAY, inputs({ spend: { status: 'unavailable', message: '' } }))
        expect(r.empty).toBe(true)
        expect(reportHeadline(r)).toMatch(/Nothing recorded/)
    })
})

describe('categoryLabel', () => {
    it('reads Starling categories as words', () => {
        expect(categoryLabel('BILLS_AND_SERVICES')).toBe('Bills & services')
        expect(categoryLabel('NONE')).toBe('Other')
    })
})
