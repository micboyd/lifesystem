import { describe, it, expect } from 'vitest'
import { partAt, sessionKey, yourDay, type YourDayInputs } from './yourDay'
import type { FitnessPlanEntry, HabitDef, MealPlanEntry, MealType, WeightLog } from '../types'

const TODAY = '2026-10-26'
const ZERO = { calories: 0, protein: 0, carbs: 0, fat: 0 }

function workout(id: string, part: FitnessPlanEntry['part'], over: Partial<FitnessPlanEntry> = {}): FitnessPlanEntry {
    return {
        _id: `entry-${id}`,
        date: TODAY,
        part,
        kind: 'workout',
        workout: { _id: id, name: `Workout ${id}`, main: [{}, {}, {}] },
        session: null,
        plan: null,
        order: 0,
        ...over,
    } as unknown as FitnessPlanEntry
}

function meal(slot: MealType, over: Partial<MealPlanEntry> = {}): MealPlanEntry {
    return {
        _id: over.name ? `${slot}-${over.name}` : slot,
        date: TODAY,
        slot,
        name: 'Chicken & rice',
        macros: { ...ZERO, calories: 600, protein: 50 },
        status: 'planned',
        extra: false,
        ...over,
    } as MealPlanEntry
}

function habit(id: string, part?: HabitDef['part']): HabitDef {
    return { _id: id, name: `Habit ${id}`, part, order: 0, active: true } as HabitDef
}

function weigh(date: string, weight = 92.4): WeightLog {
    return { _id: date, date, weight } as WeightLog
}

function inputs(over: Partial<YourDayInputs> = {}): YourDayInputs {
    return {
        date: TODAY,
        today: TODAY,
        nowMin: 8 * 60,
        training: [],
        logged: new Set(),
        meals: [],
        goals: null,
        eaten: { ...ZERO },
        habits: [],
        habitsDone: new Set(),
        weightLogs: [],
        events: [],
        ...over,
    }
}

const ids = (d: ReturnType<typeof yourDay>) => d.steps.map((s) => s.id)
const step = (d: ReturnType<typeof yourDay>, id: string) => d.steps.find((s) => s.id === id)!

describe('partAt', () => {
    it('splits the day at noon and five', () => {
        expect(partAt(11 * 60 + 59)).toBe('morning')
        expect(partAt(12 * 60)).toBe('afternoon')
        expect(partAt(17 * 60)).toBe('evening')
    })
})

