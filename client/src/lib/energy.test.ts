import { describe, it, expect } from 'vitest'
import {
    dailyIntake,
    measuredMaintenance,
    dayEnergy,
    targetVerdict,
    balanceVerdict,
    impliedWeeklyRate,
    targetTolerance,
    KCAL_PER_KG,
    MIN_INTAKE_DAYS,
} from './energy'
import { trendSeries } from './weightTrend'
import type { DailyEnergy, MealPlanEntry, EntryStatus, WeightLog } from '../types'

/** A plan entry carrying only the fields the energy math reads. */
function entry(
    date: string,
    calories: number,
    status: EntryStatus,
    servings = 1
): MealPlanEntry {
    return {
        _id: `${date}-${calories}-${status}-${servings}`,
        date,
        slot: 'dinner',
        adhoc: { name: 'x', macros: { calories, protein: 0, carbs: 0, fat: 0 } },
        servings,
        status,
        order: 0,
        createdAt: '',
        updatedAt: '',
    } as MealPlanEntry
}

function log(date: string, weight: number): WeightLog {
    return { _id: date, date, weight, createdAt: '', updatedAt: '' }
}

/** `days` consecutive dates from 2026-08-01. */
function dates(days: number): string[] {
    const out: string[] = []
    for (let i = 0; i < days; i++) {
        const ms = Date.parse('2026-08-01T00:00:00Z') + i * 86_400_000
        out.push(new Date(ms).toISOString().slice(0, 10))
    }
    return out
}

describe('dailyIntake', () => {
    it('counts only what was marked eaten', () => {
        const intake = dailyIntake([
            entry('2026-08-01', 500, 'eaten'),
            entry('2026-08-01', 700, 'planned'),
            entry('2026-08-01', 300, 'skipped'),
        ])
        expect(intake.get('2026-08-01')).toBe(500)
    })

    it('scales by the portion on the plate', () => {
        const intake = dailyIntake([entry('2026-08-01', 500, 'eaten', 2)])
        expect(intake.get('2026-08-01')).toBe(1000)
    })

    it('omits unlogged days rather than recording them as zero', () => {
        const intake = dailyIntake([
            entry('2026-08-01', 500, 'eaten'),
            entry('2026-08-02', 500, 'planned'),
        ])
        expect(intake.has('2026-08-02')).toBe(false)
        expect(intake.size).toBe(1)
    })
})

describe('measuredMaintenance', () => {
    it('adds back the deficit the scale implies', () => {
        // 20 days eating 2000, losing exactly 0.5 kg/week.
        const days = dates(20)
        const intake = new Map(days.map((d) => [d, 2000]))
        // A perfectly linear drop so the smoothed trend rate is ~0.5 kg/week.
        const logs = days.map((d, i) => log(d, 80 - (i * 0.5) / 7))

        const result = measuredMaintenance(intake, trendSeries(logs), 28)
        expect(typeof result).toBe('object')
        if (typeof result === 'string') throw new Error('expected an estimate')

        expect(result.avgIntake).toBe(2000)
        expect(result.rateKgPerWeek).toBeLessThan(0)
        // maintenance = intake + the daily shortfall the loss implies
        const expected = 2000 - (result.rateKgPerWeek * KCAL_PER_KG) / 7
        expect(result.kcal).toBeCloseTo(expected, 6)
        expect(result.kcal).toBeGreaterThan(2000)
    })

    it('returns intake when weight is flat', () => {
        const days = dates(20)
        const intake = new Map(days.map((d) => [d, 2400]))
        const logs = days.map((d) => log(d, 80))

        const result = measuredMaintenance(intake, trendSeries(logs), 28)
        if (typeof result === 'string') throw new Error('expected an estimate')
        expect(result.kcal).toBeCloseTo(2400, 6)
    })

    it('subtracts the surplus when gaining', () => {
        const days = dates(20)
        const intake = new Map(days.map((d) => [d, 3200]))
        const logs = days.map((d, i) => log(d, 80 + (i * 0.5) / 7))

        const result = measuredMaintenance(intake, trendSeries(logs), 28)
        if (typeof result === 'string') throw new Error('expected an estimate')
        expect(result.rateKgPerWeek).toBeGreaterThan(0)
        expect(result.kcal).toBeLessThan(3200)
    })

    it('refuses to guess below the intake-days floor', () => {
        const days = dates(MIN_INTAKE_DAYS - 1)
        const intake = new Map(days.map((d) => [d, 2000]))
        const logs = days.map((d, i) => log(d, 80 - i * 0.05))

        expect(measuredMaintenance(intake, trendSeries(logs), 28)).toBe('not-enough-intake')
    })

    it('refuses to guess without weight data', () => {
        const days = dates(20)
        const intake = new Map(days.map((d) => [d, 2000]))
        expect(measuredMaintenance(intake, [], 28)).toBe('not-enough-weight')
    })

    it('ignores intake older than the window', () => {
        const days = dates(40)
        const intake = new Map(days.map((d, i) => [d, i < 12 ? 5000 : 2000]))
        const logs = days.map((d) => log(d, 80))

        const result = measuredMaintenance(intake, trendSeries(logs), 28)
        if (typeof result === 'string') throw new Error('expected an estimate')
        // The 5,000 kcal days fall outside the 28-day window ending on day 40.
        expect(result.avgIntake).toBe(2000)
    })
})

