import { describe, expect, it } from 'vitest'
import { mondayOf } from './timeboxController'

describe('mondayOf', () => {
    it('finds the Monday of the week', () => {
        expect(mondayOf('2026-11-13')).toBe('2026-11-09') // Friday
        expect(mondayOf('2026-11-09')).toBe('2026-11-09') // Monday
        expect(mondayOf('2026-11-15')).toBe('2026-11-09') // Sunday ends the week
        expect(mondayOf('2027-01-01')).toBe('2026-12-28') // across a year
    })
})