describe('yourDay', () => {
    it('lays the day out in order: weigh-in, training and meals by part, then all day', () => {
        const d = yourDay(
            inputs({
                training: [workout('b', 'evening'), workout('a', 'morning')],
                meals: [meal('dinner'), meal('breakfast'), meal('lunch')],
                goals: { calories: 2100, protein: 180 },
                habits: [habit('h1'), habit('h2', 'morning'), habit('h3', 'evening')],
                weightLogs: [weigh('2026-10-20')],
                events: [{ id: 'e1', title: 'Dentist', part: 'afternoon', time: '15:00' }],
            })
        )
        expect(ids(d)).toEqual([
            'weigh',
            'training-entry-a',
            'meal-breakfast',
            'habit-h2',
            'meal-lunch',
            'event-e1',
            'training-entry-b',
            'meal-dinner',
            'habit-h3',
            'habit-h1',
            'protein',
            'calories',
        ])
    })

    it('counts sessions done from the logs, and a skipped one as no longer a task', () => {
        const d = yourDay(
            inputs({
                // A day gone, so there's no meal plan to ask for.
                date: '2026-10-25',
                training: [workout('a', 'morning'), workout('b', 'evening', { skipped: true, skipReason: 'Sore' })],
                logged: new Set([sessionKey('workout', 'a')]),
            })
        )
        expect(step(d, 'training-entry-a')).toMatchObject({ state: 'done', detail: 'Strength · 3 exercises' })
        expect(step(d, 'training-entry-b')).toMatchObject({ state: 'handled', detail: 'Skipped · Sore' })
        expect(d).toMatchObject({ done: 1, total: 1, perfect: true })
    })

    it('says rest on a day with no training, without making it a task', () => {
        const d = yourDay(inputs({ date: '2026-10-25' }))
        expect(step(d, 'rest').state).toBe('info')
        expect(d.total).toBe(0)
        expect(d.perfect).toBe(false)
    })

    it('ticks each meal off on its own, even two in one slot', () => {
        const d = yourDay(
            inputs({
                meals: [
                    meal('lunch', { name: 'Wrap', status: 'eaten' }),
                    meal('lunch', { name: 'Apple', status: 'planned' }),
                    meal('dinner', { name: 'Stew', status: 'eaten' }),
                ],
            })
        )
        expect(step(d, 'meal-lunch-Wrap')).toMatchObject({ title: 'Lunch', state: 'done', detail: 'Wrap · 600 kcal' })
        expect(step(d, 'meal-lunch-Apple')).toMatchObject({ title: 'Lunch', state: 'todo', detail: 'Apple · 600 kcal' })
        expect(step(d, 'meal-dinner-Stew').state).toBe('done')
        expect(d).toMatchObject({ done: 2, total: 3 })
    })

    it('puts snacks with the any-time things, behind a meal due now for next', () => {
        const d = yourDay(inputs({ nowMin: 13 * 60, meals: [meal('lunch'), meal('snack')] }))
        expect(step(d, 'meal-snack')).toMatchObject({ title: 'Snack', part: null })
        expect(d.next?.id).toBe('meal-lunch')
    })

    it('names a plate by its foods, as the planner does', () => {
        const plate = [{ name: 'Chilli box' }, { name: 'Rice' }] as MealPlanEntry['plate']
        const d = yourDay(inputs({ meals: [meal('lunch', { name: 'Chilli box · Rice', plate })] }))
        expect(ids(d)).toContain('meal-lunch-Chilli box · Rice')
        expect(step(d, 'meal-lunch-Chilli box · Rice').detail).toBe('Chilli box + Rice · 600 kcal')
    })

    it('shows a box note without a figure, and an away slot as handled', () => {
        const d = yourDay(
            inputs({
                meals: [
                    meal('lunch', { name: 'Chilli box + rice', box: 'box1', macros: { ...ZERO } }),
                    meal('dinner', { name: 'Work do', away: true }),
                ],
            })
        )
        expect(step(d, 'meal-lunch-Chilli box + rice').detail).toBe('Chilli box + rice · from the box')
        expect(step(d, 'meal-dinner-Work do')).toMatchObject({ state: 'handled', detail: 'Away · Work do' })
    })

    it('asks for a plan when no meals are planned today or ahead, but not for a day gone', () => {
        expect(ids(yourDay(inputs()))).toContain('plan-meals')
        expect(ids(yourDay(inputs({ date: '2026-10-25' })))).not.toContain('plan-meals')
    })

    it('only adds a weigh-in for someone who weighs in', () => {
        expect(ids(yourDay(inputs()))).not.toContain('weigh')
        expect(ids(yourDay(inputs({ weightLogs: [weigh('2026-09-01')] })))).not.toContain('weigh')
        expect(step(yourDay(inputs({ weightLogs: [weigh('2026-10-24')] })), 'weigh').state).toBe('todo')
        expect(step(yourDay(inputs({ weightLogs: [weigh(TODAY, 91.95)] })), 'weigh')).toMatchObject({
            state: 'done',
            detail: '92.0 kg',
        })
        expect(step(yourDay(inputs({ weightLogs: [weigh(TODAY, 104.2)], weightRate: -0.684 })), 'weigh').detail).toBe(
            '104.2 kg · −0.68 kg/wk'
        )
    })

    it('judges protein from 5% under and calories within 5% either side', () => {
        const at = (calories: number, protein: number) =>
            yourDay(inputs({ goals: { calories: 2000, protein: 180 }, eaten: { ...ZERO, calories, protein } }))
        expect(step(at(1500, 150), 'protein')).toMatchObject({ state: 'todo', detail: '150 g so far · 30 g to go' })
        expect(step(at(1500, 170), 'protein').state).toBe('todo')
        expect(step(at(1500, 171), 'protein').state).toBe('done')
        // More protein is never a miss.
        expect(step(at(1500, 250), 'protein').state).toBe('done')
        expect(step(at(1500, 150), 'calories')).toMatchObject({ state: 'todo', detail: '1,500 eaten · 500 left' })
        expect(step(at(1899, 150), 'calories').state).toBe('todo')
        expect(step(at(1900, 150), 'calories')).toMatchObject({ state: 'done', detail: '1,900 eaten · on target' })
        expect(step(at(2100, 150), 'calories').state).toBe('done')
        expect(step(at(2101, 150), 'calories')).toMatchObject({ state: 'over', detail: '101 kcal over' })
        expect(step(at(2300, 150), 'calories')).toMatchObject({ state: 'over', detail: '300 kcal over' })
        // Over is a miss: the day can't be perfect.
        expect(at(2300, 180).perfect).toBe(false)
    })

    it('puts a habit with a time of day in that part, and counts it there for next', () => {
        const d = yourDay(inputs({ nowMin: 20 * 60, habits: [habit('h1', 'evening')], date: TODAY, meals: [meal('dinner', { status: 'eaten' })] }))
        expect(step(d, 'habit-h1').part).toBe('evening')
        expect(d.next?.id).toBe('habit-h1')
    })

    it('picks what to do next: now, then later, then missed, then all day', () => {
        const day = (nowMin: number, over: Partial<YourDayInputs> = {}) =>
            yourDay(
                inputs({
                    nowMin,
                    meals: [meal('breakfast'), meal('lunch'), meal('dinner')],
                    habits: [habit('h1')],
                    goals: { calories: 2000 },
                    ...over,
                })
            ).next?.id
        expect(day(8 * 60)).toBe('meal-breakfast')
        expect(day(13 * 60)).toBe('meal-lunch')
        // Lunch eaten in the afternoon: dinner's next, ahead of the missed breakfast.
        expect(day(14 * 60, { meals: [meal('breakfast'), meal('lunch', { status: 'eaten' }), meal('dinner')] })).toBe(
            'meal-dinner'
        )
        expect(day(21 * 60, { meals: [meal('breakfast'), meal('dinner', { status: 'eaten' })] })).toBe('meal-breakfast')
        // Calories are a limit, never the next thing to do.
        expect(day(21 * 60, { meals: [meal('dinner', { status: 'eaten' })] })).toBe('habit-h1')
        expect(day(21 * 60, { meals: [meal('dinner', { status: 'eaten' })], habitsDone: new Set(['h1']) })).toBeUndefined()
    })

    it('has no now or next on another day', () => {
        const d = yourDay(inputs({ date: '2026-10-27', meals: [meal('lunch', { date: '2026-10-27' })] }))
        expect(d.nowPart).toBeNull()
        expect(d.next).toBeNull()
    })

    it('is perfect once every task is done', () => {
        const d = yourDay(
            inputs({
                meals: [meal('lunch', { status: 'eaten' })],
                habits: [habit('h1')],
                habitsDone: new Set(['h1']),
                goals: { protein: 100 },
                eaten: { ...ZERO, protein: 120 },
            })
        )
        expect(d).toMatchObject({ done: 3, total: 3, perfect: true, next: null })
    })
})

