import { describe, it, expect } from 'vitest'
import { buildSystems, completedDates, lastDays, linkChange, streakFor } from './habitSystem'
import type { Goal, HabitDef, HabitLog } from '../types'

function habit(id: string, active = true): HabitDef {
    return { _id: id, name: id, order: 0, active, createdAt: '', updatedAt: '' }
}

function goal(id: string, linkedHabits: string[], extra: Partial<Goal> = {}): Goal {
    return {
        _id: id,
        title: id,
        progress: 0,
        status: 'active',
        milestones: [],
        progressMode: linkedHabits.length ? 'auto' : 'manual',
        linkedHabits,
        createdAt: '',
        updatedAt: '',
        ...extra,
    }
}

function log(habitId: string, date: string, completed = true): HabitLog {
    return { _id: `${habitId}-${date}`, habit: habitId, date, completed }
}

describe('streakFor', () => {
    const done = completedDates([
        log('run', '2026-10-15'),
        log('run', '2026-10-16'),
        log('run', '2026-10-17'),
    ]).get('run')

    it('counts the run ending today', () => {
        expect(streakFor(done, '2026-10-17')).toBe(3)
    })

    it("doesn't break on an unticked today", () => {
        expect(streakFor(done, '2026-10-18')).toBe(3)
    })

    it('resets after a missed day', () => {
        expect(streakFor(done, '2026-10-19')).toBe(0)
    })

    it('ignores logs that were unticked', () => {
        const unticked = completedDates([log('run', '2026-10-17', false)]).get('run')
        expect(streakFor(unticked, '2026-10-17')).toBe(0)
    })
})

describe('lastDays', () => {
    it('ends on today, oldest first', () => {
        expect(lastDays('2026-10-17', 3)).toEqual(['2026-10-15', '2026-10-16', '2026-10-17'])
    })
})

describe('buildSystems', () => {
    it('groups habits under their goals, soonest deadline first', () => {
        const systems = buildSystems(
            [goal('later', ['a'], { targetDate: '2027-01-01' }), goal('sooner', ['b'], { targetDate: '2026-11-01' })],
            [habit('a'), habit('b')]
        )
        expect(systems.map((s) => s.goal?._id)).toEqual(['sooner', 'later'])
    })

    it('puts unlinked habits in a trailing standalone group', () => {
        const systems = buildSystems([goal('g', ['a'])], [habit('a'), habit('b')])
        expect(systems[systems.length - 1]).toEqual({ goal: null, habits: [habit('b')] })
    })

    it('shows a habit under every goal it feeds', () => {
        const systems = buildSystems([goal('x', ['a']), goal('y', ['a'])], [habit('a')])
        expect(systems.map((s) => s.habits.length)).toEqual([1, 1])
    })

    it('leaves out finished goals, archived habits and dangling links', () => {
        const systems = buildSystems(
            [goal('done', ['a'], { status: 'completed' }), goal('live', ['a', 'gone', 'old'])],
            [habit('a'), habit('old', false)]
        )
        expect(systems).toEqual([{ goal: goal('live', ['a', 'gone', 'old']), habits: [habit('a')] }])
    })
})

describe('linkChange', () => {
    it('switches progress to the habits on the first link', () => {
        expect(linkChange(goal('g', []), 'a', true)).toEqual({ linkedHabits: ['a'], progressMode: 'auto' })
    })

    it('hands progress back to manual when the last habit leaves', () => {
        expect(linkChange(goal('g', ['a']), 'a', false)).toEqual({ linkedHabits: [], progressMode: 'manual' })
    })

    it('leaves the mode alone otherwise', () => {
        expect(linkChange(goal('g', ['a']), 'b', true)).toEqual({ linkedHabits: ['a', 'b'] })
    })
})
