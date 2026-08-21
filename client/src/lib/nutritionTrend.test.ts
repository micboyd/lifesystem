import { describe, it, expect } from 'vitest'
import {
    weightTrend,
    regressionRate,
    usableRate,
    currentWeight,
    compositionSeries,
    compositionChange,
    MIN_COMPOSITION_SPAN_DAYS,
} from './nutritionTrend'
import type { WeightLog } from '../types'

function log(date: string, weight: number, bodyFat?: number): WeightLog {
    return {
        _id: date,
        date,
        weight,
        ...(bodyFat === undefined ? {} : { bodyFat }),
        createdAt: '',
        updatedAt: '',
    }
}

/** Add `n` days to an ISO date. */
function plus(date: string, n: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * `days` daily weigh-ins from `start` at `from` kg, changing by `perWeek` kg a
 * week, with an optional repeating wobble so the readings aren't a clean line.
 */
function series(
    start: string,
    from: number,
    perWeek: number,
    days: number,
    wobble: number[] = [0]
): WeightLog[] {
    return Array.from({ length: days }, (_, i) =>
        log(plus(start, i), from + (perWeek * i) / 7 + wobble[i % wobble.length])
    )
}

const START = '2026-08-01'

describe('weightTrend gaps', () => {
    it('reports no weights rather than inventing a figure', () => {
        expect(weightTrend([])).toBe('no-weights')
    })

    it('refuses an average from a single reading', () => {
        expect(weightTrend([log(START, 103)])).toBe('too-few-readings')
    })

    it('refuses when the only readings are outside the current window', () => {
        expect(weightTrend([log(START, 103), log(plus(START, 1), 103)], plus(START, 40))).toBe(
            'too-few-readings'
        )
    })
})

describe('weightTrend averages', () => {
    const logs = series(START, 103, -0.2, 28)
    const trend = weightTrend(logs, plus(START, 27))

    it('averages the last seven days rather than quoting the last reading', () => {
        if (typeof trend === 'string') throw new Error(trend)
        expect(trend.current.readings).toBe(7)
        expect(trend.current.kg).toBeCloseTo(102.31, 2)
        // The raw reading is lower than the average, and is not the headline.
        expect(trend.latest.kg).toBeLessThan(trend.current.kg)
    })

    it('gives the week before as its own window', () => {
        if (typeof trend === 'string') throw new Error(trend)
        expect(trend.previous?.readings).toBe(7)
        expect(trend.weekChangeKg).toBeCloseTo(-0.2, 2)
    })

    it('has no previous window when history does not reach back', () => {
        const short = weightTrend(series(START, 103, -0.2, 7), plus(START, 6))
        if (typeof short === 'string') throw new Error(short)
        expect(short.previous).toBeNull()
        expect(short.weekChangeKg).toBeNull()
    })

    it('averages over readings taken, not over the calendar', () => {
        // Three readings in the week; the missing days are absent, not zero.
        const sparse = [log(plus(START, 21), 102), log(plus(START, 24), 101.8), log(plus(START, 27), 101.6)]
        const t = weightTrend(sparse, plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.current.readings).toBe(3)
        expect(t.current.kg).toBeCloseTo(101.8, 5)
    })
})

describe('regressionRate', () => {
    it('recovers a steady loss', () => {
        const readings = series(START, 103, -0.2, 28).map((l) => ({ date: l.date, kg: l.weight }))
        expect(regressionRate(readings)).toBeCloseTo(-0.2, 6)
    })

    it('recovers a steady gain', () => {
        const readings = series(START, 80, 0.35, 28).map((l) => ({ date: l.date, kg: l.weight }))
        expect(regressionRate(readings)).toBeCloseTo(0.35, 6)
    })

    it('sees through daily noise to the underlying rate', () => {
        const noisy = series(START, 103, -0.2, 28, [0.9, -0.6, 0.4, -0.8, 0.5, -0.3, 0])
        const readings = noisy.map((l) => ({ date: l.date, kg: l.weight }))
        expect(regressionRate(readings)!).toBeCloseTo(-0.2, 1)
    })

    it('is not thrown by a heavy reading at one end', () => {
        const logs = series(START, 103, -0.2, 28)
        logs[27] = log(logs[27].date, logs[27].weight + 1.5)
        const readings = logs.map((l) => ({ date: l.date, kg: l.weight }))
        // First-minus-last would read this as roughly +0.17 kg/week.
        expect(regressionRate(readings)!).toBeLessThan(-0.1)
    })

    it('refuses with too few readings', () => {
        const readings = series(START, 103, -0.2, 5).map((l) => ({ date: l.date, kg: l.weight }))
        expect(regressionRate(readings)).toBeNull()
    })

    it('refuses when the readings are clustered into too few days', () => {
        const readings = Array.from({ length: 8 }, (_, i) => ({
            date: plus(START, i),
            kg: 103 - i * 0.05,
        }))
        // Eight readings, but spanning only seven days.
        expect(regressionRate(readings)).toBeNull()
    })

    it('refuses a flat span it cannot fit a slope to', () => {
        expect(regressionRate([])).toBeNull()
    })
})

describe('weightTrend rate', () => {
    it('reports the fitted rate when the readings support one', () => {
        const t = weightTrend(series(START, 103, -0.2, 28), plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.rateKgPerWeek).toBeCloseTo(-0.2, 4)
        expect(t.rateReadings).toBe(28)
        expect(usableRate(t)).toBeCloseTo(-0.2, 4)
        expect(currentWeight(t)).toBeCloseTo(102.31, 2)
    })

    it('leaves the fitted rate null on sparse readings but still smooths one', () => {
        // Four readings across four weeks: too few to fit, enough to smooth. The
        // averaging window stretches past a week to find two of them.
        const sparse = [
            log(START, 103),
            log(plus(START, 9), 102.7),
            log(plus(START, 18), 102.4),
            log(plus(START, 27), 102.1),
        ]
        const t = weightTrend(sparse, plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.rateKgPerWeek).toBeNull()
        expect(t.current.days).toBeGreaterThan(7)
        expect(t.current.readings).toBe(2)
        expect(t.smoothedRateKgPerWeek).not.toBeNull()
        expect(usableRate(t)).toBe(t.smoothedRateKgPerWeek)
    })

    it('gives up once even the stretched window holds too few readings', () => {
        const t = weightTrend([log(START, 103), log(plus(START, 1), 102.9)], plus(START, 40))
        expect(t).toBe('too-few-readings')
    })

    it('keeps the two average windows from sharing a reading', () => {
        const t = weightTrend(series(START, 103, -0.2, 28), plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.previous!.to < t.current.from).toBe(true)
    })

    it('reports a gaining trend as positive', () => {
        const t = weightTrend(series(START, 80, 0.25, 28), plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.rateKgPerWeek!).toBeGreaterThan(0)
        expect(t.weekChangeKg!).toBeGreaterThan(0)
    })

    it('holds a stall near zero rather than calling it progress', () => {
        const t = weightTrend(series(START, 103, 0, 28, [0.4, -0.3, 0.2, -0.4, 0.1, 0, -0.1]), plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(Math.abs(t.rateKgPerWeek!)).toBeLessThan(0.06)
    })

    it('anchors to the last weigh-in when no date is given', () => {
        const t = weightTrend(series(START, 103, -0.2, 28))
        if (typeof t === 'string') throw new Error(t)
        expect(t.current.to).toBe(plus(START, 27))
    })

    it('keeps the last reading for a duplicated date', () => {
        const logs = [...series(START, 103, -0.2, 28), log(plus(START, 27), 99)]
        const t = weightTrend(logs, plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.latest.kg).toBe(99)
        expect(t.current.readings).toBe(7)
    })

    it('ignores nonsensical readings', () => {
        const logs = [...series(START, 103, -0.2, 28), log(plus(START, 20), 0)]
        const t = weightTrend(logs, plus(START, 27))
        if (typeof t === 'string') throw new Error(t)
        expect(t.rateKgPerWeek).toBeCloseTo(-0.2, 1)
    })
})

describe('composition', () => {
    it('splits weight into fat and lean mass', () => {
        const [c] = compositionSeries([log(START, 103, 28.8)])
        expect(c.fatMassKg).toBeCloseTo(29.664, 3)
        expect(c.leanMassKg).toBeCloseTo(73.336, 3)
    })

    it('skips weigh-ins with no body-fat reading', () => {
        expect(compositionSeries([log(START, 103), log(plus(START, 1), 102.9, 28.7)])).toHaveLength(1)
    })

    it('refuses to compare readings taken too close together', () => {
        const series_ = compositionSeries([log(START, 103, 28.8), log(plus(START, 7), 102.5, 27.4)])
        expect(compositionChange(series_)).toBeNull()
    })

    it('compares readings far enough apart to mean something', () => {
        const span = MIN_COMPOSITION_SPAN_DAYS
        const s = compositionSeries([log(START, 103, 28.8), log(plus(START, span), 102, 27.5)])
        const change = compositionChange(s)!
        expect(change.days).toBe(span)
        expect(change.fatMassKg).toBeLessThan(0)
        expect(change.bodyFatPct).toBeCloseTo(-1.3, 5)
        // Losing fat faster than weight means lean mass held or rose.
        expect(change.leanMassKg).toBeGreaterThan(0)
    })

    it('has nothing to say from a single reading', () => {
        expect(compositionChange(compositionSeries([log(START, 103, 28.8)]))).toBeNull()
    })
})
