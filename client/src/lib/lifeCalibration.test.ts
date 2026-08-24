import { describe, it, expect } from 'vitest'
import {
    MIN_BUCKET,
    MIN_DROP,
    MIN_MONTHS,
    SUSTAINED_WEEKS,
    VOLUME_HEADROOM,
    calibrate,
    calibrateReserve,
    capacitiesFrom,
    explain,
    monthOutcome,
    sustainedVolume,
    type MonthOutcome,
    type OutcomeInput,
    type Sample,
} from './lifeCalibration'
import { computeMonthLoads, type MonthLoad } from './lifeLoad'
import type { LifePlan } from '../types'

const NO_LOGS: OutcomeInput = {
    fitnessEntries: [],
    workoutLogs: [],
    conditioningLogs: [],
    mealEntries: [],
    habitLogs: [],
    habitCount: 0,
}

/** `n` planned sessions in a month, of which `done` were logged. */
function sessions(month: string, n: number, done: number): Partial<OutcomeInput> {
    const day = (i: number) => `${month}-${String(i + 1).padStart(2, '0')}`
    return {
        fitnessEntries: Array.from({ length: n }, (_, i) => ({
            date: day(i),
            kind: 'workout' as const,
        })),
        workoutLogs: Array.from({ length: done }, (_, i) => ({ date: day(i) })),
    }
}

function samples(pairs: [demand: number, adherence: number][]): Sample[] {
    return pairs.map(([demand, adherence], i) => ({
        month: `2026-${String(i + 1).padStart(2, '0')}`,
        demand,
        adherence,
    }))
}

describe('monthOutcome', () => {
    it('reports nothing rather than zero for a month that planned nothing', () => {
        const outcome = monthOutcome('2026-05', NO_LOGS)
        expect(outcome.adherence).toBeNull()
        expect(outcome.signals).toBe(0)
    })

    it('reads sessions logged against sessions planned', () => {
        const outcome = monthOutcome('2026-05', { ...NO_LOGS, ...sessions('2026-05', 20, 15) })
        expect(outcome.adherence).toBe(0.75)
        expect(outcome.signals).toBe(1)
    })

    it('ignores logs from other months', () => {
        const outcome = monthOutcome('2026-05', {
            ...NO_LOGS,
            ...sessions('2026-05', 10, 5),
            workoutLogs: [
                ...Array.from({ length: 5 }, (_, i) => ({ date: `2026-05-0${i + 1}` })),
                { date: '2026-06-01' },
                { date: '2026-04-01' },
            ],
        })
        expect(outcome.adherence).toBe(0.5)
    })

    it('pools every signal by how much it was measuring', () => {
        const outcome = monthOutcome('2026-05', {
            ...NO_LOGS,
            // 20 sessions, all done.
            ...sessions('2026-05', 20, 20),
            // 4 meals, none eaten — real, but a quarter of the weight.
            mealEntries: [
                { date: '2026-05-01', status: 'planned' },
                { date: '2026-05-02', status: 'planned' },
                { date: '2026-05-03', status: 'planned' },
                { date: '2026-05-04', status: 'planned' },
            ],
        })
        expect(outcome.adherence).toBe(20 / 24)
        expect(outcome.signals).toBe(2)
    })

    it('scores habits against every tick the month made available', () => {
        // Two habits across 30 days in June = 60 available, 30 landed.
        const outcome = monthOutcome('2026-06', {
            ...NO_LOGS,
            habitCount: 2,
            habitLogs: Array.from({ length: 40 }, (_, i) => ({
                date: `2026-06-${String((i % 30) + 1).padStart(2, '0')}`,
                completed: i < 30,
            })),
        })
        expect(outcome.adherence).toBe(0.5)
    })

    it('does not let over-delivery paper over a shortfall', () => {
        const outcome = monthOutcome('2026-05', { ...NO_LOGS, ...sessions('2026-05', 10, 18) })
        expect(outcome.adherence).toBe(1)
    })
})

