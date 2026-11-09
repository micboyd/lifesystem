import { describe, it, expect } from 'vitest'
import { addDays } from './calendar'
import { stepsSummary } from './steps'

const TODAY = '2026-11-09'

describe('stepsSummary', () => {
    it('keeps today out of the seven finished days', () => {
        const s = stepsSummary(
            [
                { date: '2026-11-02', steps: 7000 },
                { date: '2026-11-08', steps: 9000 },
                { date: TODAY, steps: 500 },
            ],
            TODAY
        )
        expect(s.today).toBe(500)
        expect(s.week).toHaveLength(7)
        expect(s.week[0].date).toBe('2026-11-02')
        expect(s.week[6].date).toBe('2026-11-08')
        expect(s.average).toBe(8000)
    })

    it('leaves a day with no figure out of the average instead of counting zero', () => {
        const s = stepsSummary([{ date: '2026-11-08', steps: 6000 }], TODAY)
        expect(s.counted).toBe(1)
        expect(s.average).toBe(6000)
        expect(s.week[0]).toEqual({ date: '2026-11-02', steps: null, hit: false })
    })

    it('counts a day that lands exactly on the target', () => {
        const s = stepsSummary(
            [
                { date: '2026-11-07', steps: 9999 },
                { date: '2026-11-08', steps: 10000 },
            ],
            TODAY,
            10000
        )
        expect(s.hit).toBe(1)
        expect(s.week[6].hit).toBe(true)
        expect(s.week[5].hit).toBe(false)
    })

    it('has nothing to report with no data, and hits nothing with no target', () => {
        const empty = stepsSummary([], TODAY, 10000)
        expect(empty).toMatchObject({ today: null, average: null, counted: 0, hit: 0 })
        expect(stepsSummary([{ date: '2026-11-08', steps: 20000 }], TODAY).hit).toBe(0)
    })
})

describe('target streak', () => {
    const met = (...dates: string[]) => dates.map((date) => ({ date, steps: 10000 }))
    const streak = (days: { date: string; steps: number }[], target: number | undefined = 10000) =>
        stepsSummary(days, TODAY, target).streak

    it('keeps going while today is still short of the target', () => {
        expect(streak([...met('2026-11-07', '2026-11-08'), { date: TODAY, steps: 300 }])).toBe(2)
    })

    it('adds today once the target is reached', () => {
        expect(streak(met('2026-11-07', '2026-11-08', TODAY))).toBe(3)
    })

    it('stops at the first missed day', () => {
        expect(streak([...met('2026-11-05'), { date: '2026-11-06', steps: 9999 }, ...met('2026-11-07', '2026-11-08')])).toBe(2)
    })

    it('stops at a day with no figure', () => {
        expect(streak(met('2026-11-05', '2026-11-07', '2026-11-08'))).toBe(2)
    })

    it('reaches further back than the seven days on show', () => {
        const days = Array.from({ length: 20 }, (_, i) => ({ date: addDays(TODAY, -(i + 1)), steps: 12000 }))
        expect(streak(days)).toBe(20)
    })

    it('is nothing when yesterday was missed or there is no target', () => {
        expect(streak(met('2026-11-07'))).toBe(0)
        expect(stepsSummary(met('2026-11-08'), TODAY).streak).toBe(0)
    })
})
