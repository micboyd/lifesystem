import { describe, it, expect } from 'vitest'
import { byClosest, phaseDistance } from './phaseOrder'

const p = (name: string, startDate: string, endDate: string) => ({ name, startDate, endDate })
const today = '2026-10-25'

describe('phaseDistance', () => {
    it('is 0 while running, else days to start or since end', () => {
        expect(phaseDistance(p('a', '2026-10-01', '2026-10-31'), today)).toBe(0)
        expect(phaseDistance(p('a', '2026-11-01', '2026-11-30'), today)).toBe(7)
        expect(phaseDistance(p('a', '2026-09-01', '2026-10-20'), today)).toBe(5)
    })
})

describe('byClosest', () => {
    it('puts the current phase first, then nearest past or future', () => {
        const order = byClosest(
            [
                p('far past', '2026-01-01', '2026-03-01'),
                p('next', '2026-11-01', '2026-12-31'),
                p('current', '2026-10-01', '2026-10-31'),
                p('just ended', '2026-08-01', '2026-10-20'),
                p('far future', '2027-06-01', '2027-08-01'),
            ],
            today
        ).map((x) => x.name)
        expect(order).toEqual(['current', 'just ended', 'next', 'far future', 'far past'])
    })

    it('breaks a tie towards the upcoming phase', () => {
        const order = byClosest(
            [p('ended', '2026-09-01', '2026-10-20'), p('upcoming', '2026-10-30', '2026-11-30')],
            today
        ).map((x) => x.name)
        expect(order).toEqual(['upcoming', 'ended'])
    })
})