describe('calibrateReserve', () => {
    it('refuses to fit anything on a short history', () => {
        const short = samples([
            [4, 0.9],
            [4, 0.9],
            [9, 0.5],
            [9, 0.5],
        ])
        expect(short.length).toBeLessThan(MIN_MONTHS)
        expect(calibrateReserve('body', short)).toBe('not-enough-history')
    })

    it('finds the demand where adherence falls away', () => {
        // Four quiet months held up; four heavy ones did not.
        const fitted = calibrateReserve(
            'body',
            samples([
                [4, 0.9],
                [5, 0.86],
                [5, 0.9],
                [6, 0.88],
                [8, 0.6],
                [8, 0.62],
                [9, 0.58],
                [10, 0.64],
            ])
        )
        if (typeof fitted === 'string') throw new Error(`expected a fit, got ${fitted}`)
        expect(fitted.ceiling).toBe(8)
        expect(fitted.monthsAbove).toBe(4)
        expect(fitted.monthsBelow).toBe(4)
        expect(fitted.above).toBeCloseTo(0.61, 2)
        expect(fitted.below).toBeCloseTo(0.89, 2)
        expect(fitted.drop).toBeGreaterThan(MIN_DROP)
    })

    it('says nothing when the heavy months went just as well as the quiet ones', () => {
        const fitted = calibrateReserve(
            'body',
            samples([
                [3, 0.88],
                [4, 0.9],
                [5, 0.86],
                [6, 0.91],
                [8, 0.87],
                [9, 0.89],
                [10, 0.9],
                [11, 0.85],
            ])
        )
        expect(fitted).toBe('no-clear-break')
    })

    it('will not set a ceiling off one bad month', () => {
        // A single catastrophic month at the top of the range is a fact about that
        // month, not a ceiling. It drags any bucket's mean far enough to invent
        // one; the median it sits in does not move.
        const fitted = calibrateReserve(
            'body',
            samples([
                [3, 0.9],
                [4, 0.9],
                [5, 0.9],
                [6, 0.9],
                [7, 0.9],
                [8, 0.9],
                [9, 0.9],
                [12, 0.1],
            ])
        )
        expect(fitted).toBe('no-clear-break')
        expect(MIN_BUCKET).toBeGreaterThan(1)
    })

    it('takes the more generous of two splits that explain the history equally well', () => {
        // Splitting at 6 and at 8 separate these months almost identically. The
        // months at 6 went fine, so calling 6 the ceiling would nag about nothing.
        const fitted = calibrateReserve(
            'body',
            samples([
                [4, 0.9],
                [5, 0.86],
                [5, 0.9],
                [6, 0.88],
                [8, 0.6],
                [8, 0.62],
                [9, 0.58],
                [10, 0.64],
            ])
        )
        if (typeof fitted === 'string') throw new Error(`expected a fit, got ${fitted}`)
        expect(fitted.ceiling).toBe(8)
    })

    it('ignores months where the reserve was not being spent at all', () => {
        const fitted = calibrateReserve(
            'money',
            samples([
                [0, 0.2],
                [0, 0.2],
                [0, 0.2],
                [0, 0.2],
                [400, 0.9],
                [400, 0.9],
                [900, 0.5],
            ])
        )
        // Only three months actually spent money — below the floor.
        expect(fitted).toBe('not-enough-history')
    })

    it('prefers the split with the biggest drop when several qualify', () => {
        const fitted = calibrateReserve(
            'focus',
            samples([
                [1, 0.95],
                [1, 0.95],
                [2, 0.9],
                [2, 0.9],
                [3, 0.85],
                [4, 0.4],
                [4, 0.42],
                [5, 0.38],
            ])
        )
        if (typeof fitted === 'string') throw new Error(`expected a fit, got ${fitted}`)
        expect(fitted.ceiling).toBe(4)
    })
})

describe('calibrate', () => {
    /** A year of Januarys through Augusts carrying `demand` body units each. */
    function loadsWithBody(perMonth: number[]): MonthLoad[] {
        const plan: LifePlan = {
            _id: 'p',
            name: '2026',
            start: '2026-01',
            end: `2026-${String(perMonth.length).padStart(2, '0')}`,
            pillars: [],
            seasons: [],
            order: 0,
            createdAt: '',
            updatedAt: '',
        }
        const loads = computeMonthLoads({ plan })
        return loads.map((load, i) => ({
            ...load,
            reserves: {
                ...load.reserves,
                body: { ...load.reserves.body, demand: perMonth[i] },
            },
        }))
    }

    it('matches loads to outcomes by month and skips months with no logs', () => {
        const loads = loadsWithBody([4, 5, 5, 6, 8, 8, 9, 10])
        const adherence = [0.9, 0.86, 0.9, 0.88, 0.6, 0.62, 0.58, 0.64]
        const outcomes: MonthOutcome[] = loads.map((l, i) => ({
            month: l.month,
            adherence: adherence[i],
            signals: 1,
        }))
        // Blanking one month's outcome drops it below the floor entirely.
        outcomes[0] = { month: outcomes[0].month, adherence: null, signals: 0 }
        expect(calibrate(loads, outcomes).body).toBeUndefined()

        outcomes[0] = { month: outcomes[0].month, adherence: 0.9, signals: 1 }
        expect(calibrate(loads, outcomes).body?.ceiling).toBe(8)
    })

    it('leaves reserves it cannot fit out of the result entirely', () => {
        const loads = loadsWithBody([4, 5, 5, 6, 8, 8, 9, 10])
        const outcomes = loads.map((l) => ({ month: l.month, adherence: 0.8, signals: 1 }))
        expect(calibrate(loads, outcomes)).toEqual({})
    })
})

