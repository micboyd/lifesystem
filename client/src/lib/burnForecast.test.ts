import { describe, it, expect } from 'vitest'
import { burnDayType, forecastBurn, outForTarget, MIN_FORECAST_SAMPLES } from './burnForecast'
import type { DailyEnergy, FitnessPlanEntry } from '../types'

const TODAY = '2026-11-04'

function burn(date: string, caloriesOut: number): DailyEnergy {
    return { _id: date, date, caloriesOut } as DailyEnergy
}

function fit(date: string, kind: FitnessPlanEntry['kind'], extra: Partial<FitnessPlanEntry> = {}): FitnessPlanEntry {
    return {
        _id: `${date}-${kind}-${extra.order ?? 0}`,
        date,
        part: 'morning',
        kind,
        workout: null,
        session: null,
        plan: null,
        order: 0,
        createdAt: '',
        updatedAt: '',
        ...extra,
    } as FitnessPlanEntry
}

// Three rest days around 2,600 and three training days around 3,300 last week.
const energy = [
    burn('2026-10-27', 2600),
    burn('2026-10-28', 3300),
    burn('2026-10-29', 2500),
    burn('2026-10-30', 3200),
    burn('2026-10-31', 2700),
    burn('2026-11-01', 3400),
]
const fitness = [fit('2026-10-28', 'workout'), fit('2026-10-30', 'workout'), fit('2026-11-01', 'workout')]

describe('burnDayType', () => {
    it('treats an empty day and a skipped session as rest', () => {
        expect(burnDayType('2026-10-27', fitness)).toBe('rest')
        expect(burnDayType('2026-11-05', [fit('2026-11-05', 'workout', { skipped: true })])).toBe('rest')
        expect(burnDayType('2026-10-28', fitness)).toBe('standard')
    })
})

describe('forecastBurn', () => {
    it('averages recent days that trained the same way', () => {
        const training = forecastBurn('2026-11-06', energy, [...fitness, fit('2026-11-06', 'workout')], TODAY)
        expect(training).toEqual({ kcal: 3300, dayType: 'standard', basis: 'day-type', samples: 3 })
        expect(forecastBurn('2026-11-07', energy, fitness, TODAY)?.kcal).toBe(2600)
    })

    it('falls back to every logged day when too few trained that way', () => {
        const hard = [fit('2026-11-06', 'workout'), fit('2026-11-06', 'conditioning', { order: 1 })]
        const f = forecastBurn('2026-11-06', energy, [...fitness, ...hard], TODAY)
        expect(f).toMatchObject({ dayType: 'hard', basis: 'all-days', samples: 6, kcal: 2950 })
    })

    it('has nothing to say on too little history', () => {
        expect(forecastBurn('2026-11-06', energy.slice(0, MIN_FORECAST_SAMPLES - 1), fitness, TODAY)).toBeNull()
    })

    it('only looks back from the day itself when it has passed', () => {
        // Before the 30th only three days are logged, and only one of them trained.
        expect(forecastBurn('2026-10-30', energy, fitness, TODAY)).toMatchObject({ basis: 'all-days', samples: 3 })
    })

    it('ignores days more than four weeks back', () => {
        const old = [burn('2026-09-01', 5000), burn('2026-09-02', 5000), burn('2026-09-03', 5000)]
        expect(forecastBurn('2026-11-07', [...old, ...energy], fitness, TODAY)?.kcal).toBe(2600)
    })
})

describe('outForTarget', () => {
    it('prefers the logged figure, then the forecast', () => {
        expect(outForTarget('2026-11-01', energy, fitness, TODAY)).toEqual({
            kcal: 3400,
            watch: 3400,
            expected: false,
            adjusted: false,
        })
        expect(outForTarget('2026-11-07', energy, fitness, TODAY)).toMatchObject({ kcal: 2600, expected: true })
        expect(outForTarget('2026-11-07', [], fitness, TODAY)).toBeNull()
    })

    it("applies the watch's correction to logged and expected figures alike", () => {
        expect(outForTarget('2026-11-01', energy, fitness, TODAY, 0.93)).toEqual({
            kcal: 3162,
            watch: 3400,
            expected: false,
            adjusted: true,
        })
        expect(outForTarget('2026-11-07', energy, fitness, TODAY, 0.93)?.kcal).toBe(2418)
    })
})
