import { describe, expect, it } from 'vitest'
import { ageOn, bmrReadout, katchMcArdle, makeBmrLookup, mifflinStJeor, missingForBmr } from './bmr'
import type { BodyProfile, WeightLog } from '../types'

const log = (date: string, weight: number, bodyFat?: number): WeightLog => ({
    _id: date,
    date,
    weight,
    bodyFat,
    createdAt: '',
    updatedAt: '',
})

const me: BodyProfile = { heightCm: 180, birthDate: '1990-06-15', sex: 'male' }

describe('formulas', () => {
    it('Mifflin–St Jeor', () => {
        expect(mifflinStJeor(80, 180, 36, 'male')).toBe(800 + 1125 - 180 + 5)
        expect(mifflinStJeor(65, 165, 30, 'female')).toBeCloseTo(650 + 1031.25 - 150 - 161)
    })
    it('Katch–McArdle', () => {
        expect(katchMcArdle(80, 20)).toBeCloseTo(370 + 21.6 * 64)
    })
})

describe('ageOn', () => {
    it('counts the birthday itself', () => {
        expect(ageOn('1990-06-15', '2026-06-14')).toBe(35)
        expect(ageOn('1990-06-15', '2026-06-15')).toBe(36)
        expect(ageOn('1990-06-15', '2026-12-01')).toBe(36)
    })
})

describe('makeBmrLookup', () => {
    it('is null until the profile and a weigh-in are in', () => {
        expect(makeBmrLookup(undefined, [log('2026-10-01', 80)])('2026-10-01')).toBeNull()
        expect(makeBmrLookup({ heightCm: 180, sex: 'male' }, [log('2026-10-01', 80)])('2026-10-01')).toBeNull()
        expect(makeBmrLookup(me, [])('2026-10-01')).toBeNull()
    })

    it('uses the trend weight on each day, so past days keep their figure', () => {
        const logs = [log('2026-10-01', 90), log('2026-10-15', 85)]
        const bmr = makeBmrLookup(me, logs)
        expect(bmr('2026-10-01')).toBe(Math.round(mifflinStJeor(90, 180, 36, 'male')))
        // Before the first weigh-in, the first reading stands in.
        expect(bmr('2026-09-01')).toBe(bmr('2026-10-01'))
        // Later days use the smoothed weight, which sits between the readings.
        const later = bmr('2026-10-20')!
        expect(later).toBeLessThan(bmr('2026-10-01')!)
        expect(later).toBeGreaterThan(Math.round(mifflinStJeor(85, 180, 36, 'male')))
    })
})

describe('missingForBmr', () => {
    it('lists what to fill in', () => {
        expect(missingForBmr({ heightCm: 180 }, [])).toEqual(['date of birth', 'sex', 'a weigh-in'])
        expect(missingForBmr(me, [log('2026-10-01', 80)])).toEqual([])
    })
})

describe('bmrReadout', () => {
    it('adds a lean-mass figure only with recent body fat', () => {
        const fresh = bmrReadout(me, [log('2026-10-10', 80, 20)], '2026-10-21')!
        expect(fresh.fromLeanMass?.bmr).toBe(Math.round(katchMcArdle(80, 20)))
        const stale = bmrReadout(me, [log('2026-08-01', 80, 20)], '2026-10-21')!
        expect(stale.fromLeanMass).toBeNull()
        expect(stale.age).toBe(36)
    })
})
