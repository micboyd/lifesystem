import { describe, it, expect } from 'vitest'
import {
    EMPTY_STRETCHES_TO_STOP,
    earlierStretch,
    recentStretch,
    walkHistory,
    type HistoryStore,
} from './history'
import { GarminError, MAX_HISTORY_DAYS, type HistoryDay, type HistoryPull } from './provider'

const TODAY = '2026-11-14'

function days(from: string, to: string): number {
    return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
}

function memoryStore(start: { from: string | null; complete: boolean } = { from: null, complete: false }) {
    const saved: HistoryDay[] = []
    let progress = { ...start }
    const store: HistoryStore = {
        progress: async () => ({ ...progress }),
        saveDays: async (d) => void saved.push(...d),
        saveProgress: async (from, complete) => void (progress = { from, complete }),
    }
    return { store, saved, progress: () => progress }
}

/** A Garmin that has a day of steps for every day on or after `since`. */
function garminSince(since: string, calls: string[][] = []) {
    return {
        calls,
        dailyHistory: async (from: string, to: string): Promise<HistoryPull> => {
            calls.push([from, to])
            const out: HistoryDay[] = []
            for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
                const date = new Date(t).toISOString().slice(0, 10)
                if (date >= since) out.push({ date, steps: 1000 })
            }
            return { days: out, failed: [] }
        },
    }
}

describe('stretches', () => {
    it('the recent stretch ends today and is as long as one call allows', () => {
        const s = recentStretch(TODAY)
        expect(s.to).toBe(TODAY)
        expect(days(s.from, s.to)).toBe(MAX_HISTORY_DAYS)
    })

    it('the earlier stretch ends the day before what is covered', () => {
        const s = earlierStretch('2026-08-23')!
        expect(s.to).toBe('2026-08-22')
        expect(days(s.from, s.to)).toBe(MAX_HISTORY_DAYS)
    })

    it('stops at the floor', () => {
        expect(earlierStretch('2010-01-20', '2010-01-01')).toEqual({ from: '2010-01-01', to: '2010-01-19' })
        expect(earlierStretch('2010-01-01', '2010-01-01')).toBeNull()
    })
})

describe('walkHistory', () => {
    it('reads back to the start of the data, then a run of empty stretches, and stops', async () => {
        const garmin = garminSince('2026-01-01')
        const { store, saved, progress } = memoryStore()
        await walkHistory(garmin, store, TODAY)

        expect(saved[0]).toBeDefined()
        expect(saved.map((d) => d.date).sort()[0]).toBe('2026-01-01')
        expect(new Set(saved.map((d) => d.date)).size).toBe(days('2026-01-01', TODAY))
        expect(progress().complete).toBe(true)
        // Contiguous, newest first, no day asked about twice.
        for (let i = 1; i < garmin.calls.length; i++)
            expect(days(garmin.calls[i][1], garmin.calls[i - 1][0])).toBe(2)
        const empties = garmin.calls.filter(([, to]) => to < '2026-01-01').length
        expect(empties).toBe(EMPTY_STRETCHES_TO_STOP)
    })

    it('a gap shorter than the stopping run does not end the walk', async () => {
        // Nothing for two stretches (~5.5 months) in the middle, data before it.
        const recent = garminSince('2026-06-01')
        const garmin = {
            dailyHistory: async (from: string, to: string) => {
                if (to >= '2026-06-01') return recent.dailyHistory(from, to)
                if (to < '2025-11-01') return to >= '2025-06-01' ? { days: [{ date: to, steps: 5 }], failed: [] } : { days: [], failed: [] }
                return { days: [], failed: [] }
            },
        }
        const { store, saved } = memoryStore()
        await walkHistory(garmin, store, TODAY)
        expect(saved.some((d) => d.date < '2025-11-01')).toBe(true)
    })

    it('picks up where a failed walk stopped', async () => {
        const calls: string[][] = []
        const good = garminSince('2025-01-01', calls)
        let failAt = 3
        const flaky = {
            dailyHistory: async (from: string, to: string) => {
                if (--failAt === 0) throw new GarminError('rate_limited')
                return good.dailyHistory(from, to)
            },
        }
        const { store, saved, progress } = memoryStore()
        await expect(walkHistory(flaky, store, TODAY)).rejects.toThrow(GarminError)
        const reached = progress().from!
        expect(progress().complete).toBe(false)

        calls.length = 0
        await walkHistory(good, store, TODAY, { skipRecent: true })
        expect(calls[0][1] < reached).toBe(true)
        expect(new Set(saved.map((d) => d.date)).size).toBe(days('2025-01-01', TODAY))
        expect(progress().complete).toBe(true)
    })

    it('once complete, only the recent stretch is refreshed', async () => {
        const garmin = garminSince('2026-01-01')
        const { store } = memoryStore({ from: '2025-01-01', complete: true })
        await walkHistory(garmin, store, TODAY)
        expect(garmin.calls).toEqual([[recentStretch(TODAY).from, TODAY]])
    })

    it('reports measures Garmin did not answer for', async () => {
        const failed: string[] = []
        const { store } = memoryStore({ from: '2025-01-01', complete: true })
        await walkHistory({ dailyHistory: async () => ({ days: [], failed: ['sleep'] }) }, store, TODAY, {
            onFailed: (m) => failed.push(m),
        })
        expect(failed).toEqual(['sleep'])
    })
})
