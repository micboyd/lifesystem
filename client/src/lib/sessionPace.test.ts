import { describe, expect, it } from 'vitest'
import { clockLabel, driftLabel, hasSlot, paceOf, slotLabel } from './sessionPace'

const MIN = 60000
const T0 = Date.UTC(2026, 8, 27, 13, 0) // any fixed moment

const slots = [
    { startMin: 0, endMin: 10 },
    { startMin: 10, endMin: 25 },
    {}, // untimed — never counts
    { startMin: 25, endMin: 40 },
]

describe('labels', () => {
    it('formats minute marks and slots', () => {
        expect(clockLabel(27.5)).toBe('27:30')
        expect(slotLabel({ startMin: 15, endMin: 30 })).toBe('15–30')
        expect(slotLabel({ startMin: 1.5, endMin: 3 })).toBe('1:30–3:00')
    })

    it('needs both ends, with the end after the start', () => {
        expect(hasSlot({ startMin: 0, endMin: 5 })).toBe(true)
        expect(hasSlot({ startMin: 5 })).toBe(false)
        expect(hasSlot({ startMin: 5, endMin: 5 })).toBe(false)
    })

    it('calls anything within two minutes on time', () => {
        expect(driftLabel(1.5)).toBe('On time')
        expect(driftLabel(-1.9)).toBe('On time')
        expect(driftLabel(4.4)).toBe('4 min behind')
        expect(driftLabel(-3)).toBe('3 min ahead')
    })
})

describe('paceOf', () => {
    it('has nothing to compare before two items are in', () => {
        const p = paceOf(slots, [T0])
        expect(p.drift).toBeNull()
        expect(p.delta).toEqual([null, null, null, null])
        // The next item is due its planned gap after the first press.
        expect(p.next).toEqual({ index: 1, dueAt: T0 + 15 * MIN })
    })

    it('compares each press with the previous one against the planned gap', () => {
        // Planned gap 0→1 is 15 min; it took 19.
        const p = paceOf(slots, [T0, T0 + 19 * MIN])
        expect(p.delta[1]).toBeCloseTo(4)
        expect(p.drift).toBeCloseTo(4)
        expect(p.next).toEqual({ index: 3, dueAt: T0 + 19 * MIN + 15 * MIN })
    })

    it('skips untimed items and carries the drift across the whole session', () => {
        // 19 min for a planned 15, then 12 for a planned 15: 1 min behind overall.
        const p = paceOf(slots, [T0, T0 + 19 * MIN, null, T0 + 31 * MIN])
        expect(p.delta[3]).toBeCloseTo(-3)
        expect(p.drift).toBeCloseTo(1)
        expect(p.next).toBeNull()
        expect(p.completed).toBe(3)
        expect(p.timed).toBe(3)
    })

    it('compares an item done out of order with the completed one before it', () => {
        const p = paceOf(slots, [T0, null, null, T0 + 25 * MIN])
        // Planned 10 → 40 is 30 min; took 25.
        expect(p.delta[3]).toBeCloseTo(-5)
        expect(p.next).toBeNull()
    })
})
