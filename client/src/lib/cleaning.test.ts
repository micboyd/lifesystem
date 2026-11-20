import { describe, expect, it } from 'vitest'
import type { CleaningRoom, CleaningFreq } from '../types'
import { ROOM_PRESETS, blockNotes, buildSchedule, cycleWeekOf, dayFor, mondayOf, nextRoomName, roomFromPreset, timeboxBlocks, weeklyMinutes } from './cleaning'

let n = 0
const task = (name: string, minutes: number, freq: CleaningFreq) => ({ key: `t${++n}`, name, minutes, freq })
const room = (name: string, tasks: ReturnType<typeof task>[]): CleaningRoom => ({ key: `r${++n}`, name, kind: 'custom', tasks })

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const allItems = (s: ReturnType<typeof buildSchedule>) => s.weeks.flat().flatMap((d) => d.items)

describe('buildSchedule', () => {
    it('is one week without fortnightly or monthly jobs, Monday first', () => {
        const s = buildSchedule([room('Kitchen', [task('Mop', 15, 'weekly')])], { minutesPerDay: 30, days: [0, 1, 3] })
        expect(s.weeks).toHaveLength(1)
        expect(s.weeks[0].map((d) => d.dow)).toEqual([1, 3, 0])
    })

    it('rotates over four weeks once a monthly job is in', () => {
        const s = buildSchedule([room('Kitchen', [task('Oven', 45, 'monthly'), task('Mop', 15, 'weekly')])], {
            minutesPerDay: 60,
            days: EVERY_DAY,
        })
        expect(s.weeks).toHaveLength(4)
        expect(allItems(s).filter((i) => i.name === 'Oven')).toHaveLength(1)
        expect(allItems(s).filter((i) => i.name === 'Mop')).toHaveLength(4)
    })

    it('puts daily jobs on every cleaning day', () => {
        const s = buildSchedule([room('Kitchen', [task('Worktops', 10, 'daily')])], { minutesPerDay: 30, days: [1, 2, 3] })
        expect(s.weeks[0].every((d) => d.items.some((i) => i.name === 'Worktops'))).toBe(true)
    })

    it('spreads weekly jobs over the emptiest days', () => {
        const jobs = [task('A', 20, 'weekly'), task('B', 20, 'weekly'), task('C', 20, 'weekly')]
        const s = buildSchedule([room('Home', jobs)], { minutesPerDay: 30, days: [1, 3, 5] })
        expect(s.weeks[0].map((d) => d.total)).toEqual([20, 20, 20])
        expect(s.splitJobs).toBe(0)
    })

    it('cuts a job longer than a day into numbered parts', () => {
        const s = buildSchedule([room('Kitchen', [task('Deep clean', 70, 'weekly')])], { minutesPerDay: 30, days: [1, 2, 3, 4] })
        const parts = allItems(s).filter((i) => i.name === 'Deep clean')
        expect(parts.map((p) => p.part)).toEqual([1, 2, 3])
        expect(parts.every((p) => p.parts === 3)).toBe(true)
        expect(parts.reduce((sum, p) => sum + p.minutes, 0)).toBe(70)
        expect(s.splitJobs).toBe(1)
        expect(s.overDays).toBe(0)
    })

    it('never leaves a final part under 10 minutes when it can borrow', () => {
        const s = buildSchedule([room('Kitchen', [task('Big', 65, 'weekly')])], { minutesPerDay: 30, days: [1, 2, 3] })
        const parts = allItems(s).filter((i) => i.name === 'Big')
        expect(parts.every((p) => p.minutes >= 10)).toBe(true)
        expect(parts.reduce((sum, p) => sum + p.minutes, 0)).toBe(65)
    })

    it('splits a job that fits a day but not the room left, across days', () => {
        const jobs = [task('A', 20, 'weekly'), task('B', 20, 'weekly'), task('C', 20, 'weekly')]
        const s = buildSchedule([room('Home', jobs)], { minutesPerDay: 30, days: [1, 2] })
        expect(s.overDays).toBe(0)
        expect(s.weeks[0].map((d) => d.total)).toEqual([30, 30])
        expect(s.splitJobs).toBe(1)
    })

    it('overflows the lightest day when there simply isn’t time', () => {
        const s = buildSchedule([room('Home', [task('A', 60, 'weekly')])], { minutesPerDay: 20, days: [1] })
        expect(s.weeks[0][0].total).toBe(60)
        expect(s.overDays).toBe(1)
    })

    it('places twice-weekly jobs in each half of the week', () => {
        const s = buildSchedule([room('Kitchen', [task('Bins', 5, '2x-week')])], { minutesPerDay: 30, days: [1, 2, 3, 4, 5, 6] })
        const days = s.weeks[0].filter((d) => d.items.length).map((d) => d.dow)
        expect(days).toHaveLength(2)
        expect(days[0]).toBeLessThanOrEqual(3)
        expect(days[1]).toBeGreaterThanOrEqual(4)
    })

    it('puts fortnightly jobs two weeks apart', () => {
        const s = buildSchedule([room('Hall', [task('Mop', 10, 'fortnightly')])], { minutesPerDay: 30, days: [1] })
        const weeks = s.weeks.map((w, i) => (w[0].items.length ? i : -1)).filter((i) => i >= 0)
        expect(weeks[1] - weeks[0]).toBe(2)
    })

    it('runs a year once something is every 3 months, spaced 13 weeks apart', () => {
        const s = buildSchedule([room('Kitchen', [task('Cupboards', 45, 'quarterly'), task('Oven', 30, 'monthly')])], {
            minutesPerDay: 60,
            days: [1, 4],
        })
        expect(s.weeks).toHaveLength(52)
        const weeksWith = (name: string) =>
            s.weeks.map((w, i) => (w.some((d) => d.items.some((x) => x.name === name)) ? i : -1)).filter((i) => i >= 0)
        const q = weeksWith('Cupboards')
        expect(q).toHaveLength(4)
        expect(q.slice(1).map((w, i) => w - q[i])).toEqual([13, 13, 13])
        expect(weeksWith('Oven')).toHaveLength(13)
    })

    it('puts yearly jobs in once and steers them off busy weeks', () => {
        const s = buildSchedule(
            [room('Home', [task('Declutter', 120, 'yearly'), task('Gas service', 15, 'yearly'), task('Grout', 30, 'quarterly')])],
            { minutesPerDay: 60, days: [6] }
        )
        const items = allItems(s)
        expect(items.filter((i) => i.name === 'Gas service')).toHaveLength(1)
        const declutter = items.filter((i) => i.name === 'Declutter')
        expect(declutter.reduce((sum, p) => sum + p.minutes, 0)).toBe(120)
        expect(declutter.length).toBeGreaterThan(1)
        expect(s.splitJobs).toBe(1)
    })

    it('copes with every preset room at once', () => {
        const rooms = ROOM_PRESETS.map((p) => roomFromPreset(p))
        const s = buildSchedule(rooms, { minutesPerDay: 60, days: [1, 2, 3, 4, 5, 6, 0] })
        expect(s.weeks).toHaveLength(52)
        const scheduled = allItems(s).reduce((sum, i) => sum + i.minutes, 0)
        const expected = rooms.reduce((sum, r) => sum + r.tasks.reduce((x, t) => x + weeklyMinutes(t, 7) * 52, 0), 0)
        expect(scheduled).toBeCloseTo(expected, 5)
    })

    it('is empty with no cleaning days', () => {
        expect(buildSchedule([room('A', [task('x', 5, 'weekly')])], { minutesPerDay: 30, days: [] }).weeks).toEqual([])
    })
})

