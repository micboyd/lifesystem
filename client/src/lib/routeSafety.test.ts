import { describe, expect, it } from 'vitest'
import { needsLitCheck } from './routeSafety'

describe('needsLitCheck', () => {
    it('always for the Evening slot', () => {
        expect(needsLitCheck('evening', '2026-06-21')).toBe(true)
    })
    it('for the Morning slot from November to February', () => {
        expect(needsLitCheck('morning', '2026-11-02')).toBe(true)
        expect(needsLitCheck('morning', '2027-02-28')).toBe(true)
        expect(needsLitCheck('morning', '2027-03-01')).toBe(false)
        expect(needsLitCheck('morning', '2026-10-31')).toBe(false)
    })
    it('never for the Afternoon slot', () => {
        expect(needsLitCheck('afternoon', '2026-12-21')).toBe(false)
    })
})