describe('yourDay with a perfect-day selection', () => {
    // TODAY, 2026-10-26, is a Monday.
    const MON = 1
    // Leaves out the rest-day note, which shows whenever no training is planned.
    const tasks = (d: ReturnType<typeof yourDay>) => ids(d).filter((id) => id !== 'rest')

    it('shows everything when nothing has been chosen', () => {
        const d = yourDay(inputs({ meals: [meal('breakfast')], habits: [habit('h1')] }))
        expect(tasks(d)).toEqual(['meal-breakfast', 'habit-h1'])
    })

    it('drops a thing switched off, and one not due on the weekday', () => {
        const d = yourDay(
            inputs({
                meals: [meal('breakfast'), meal('lunch')],
                habits: [habit('h1'), habit('h2')],
                goals: { calories: 2100, protein: 180 },
                selection: {
                    items: [
                        { key: 'meal:lunch', days: [] },
                        { key: 'habit:h1', days: [2, 4] },
                        { key: 'calories', days: [MON] },
                    ],
                    skipFoods: [],
                },
            })
        )
        expect(ids(d)).toEqual(['meal-breakfast', 'protein', 'calories', 'habit-h2'])
    })

    it('leaves a skipped food off without asking to plan meals', () => {
        const d = yourDay(
            inputs({
                meals: [meal('breakfast', { name: 'Flat white' }), meal('breakfast', { name: 'Oats' })],
                selection: { items: [], skipFoods: ['flat white'] },
            })
        )
        expect(ids(d)).toEqual(['breakfast-Oats'])

        const only = yourDay(
            inputs({ meals: [meal('breakfast', { name: 'Flat White' })], selection: { items: [], skipFoods: ['flat white'] } })
        )
        expect(ids(only)).toEqual([])
    })

    it('skips a plate only when every food on it is skipped', () => {
        const line = (name: string) => ({ name }) as NonNullable<MealPlanEntry['plate']>[number]
        const sel = { items: [], skipFoods: ['flat white'] }
        expect(ids(yourDay(inputs({ meals: [meal('breakfast', { plate: [line('Flat white')] })], selection: sel })))).toEqual([])
        expect(
            ids(yourDay(inputs({ meals: [meal('breakfast', { plate: [line('Flat white'), line('Eggs')] })], selection: sel })))
        ).toEqual(['breakfast'])
    })

    it('makes the weigh-in a must on its chosen days, even without recent weigh-ins', () => {
        const sel = (days: number[]) => ({ items: [{ key: 'weigh', days }], skipFoods: [] })
        expect(ids(yourDay(inputs({ selection: sel([MON]) })))).toContain('weigh')
        expect(ids(yourDay(inputs({ weightLogs: [weigh('2026-10-20')], selection: sel([3]) })))).not.toContain('weigh')
    })

    it('can hide the rest-day note, events and the plan-meals nudge', () => {
        const d = yourDay(
            inputs({
                events: [{ id: 'e1', title: 'Dentist', part: 'morning' }],
                selection: {
                    items: [
                        { key: 'rest', days: [] },
                        { key: 'events', days: [] },
                        { key: 'plan-meals', days: [] },
                    ],
                    skipFoods: [],
                },
            })
        )
        expect(d.steps).toEqual([])
    })
})
