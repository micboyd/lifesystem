import { describe, expect, it } from 'vitest'
import { ageOn, mifflinStJeor } from './bmr'

describe('Mifflin–St Jeor', () => {
    it('works it out for either sex', () => {
        expect(mifflinStJeor(80, 180, 36, 'male')).toBe(800 + 1125 - 180 + 5)
        expect(mifflinStJeor(65, 165, 30, 'female')).toBeCloseTo(650 + 1031.25 - 150 - 161)
    })
})

describe('ageOn', () => {
    it('counts the birthday itself', () => {
        expect(ageOn('1990-06-15', '2026-06-14')).toBe(35)
        expect(ageOn('1990-06-15', '2026-06-15')).toBe(36)
        expect(ageOn('1990-06-15', '2026-12-01')).toBe(36)
    })
})
