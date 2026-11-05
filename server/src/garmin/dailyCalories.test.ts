import { describe, it, expect } from 'vitest'
import { daysToAsk, MAX_PULL_DAYS } from './dailyCalories'

const TODAY = '2026-11-04'
const never = () => false

describe('daysToAsk', () => {
    it('asks for finished days only', () => {
        expect(daysToAsk('2026-11-02', '2026-11-06', TODAY, [], never)).toEqual(['2026-11-02', '2026-11-03'])
    })

    it('never touches a typed figure, old or new', () => {
        const stored = [{ date: '2026-11-02', source: 'manual' as const }, { date: '2026-11-03' }]
        expect(daysToAsk('2026-11-01', '2026-11-03', TODAY, stored, never)).toEqual(['2026-11-01'])
    })

    it('refreshes a pulled figure while it may still change, then leaves it', () => {
        const stored = [
            { date: '2026-11-01', source: 'garmin' as const },
            { date: '2026-11-02', source: 'garmin' as const },
            { date: '2026-11-03', source: 'garmin' as const },
        ]
        expect(daysToAsk('2026-11-01', '2026-11-03', TODAY, stored, never)).toEqual(['2026-11-02', '2026-11-03'])
    })

    it('skips days asked about recently, and caps the range', () => {
        expect(daysToAsk('2026-11-02', '2026-11-03', TODAY, [], (d) => d === '2026-11-02')).toEqual(['2026-11-03'])
        expect(daysToAsk('2026-09-01', '2026-11-03', TODAY, [], never)).toHaveLength(MAX_PULL_DAYS)
    })
})
