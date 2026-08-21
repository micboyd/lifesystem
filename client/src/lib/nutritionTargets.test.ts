import { describe, it, expect } from 'vitest'
import {
    macrosForCalories,
    caloriesOf,
    retargetCalories,
    classifyDay,
    activityModifier,
    effectiveTargetsFor,
    proteinFloorOf,
    DEFAULT_HARD_KCAL,
    DEFAULT_REST_KCAL,
} from './nutritionTargets'
import { phaseTargetsOn, currentPhaseTargets, targetsFor } from './nutrition'
import type { FitnessPlanEntry, MacroGoals, NutritionPhase } from '../types'

/** A phase carrying only the fields the target maths reads. */
function phase(over: Partial<NutritionPhase> = {}): NutritionPhase {
    return {
        _id: 'p1',
        name: 'Recomp',
        startDate: '2026-08-21',
        endDate: '2027-05-31',
        kind: 'cut',
        targets: { calories: 2950, protein: 210, carbs: 325, fat: 90 },
        createdAt: '',
        updatedAt: '',
        ...over,
    } as NutritionPhase
}

/** A planner entry carrying only what the classifier reads. */
function fit(
    date: string,
    kind: FitnessPlanEntry['kind'],
    category?: string
): FitnessPlanEntry {
    return {
        _id: `${date}-${kind}-${category ?? ''}`,
        date,
        part: 'morning',
        kind,
        workout: null,
        session: category ? ({ category } as FitnessPlanEntry['session']) : null,
        recovery: null,
        mobility: null,
        plan: null,
        order: 0,
        createdAt: '',
        updatedAt: '',
    } as FitnessPlanEntry
}

describe('macrosForCalories', () => {
    it('holds protein and fat, giving the remainder to carbs', () => {
        const m = macrosForCalories(2950, 210, 90)
        expect(m.protein).toBe(210)
        expect(m.fat).toBe(90)
        // 2950 − 840 − 810 = 1300 kcal of carbs → 325 g.
        expect(m.carbs).toBe(325)
    })

    it('reconciles to within rounding of the calorie target', () => {
        for (const kcal of [2100, 2825, 2950, 3050, 3417]) {
            const m = macrosForCalories(kcal, 210, 90)
            expect(Math.abs(caloriesOf(m) - kcal)).toBeLessThanOrEqual(2)
        }
    })

    it('never returns negative carbs when the target is below its own floors', () => {
        // 210 g protein and 90 g fat is 1,650 kcal on its own.
        const m = macrosForCalories(1200, 210, 90)
        expect(m.carbs).toBe(0)
        expect(m.protein).toBe(210)
        expect(m.fat).toBe(90)
    })

    it('rounds grams to whole numbers', () => {
        const m = macrosForCalories(2933, 207.4, 88.6)
        expect(Number.isInteger(m.protein)).toBe(true)
        expect(Number.isInteger(m.carbs)).toBe(true)
        expect(Number.isInteger(m.fat)).toBe(true)
    })
})

describe('retargetCalories', () => {
    const current: MacroGoals = { calories: 2950, protein: 210, carbs: 325, fat: 90 }

    it('takes a reduction out of carbohydrate alone', () => {
        const next = retargetCalories(current, 2825, 210)
        expect(next.protein).toBe(210)
        expect(next.fat).toBe(90)
        // 125 kcal off is 31.25 g of carbs, rounded to whole grams.
        expect(next.carbs).toBe(294)
        expect(next.calories).toBe(2825)
    })

    it('puts an increase into carbohydrate alone', () => {
        const next = retargetCalories(current, 3075, 210)
        expect(next.protein).toBe(210)
        expect(next.fat).toBe(90)
        expect(next.carbs).toBeGreaterThan(325)
    })

    it('never lets the protein floor be eroded', () => {
        const thin: MacroGoals = { calories: 2400, protein: 150, carbs: 250, fat: 90 }
        expect(retargetCalories(thin, 2300, 210).protein).toBe(210)
    })

    it('keeps the existing protein when it is above the floor', () => {
        expect(retargetCalories(current, 2800, 180).protein).toBe(210)
    })
})

