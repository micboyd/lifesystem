import { describe, it, expect } from 'vitest'
import { watchCalibration, factorOf, FACTOR_MIN } from './watchCalibration'
import type { DailyEnergy } from '../types'
import type { TrendPoint } from './weightTrend'

const TODAY = '2026-11-04'

function day(n: number): string {
    const d = new Date(`${TODAY}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() - n)
    return d.toISOString().slice(0, 10)
}

/** `days` days before today, each eating `eat` and the watch saying `out`. */
function history(days: number, eat: number, out: number) {
    const intake = new Map<string, number>()
    const energy: DailyEnergy[] = []
    for (let i = 1; i <= days; i++) {
        intake.set(day(i), eat)
        energy.push({ _id: day(i), date: day(i), caloriesOut: out } as DailyEnergy)
    }
    return { intake, energy }
}

/** A trend falling at `rate` kg/week across the four weeks. */
function trend(rate: number): TrendPoint[] {
    return [28, 21, 14, 7, 1].map((n) => {
        const kg = 100 + (rate * (28 - n)) / 7
        return { date: day(n), weight: kg, trend: kg }
    })
}

describe('watchCalibration', () => {
    it("reads the watch's error off the scale", () => {
        // Eating 2,600 and losing 0.5 kg/week: really burning 2,600 + 550 = 3,150.
        // The watch says 3,400, so it reads about 7% high.
        const { intake, energy } = history(20, 2600, 3400)
        const c = watchCalibration(intake, energy, trend(-0.5), TODAY)
        expect(c).toMatchObject({ maintenance: 3150, avgOut: 3400, days: 20, factor: 0.93 })
    })

    it('leaves an accurate watch alone', () => {
        const { intake, energy } = history(20, 2600, 3200)
        expect(factorOf(watchCalibration(intake, energy, trend(-0.5), TODAY))).toBe(1)
    })

    it('never corrects past the clamp', () => {
        const { intake, energy } = history(20, 1500, 4500)
        expect(factorOf(watchCalibration(intake, energy, trend(0), TODAY))).toBe(FACTOR_MIN)
    })

    it('only counts days with both food and a burn', () => {
        const { intake, energy } = history(20, 2600, 3400)
        expect(watchCalibration(intake, energy.slice(0, 10), trend(-0.5), TODAY)).toBe('not-enough-days')
    })

    it('needs weigh-ins', () => {
        const { intake, energy } = history(20, 2600, 3400)
        expect(watchCalibration(intake, energy, [], TODAY)).toBe('not-enough-weight')
        expect(factorOf('not-enough-weight')).toBe(1)
    })
})