describe('dates', () => {
    it('finds the Monday', () => {
        expect(mondayOf('2026-11-19')).toBe('2026-11-16')
        expect(mondayOf('2026-11-22')).toBe('2026-11-16')
    })
    it('counts rotation weeks either side of the start', () => {
        expect(cycleWeekOf('2026-11-19', '2026-11-16', 4)).toBe(0)
        expect(cycleWeekOf('2026-11-30', '2026-11-16', 4)).toBe(2)
        expect(cycleWeekOf('2026-11-09', '2026-11-16', 4)).toBe(3)
        expect(cycleWeekOf('2026-12-30', '2026-11-16', 1)).toBe(0)
    })
})

describe('timeboxBlocks', () => {
    it('makes one block per cleaning day with the jobs in its notes', () => {
        const s = buildSchedule([room('Kitchen', [task('Mop', 13, 'daily')])], { minutesPerDay: 30, days: [1, 3] })
        const blocks = timeboxBlocks(s, { from: '2026-11-16', to: '2026-11-22', cycleStart: '2026-11-16', startTime: '18:00' })
        expect(blocks.map((b) => b.date)).toEqual(['2026-11-16', '2026-11-18'])
        expect(blocks[0]).toMatchObject({ title: 'Cleaning · Kitchen', startTime: '18:00', endTime: '18:15' })
        expect(blocks[0].notes).toBe('Kitchen: Mop · 13m')
        expect(dayFor(s, '2026-11-17', '2026-11-16')).toBeNull()
    })
})

describe('blockNotes', () => {
    it('cuts long lists short to fit Timebox', () => {
        const s = buildSchedule([room('Kitchen', Array.from({ length: 80 }, (_, i) => task(`A long job name number ${i} to fill space`, 1, 'daily')))], {
            minutesPerDay: 120,
            days: [1],
        })
        const notes = blockNotes(s.weeks[0][0])
        expect(notes.length).toBeLessThanOrEqual(2000)
        expect(notes).toMatch(/…and \d+ more$/)
    })
})

describe('helpers', () => {
    it('numbers repeat room names', () => {
        const rooms = [room('Bedroom', []), room('Bedroom 2', [])]
        expect(nextRoomName(rooms, 'Bedroom')).toBe('Bedroom 3')
        expect(nextRoomName(rooms, 'Kitchen')).toBe('Kitchen')
    })
    it('averages weekly minutes', () => {
        expect(weeklyMinutes(task('x', 30, 'monthly'), 5)).toBe(7.5)
        expect(weeklyMinutes(task('x', 10, 'daily'), 5)).toBe(50)
        expect(weeklyMinutes(task('x', 52, 'yearly'), 5)).toBe(1)
    })
})
