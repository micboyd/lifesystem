import { describe, it, expect } from 'vitest'
import { changedDays, stepRangeIsValid } from './dailySteps'

const FROM = '2026-11-02'
const TO = '2026-11-09'

describe('stepRangeIsValid', () => {
    it('counts both ends of the range', () => {
        expect(stepRangeIsValid('2026-11-01', '2026-11-28', 28)).toBe(true)
        expect(stepRangeIsValid('2026-10-31', '2026-11-28', 28)).toBe(false)
    })

    it('rejects a backwards range and impossible dates', () => {
        expect(stepRangeIsValid(TO, FROM, 28)).toBe(false)
        expect(stepRangeIsValid('2026-13-45', TO, 28)).toBe(false)
    })
})

describe('changedDays', () => {
    it('keeps new days and days whose total moved', () => {
        const stored = [
            { date: '2026-11-07', steps: 9000 },
            { date: '2026-11-08', steps: 4000 },
        ]
        const pulled = [
            { date: '2026-11-07', steps: 9000 },
            { date: '2026-11-08', steps: 6500 },
            { date: '2026-11-09', steps: 1200 },
        ]
        expect(changedDays(pulled, stored, FROM, TO)).toEqual([
            { date: '2026-11-08', steps: 6500 },
            { date: '2026-11-09', steps: 1200 },
        ])
    })

    it('ignores anything outside the range asked for', () => {
        expect(changedDays([{ date: '2026-11-10', steps: 100 }], [], FROM, TO)).toEqual([])
    })
})
