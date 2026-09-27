import { describe, expect, it } from 'vitest'
import {
    clockLabel,
    currentIndex,
    elapsedMin,
    hasSlot,
    paceOf,
    slotLabel,
    toSecondMark,
    type ClockState,
} from './sessionClock'

const slots = [
    { startMin: 0, endMin: 10 },
    { startMin: 15, endMin: 30 },
    {}, // untimed — never counts
    { startMin: 30, endMin: 45 },
]

function state(doneAt: Record<number, number> = {}): ClockState {
    return { startedAt: 0, doneAt }
}

describe('labels', () => {
    it('formats minute marks as M:SS', () => {
        expect(clockLabel(0)).toBe('0:00')
        expect(clockLabel(27.5)).toBe('27:30')
        expect(clockLabel(61 / 60)).toBe('1:01')
    })

    it('shows whole slots as plain minutes, others as clock marks', () => {
        expect(slotLabel({ startMin: 15, endMin: 30 })).toBe('15–30')
        expect(slotLabel({ startMin: 1.5, endMin: 3 })).toBe('1:30–3:00')
    })

    it('needs both ends, with the end after the start', () => {
        expect(hasSlot({ startMin: 0, endMin: 5 })).toBe(true)
        expect(hasSlot({ startMin: 5 })).toBe(false)
        expect(hasSlot({ startMin: 5, endMin: 5 })).toBe(false)
    })
})

describe('the clock', () => {
    it('reads elapsed minutes from the start time', () => {
        expect(elapsedMin({ startedAt: null, doneAt: {} }, 90_000)).toBe(0)
        expect(elapsedMin({ startedAt: 0, doneAt: {} }, 90_000)).toBe(1.5)
    })

    it('stores taps to the second', () => {
        expect(toSecondMark(12.3456)).toBeCloseTo(741 / 60)
    })
})

describe('pace', () => {
    it('is idle before the clock starts', () => {
        expect(paceOf(slots, { startedAt: null, doneAt: {} }, 0)).toEqual({ kind: 'idle' })
    })

    it('is on track inside the current slot', () => {
        expect(paceOf(slots, state(), 5)).toEqual({ kind: 'on' })
    })

    it('is behind once the current item overruns its slot', () => {
        expect(paceOf(slots, state(), 13.2)).toEqual({ kind: 'behind', min: 3 })
    })

    it('is ahead when the next item’s slot has not come round yet', () => {
        expect(paceOf(slots, state({ 0: 8 }), 9)).toEqual({ kind: 'ahead', min: 6 })
    })

    it('skips untimed items and finishes when every timed one is done', () => {
        expect(currentIndex(slots, state({ 0: 9, 1: 29 }))).toBe(3)
        expect(paceOf(slots, state({ 0: 9, 1: 29, 3: 44 }), 44)).toEqual({ kind: 'done' })
    })
})