describe('phaseTargetsOn', () => {
    const adjusted = phase({
        adjustments: [
            {
                effectiveFrom: '2027-01-15',
                targets: { calories: 2825, protein: 210, carbs: 294, fat: 90 },
                source: 'adaptive',
            },
        ],
    })

    it('returns the opening prescription before the first revision', () => {
        expect(phaseTargetsOn(adjusted, '2027-01-05').calories).toBe(2950)
    })

    it('returns the revision from the day it takes effect', () => {
        expect(phaseTargetsOn(adjusted, '2027-01-15').calories).toBe(2825)
        expect(phaseTargetsOn(adjusted, '2027-02-01').calories).toBe(2825)
    })

    it('takes the latest revision on or before the date', () => {
        const twice = phase({
            adjustments: [
                { effectiveFrom: '2027-01-15', targets: { calories: 2825 }, source: 'adaptive' },
                { effectiveFrom: '2027-03-01', targets: { calories: 2700 }, source: 'adaptive' },
            ],
        })
        expect(phaseTargetsOn(twice, '2027-02-14').calories).toBe(2825)
        expect(phaseTargetsOn(twice, '2027-03-02').calories).toBe(2700)
        expect(currentPhaseTargets(twice).calories).toBe(2700)
    })

    it('leaves a phase with no revisions exactly as it was', () => {
        const plain = phase()
        expect(phaseTargetsOn(plain, '2026-12-01')).toBe(plain.targets)
        expect(currentPhaseTargets(plain)).toBe(plain.targets)
    })
})

describe('targetsFor with dated revisions', () => {
    const adjusted = phase({
        adjustments: [
            { effectiveFrom: '2027-01-15', targets: { calories: 2825, protein: 210 }, source: 'adaptive' },
        ],
    })

    it('judges a historical day against the target that was live then', () => {
        expect(targetsFor('2027-01-05', [adjusted]).goals?.calories).toBe(2950)
    })

    it('judges a later day against the revised target', () => {
        expect(targetsFor('2027-01-20', [adjusted]).goals?.calories).toBe(2825)
    })

    it('still falls back to settings outside any phase', () => {
        const r = targetsFor('2026-01-01', [adjusted], { calories: 2400 })
        expect(r.source).toBe('settings')
        expect(r.goals?.calories).toBe(2400)
    })

    it('reports no targets when there is neither a phase nor settings', () => {
        expect(targetsFor('2026-01-01', [], null).source).toBe('none')
    })

    it('keeps latest-start-wins for overlapping phases', () => {
        const older = phase({ _id: 'a', startDate: '2026-08-01', targets: { calories: 2500 } })
        const newer = phase({ _id: 'b', startDate: '2026-09-01', targets: { calories: 2200 } })
        expect(targetsFor('2026-09-15', [older, newer]).goals?.calories).toBe(2200)
        expect(targetsFor('2026-09-15', [newer, older]).goals?.calories).toBe(2200)
    })
})

describe('classifyDay', () => {
    it('reads nothing planned as unknown, not rest', () => {
        expect(classifyDay('2026-08-21', [])).toBeNull()
    })

    it('calls a day with only recovery or mobility a rest day', () => {
        const entries = [fit('2026-08-21', 'recovery'), fit('2026-08-21', 'mobility')]
        expect(classifyDay('2026-08-21', entries)).toBe('rest')
    })

    it('calls a single strength session a standard training day', () => {
        expect(classifyDay('2026-08-21', [fit('2026-08-21', 'workout')])).toBe('standard')
    })

    it('calls two hard sessions in a day a hard day', () => {
        const entries = [fit('2026-08-21', 'workout'), fit('2026-08-21', 'conditioning')]
        expect(classifyDay('2026-08-21', entries)).toBe('hard')
    })

    it('calls a demanding conditioning session hard on its own', () => {
        expect(classifyDay('2026-08-21', [fit('2026-08-21', 'conditioning', 'HIIT')])).toBe('hard')
        expect(classifyDay('2026-08-21', [fit('2026-08-21', 'conditioning', 'Endurance')])).toBe('hard')
        expect(classifyDay('2026-08-21', [fit('2026-08-21', 'conditioning', 'Cardio')])).toBe('standard')
    })

    it('only reads the day asked for', () => {
        const entries = [fit('2026-08-20', 'workout'), fit('2026-08-20', 'conditioning')]
        expect(classifyDay('2026-08-21', entries)).toBeNull()
    })

    it('lets a manual override win outright', () => {
        expect(classifyDay('2026-08-21', [], 'hard')).toBe('hard')
        expect(classifyDay('2026-08-21', [fit('2026-08-21', 'workout')], 'rest')).toBe('rest')
    })
})

