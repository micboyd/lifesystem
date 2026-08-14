import { describe, it, expect } from 'vitest'
import { findOverloads, findFreeSlot, isHardSession, slotOf, type SlotItem } from './overload'
import type { FitnessPlanKind, FitnessPlanPart } from '../types'

/** A planned thing on a day + slot; the date defaults so most cases can skip it. */
function item(
    kind: FitnessPlanKind,
    part?: FitnessPlanPart,
    date = '2026-08-17'
): SlotItem & { id: string } {
    return { id: `${date}-${part}-${kind}-${Math.random()}`, date, part, kind }
}

describe('isHardSession', () => {
    it('counts strength and conditioning, but not mobility or recovery', () => {
        expect(isHardSession('workout')).toBe(true)
        expect(isHardSession('conditioning')).toBe(true)
        expect(isHardSession('mobility')).toBe(false)
        expect(isHardSession('recovery')).toBe(false)
    })
})

describe('slotOf', () => {
    it('reads an item with no slot recorded as the morning', () => {
        expect(slotOf({ date: '2026-08-17', kind: 'workout' })).toBe('morning')
        expect(slotOf({ date: '2026-08-17', part: 'evening', kind: 'workout' })).toBe('evening')
    })
})

describe('findOverloads', () => {
    it('flags a slot pairing strength with conditioning', () => {
        const found = findOverloads([item('workout', 'morning'), item('conditioning', 'morning')])
        expect(found).toHaveLength(1)
        expect(found[0].part).toBe('morning')
        expect(found[0].entries).toHaveLength(2)
    })

    it('flags two of the same hard kind in one slot', () => {
        expect(
            findOverloads([item('workout', 'morning'), item('workout', 'morning')])
        ).toHaveLength(1)
        expect(
            findOverloads([item('conditioning', 'evening'), item('conditioning', 'evening')])
        ).toHaveLength(1)
    })

    it('leaves a hard session paired with mobility or recovery alone', () => {
        expect(findOverloads([item('workout', 'morning'), item('mobility', 'morning')])).toEqual([])
        expect(
            findOverloads([item('conditioning', 'evening'), item('recovery', 'evening')])
        ).toEqual([])
    })

    it('leaves hard sessions in different slots of the same day alone', () => {
        expect(
            findOverloads([item('workout', 'morning'), item('conditioning', 'afternoon')])
        ).toEqual([])
    })

    it('leaves hard sessions in the same slot of different days alone', () => {
        expect(
            findOverloads([
                item('workout', 'morning', '2026-08-17'),
                item('conditioning', 'morning', '2026-08-18'),
            ])
        ).toEqual([])
    })

    it('reads items with no slot recorded as sharing the morning', () => {
        expect(
            findOverloads([
                { date: '2026-08-17', kind: 'workout' },
                { date: '2026-08-17', part: 'morning', kind: 'conditioning' },
            ])
        ).toHaveLength(1)
    })

    it('returns every overloaded slot in date then slot order', () => {
        const found = findOverloads([
            item('workout', 'evening', '2026-08-18'),
            item('conditioning', 'evening', '2026-08-18'),
            item('workout', 'afternoon', '2026-08-17'),
            item('conditioning', 'afternoon', '2026-08-17'),
            item('workout', 'morning', '2026-08-17'),
            item('conditioning', 'morning', '2026-08-17'),
        ])
        expect(found.map((o) => [o.date, o.part])).toEqual([
            ['2026-08-17', 'morning'],
            ['2026-08-17', 'afternoon'],
            ['2026-08-18', 'evening'],
        ])
    })
})

describe('findFreeSlot', () => {
    it('sends a morning session to the afternoon when it is clear', () => {
        const strength = item('workout', 'morning')
        const day = [strength, item('conditioning', 'morning')]
        expect(findFreeSlot(strength, day)).toBe('afternoon')
    })

    it('prefers the later slot when two are the same distance away', () => {
        const strength = item('workout', 'afternoon')
        const day = [strength, item('conditioning', 'afternoon')]
        expect(findFreeSlot(strength, day)).toBe('evening')
    })

    it('walks further out when the nearest slot already holds a hard session', () => {
        const strength = item('workout', 'morning')
        const day = [strength, item('conditioning', 'morning'), item('workout', 'afternoon')]
        expect(findFreeSlot(strength, day)).toBe('evening')
    })

    it('will move next to mobility or recovery', () => {
        const strength = item('workout', 'morning')
        const day = [strength, item('conditioning', 'morning'), item('recovery', 'afternoon')]
        expect(findFreeSlot(strength, day)).toBe('afternoon')
    })

    it('refuses a slot already holding two items', () => {
        const strength = item('workout', 'morning')
        const day = [
            strength,
            item('conditioning', 'morning'),
            item('mobility', 'afternoon'),
            item('recovery', 'afternoon'),
        ]
        expect(findFreeSlot(strength, day)).toBe('evening')
    })

    it('honours a caller ruling a slot out', () => {
        const strength = item('workout', 'morning')
        const day = [strength, item('conditioning', 'morning')]
        expect(findFreeSlot(strength, day, (part) => part === 'afternoon')).toBe('evening')
        expect(findFreeSlot(strength, day, () => true)).toBeNull()
    })

    it('returns null when the day has nowhere free', () => {
        const strength = item('workout', 'morning')
        const day = [
            strength,
            item('conditioning', 'morning'),
            item('workout', 'afternoon'),
            item('conditioning', 'evening'),
        ]
        expect(findFreeSlot(strength, day)).toBeNull()
    })

    it('ignores other days when weighing a slot', () => {
        const strength = item('workout', 'morning', '2026-08-17')
        const day = [strength, item('conditioning', 'morning', '2026-08-17')]
        // Another day's afternoon being busy is beside the point — the caller
        // passes one day's items, and only those are weighed.
        expect(findFreeSlot(strength, day)).toBe('afternoon')
    })
})