describe('capacitiesFrom', () => {
    it('turns a fitted ceiling into a capacity that says where it came from', () => {
        const calibration = {
            body: {
                reserve: 'body' as const,
                ceiling: 8,
                above: 0.61,
                below: 0.885,
                monthsAbove: 4,
                monthsBelow: 4,
                drop: 0.275,
            },
        }
        expect(capacitiesFrom(calibration)).toEqual({
            body: { value: 8, basis: 'calibrated' },
        })
    })

    it('is empty when nothing was fitted, so the priors stand', () => {
        expect(capacitiesFrom({})).toEqual({})
    })
})

describe('explain', () => {
    it('puts the arithmetic on show', () => {
        expect(
            explain({
                reserve: 'body',
                ceiling: 8,
                above: 0.61,
                below: 0.88,
                monthsAbove: 4,
                monthsBelow: 5,
                drop: 0.27,
            })
        ).toBe(
            '4 months at or above 8 typically ran at 61% adherence, against 88% across the 5 below it.'
        )
    })
})

describe('sustainedVolume', () => {
    /**
     * `count` sessions in the week beginning `monday`.
     *
     * Formatted locally rather than through `toISOString`, which would push a
     * local midnight back into the previous day — and so the previous week —
     * anywhere east of UTC.
     */
    function weekOf(monday: string, count: number): { date: string }[] {
        const start = new Date(`${monday}T00:00:00`)
        return Array.from({ length: count }, (_, i) => {
            const d = new Date(start)
            d.setDate(d.getDate() + (i % 7))
            const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            return { date: iso }
        })
    }

    const today = '2026-08-24'

    it('says nothing on too few weeks of logs', () => {
        expect(sustainedVolume([...weekOf('2026-08-17', 5)], today)).toBeNull()
        expect(sustainedVolume([], today)).toBeNull()
    })

    it('reads the volume you have repeatedly managed, plus headroom', () => {
        const logs = [
            ...weekOf('2026-08-17', 6),
            ...weekOf('2026-08-10', 6),
            ...weekOf('2026-08-03', 6),
            ...weekOf('2026-07-27', 4),
        ]
        // Six in three separate weeks, so six is proven; the ceiling sits above it.
        expect(sustainedVolume(logs, today)).toBe(6 + VOLUME_HEADROOM)
    })

    it('ignores a single freak week', () => {
        const logs = [
            ...weekOf('2026-08-17', 10),
            ...weekOf('2026-08-10', 4),
            ...weekOf('2026-08-03', 4),
            ...weekOf('2026-07-27', 4),
        ]
        expect(sustainedVolume(logs, today)).toBe(4 + VOLUME_HEADROOM)
        expect(SUSTAINED_WEEKS).toBeGreaterThan(1)
    })

    it('is not raised by weeks off, nor lowered by them', () => {
        const busy = [
            ...weekOf('2026-08-17', 5),
            ...weekOf('2026-08-10', 5),
            ...weekOf('2026-08-03', 5),
        ]
        const withBreak = [...busy, ...weekOf('2026-06-15', 0)]
        expect(sustainedVolume(withBreak, today)).toBe(sustainedVolume(busy, today))
    })

    it('looks no further back than its window', () => {
        const old = [
            ...weekOf('2026-01-05', 8),
            ...weekOf('2026-01-12', 8),
            ...weekOf('2026-01-19', 8),
        ]
        expect(sustainedVolume(old, today)).toBeNull()
    })
})