describe('activityModifier', () => {
    const cycling = phase({ strategy: { type: 'activity' } })

    it('is zero on a flat phase whatever the day', () => {
        expect(activityModifier(phase(), 'hard')).toBe(0)
        expect(activityModifier(phase(), 'rest')).toBe(0)
    })

    it('adds on hard days and subtracts on rest days', () => {
        expect(activityModifier(cycling, 'hard')).toBe(DEFAULT_HARD_KCAL)
        expect(activityModifier(cycling, 'standard')).toBe(0)
        expect(activityModifier(cycling, 'rest')).toBe(-DEFAULT_REST_KCAL)
    })

    it('is zero when the day could not be classified', () => {
        expect(activityModifier(cycling, null)).toBe(0)
    })

    it('honours the phase’s own modifiers', () => {
        const custom = phase({ strategy: { type: 'activity', hardKcal: 100, restKcal: 150 } })
        expect(activityModifier(custom, 'hard')).toBe(100)
        expect(activityModifier(custom, 'rest')).toBe(-150)
    })
})

describe('effectiveTargetsFor', () => {
    const flat = phase()
    const cycling = phase({ strategy: { type: 'activity', hardKcal: 100, restKcal: 150 } })

    it('returns the phase target untouched on a flat phase', () => {
        const r = effectiveTargetsFor('2026-09-01', [flat], null, [fit('2026-09-01', 'workout')])
        expect(r.goals?.calories).toBe(2950)
        expect(r.modifier).toBe(0)
        expect(r.dayType).toBe('standard')
    })

    it('lifts the target on a hard day and drops it on a rest day', () => {
        const hard = effectiveTargetsFor('2026-09-01', [cycling], null, [
            fit('2026-09-01', 'workout'),
            fit('2026-09-01', 'conditioning'),
        ])
        expect(hard.goals?.calories).toBe(3050)
        expect(hard.baseGoals?.calories).toBe(2950)

        const rest = effectiveTargetsFor('2026-09-01', [cycling], null, [
            fit('2026-09-01', 'recovery'),
        ])
        expect(rest.goals?.calories).toBe(2800)
    })

    it('moves carbohydrate and leaves protein and fat where they were', () => {
        const hard = effectiveTargetsFor('2026-09-01', [cycling], null, [
            fit('2026-09-01', 'conditioning', 'HIIT'),
        ])
        expect(hard.goals?.protein).toBe(210)
        expect(hard.goals?.fat).toBe(90)
        expect(hard.goals?.carbs).toBe(350)
    })

    it('falls back to the flat target when there is no fitness data', () => {
        const r = effectiveTargetsFor('2026-09-01', [cycling], null, [])
        expect(r.dayType).toBeNull()
        expect(r.goals?.calories).toBe(2950)
    })

    it('applies the revision in force on the day, then the modifier', () => {
        const revised = phase({
            strategy: { type: 'activity', hardKcal: 100, restKcal: 150 },
            adjustments: [
                {
                    effectiveFrom: '2027-01-15',
                    targets: { calories: 2825, protein: 210, carbs: 294, fat: 90 },
                    source: 'adaptive',
                },
            ],
        })
        const before = effectiveTargetsFor('2027-01-05', [revised], null, [
            fit('2027-01-05', 'recovery'),
        ])
        expect(before.goals?.calories).toBe(2800)

        const after = effectiveTargetsFor('2027-01-20', [revised], null, [
            fit('2027-01-20', 'recovery'),
        ])
        expect(after.goals?.calories).toBe(2675)
    })

    it('never shifts a settings-sourced target', () => {
        const r = effectiveTargetsFor('2020-01-01', [cycling], { calories: 2400 }, [
            fit('2020-01-01', 'recovery'),
        ])
        expect(r.source).toBe('settings')
        expect(r.modifier).toBe(0)
        expect(r.goals?.calories).toBe(2400)
    })
})

describe('proteinFloorOf', () => {
    it('prefers the goal’s floor', () => {
        expect(proteinFloorOf(phase({ goal: { proteinFloorG: 210 } }))).toBe(210)
    })

    it('falls back to the current target’s protein', () => {
        expect(proteinFloorOf(phase())).toBe(210)
    })

    it('is undefined without a phase', () => {
        expect(proteinFloorOf(null)).toBeUndefined()
    })
})