describe('dayEnergy', () => {
    const maintenance = { kcal: 2500, avgIntake: 2200, rateKgPerWeek: -0.3, days: 20 }

    it('separates what was eaten from what is still to come', () => {
        const day = dayEnergy(
            [
                entry('2026-08-01', 600, 'eaten'),
                entry('2026-08-01', 900, 'planned'),
                entry('2026-08-01', 400, 'skipped'),
            ],
            null,
            maintenance
        )
        expect(day.eaten).toBe(600)
        expect(day.pending).toBe(900)
        expect(day.projected).toBe(1500)
    })

    it('prefers a logged burn over the maintenance fallback', () => {
        const logged = { _id: 'x', date: '2026-08-01', caloriesOut: 2800 } as DailyEnergy
        const day = dayEnergy([entry('2026-08-01', 2000, 'eaten')], logged, maintenance)
        expect(day.out).toBe(2800)
        expect(day.source).toBe('logged')
        expect(day.balance).toBe(-800)
    })

    it('falls back to measured maintenance when nothing was logged', () => {
        const day = dayEnergy([entry('2026-08-01', 2000, 'eaten')], null, maintenance)
        expect(day.out).toBe(2500)
        expect(day.source).toBe('maintenance')
        expect(day.balance).toBe(-500)
    })

    it('has no balance at all when maintenance is unknown too', () => {
        const day = dayEnergy([entry('2026-08-01', 2000, 'eaten')], null, 'not-enough-intake')
        expect(day.out).toBeNull()
        expect(day.source).toBe('unknown')
        expect(day.balance).toBeNull()
        expect(day.projectedBalance).toBeNull()
    })

    it('projects the rest of the day, so a half-eaten day is not a triumph', () => {
        // Breakfast down, the rest still to come, against a 2,500 burn.
        const day = dayEnergy(
            [entry('2026-08-01', 500, 'eaten'), entry('2026-08-01', 2000, 'planned')],
            null,
            maintenance
        )
        expect(day.balance).toBe(-2000) // true, and useless
        expect(day.projectedBalance).toBe(0) // where the day actually lands
    })
})

describe('targetVerdict', () => {
    it('has no opinion without a target', () => {
        expect(targetVerdict(2000, undefined, 'cut')).toBe('none')
        expect(targetVerdict(2000, 0, 'cut')).toBe('none')
    })

    it('passes anything inside the tolerance band', () => {
        expect(targetVerdict(2000, 2000, 'cut')).toBe('good')
        expect(targetVerdict(2090, 2000, 'cut')).toBe('good')
        expect(targetVerdict(1910, 2000, 'gain')).toBe('good')
    })

    it('scales the band with the target', () => {
        expect(targetTolerance(1600)).toBe(100)
        expect(targetTolerance(3500)).toBe(175)
    })

    it('inverts over/under between a cut and a bulk', () => {
        // Well over target.
        expect(targetVerdict(2600, 2000, 'cut')).toBe('bad')
        expect(targetVerdict(2600, 2000, 'gain')).toBe('warn')
        // Well under target — the bulk's characteristic failure.
        expect(targetVerdict(1400, 2000, 'gain')).toBe('bad')
        expect(targetVerdict(1400, 2000, 'cut')).toBe('warn')
    })

    it('treats a slight undershoot on a cut as fine', () => {
        expect(targetVerdict(1830, 2000, 'cut')).toBe('good')
    })

    it('flags drift in both directions when maintaining', () => {
        expect(targetVerdict(2600, 2000, 'maintain')).toBe('warn')
        expect(targetVerdict(1400, 2000, 'maintain')).toBe('warn')
    })

    it('assumes a cut when no phase is set', () => {
        expect(targetVerdict(2600, 2000, null)).toBe('bad')
    })
})

describe('balanceVerdict', () => {
    it('has no opinion without a balance', () => {
        expect(balanceVerdict(null, 'cut')).toBe('none')
    })

    it('wants a deficit on a cut and a surplus on a bulk', () => {
        expect(balanceVerdict(-500, 'cut')).toBe('good')
        expect(balanceVerdict(500, 'cut')).toBe('bad')
        expect(balanceVerdict(500, 'gain')).toBe('good')
        expect(balanceVerdict(-500, 'gain')).toBe('bad')
    })

    it('calls out sitting at maintenance in either direction', () => {
        expect(balanceVerdict(10, 'cut')).toBe('warn')
        expect(balanceVerdict(-10, 'gain')).toBe('warn')
    })

    it('wants the balance near zero when maintaining', () => {
        expect(balanceVerdict(100, 'maintain')).toBe('good')
        expect(balanceVerdict(-400, 'maintain')).toBe('warn')
    })
})

describe('impliedWeeklyRate', () => {
    it('turns a daily balance into kilos a week', () => {
        // A 550/day deficit is very close to half a kilo a week.
        expect(impliedWeeklyRate(-550)!).toBeCloseTo(-0.5, 2)
        expect(impliedWeeklyRate(0)).toBe(0)
        expect(impliedWeeklyRate(null)).toBeNull()
    })
})
