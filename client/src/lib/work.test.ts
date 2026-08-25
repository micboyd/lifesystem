import { describe, it, expect } from 'vitest'
import {
    dueBucket,
    dueLabel,
    sortTasks,
    groupByDue,
    groupByProject,
    waitingDays,
    waitTone,
    daysSinceNudge,
    needsChase,
    groupByPerson,
    stateAgeDays,
    isStateStale,
    stateAgeLabel,
} from './work'
import type { WorkProject, WorkTask } from '../types'

const TODAY = '2026-08-25'

/** A task carrying only the fields the grouping and waiting math read. */
function task(overrides: Partial<WorkTask> & { _id: string }): WorkTask {
    return {
        title: overrides._id,
        status: 'todo',
        priority: 'normal',
        project: null,
        waitingOn: null,
        order: 0,
        completedAt: null,
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
        ...overrides,
    } as WorkTask
}

function project(overrides: Partial<WorkProject> & { _id: string }): WorkProject {
    return {
        name: overrides._id,
        status: 'active',
        color: 'slate',
        order: 0,
        stats: { open: 0, done: 0, waiting: 0, overdue: 0, nextDue: null },
        createdAt: '2026-07-01T09:00:00.000Z',
        updatedAt: '2026-07-01T09:00:00.000Z',
        ...overrides,
    } as WorkProject
}

describe('dueBucket', () => {
    it('splits the near future into named buckets', () => {
        expect(dueBucket('2026-08-24', TODAY)).toBe('overdue')
        expect(dueBucket('2026-08-25', TODAY)).toBe('today')
        expect(dueBucket('2026-08-26', TODAY)).toBe('tomorrow')
        expect(dueBucket('2026-09-01', TODAY)).toBe('week')
        expect(dueBucket('2026-09-02', TODAY)).toBe('later')
    })

    it('treats undated work as someday rather than hiding it', () => {
        expect(dueBucket(undefined, TODAY)).toBe('someday')
    })

    it('counts a week as seven days inclusive of the boundary', () => {
        expect(dueBucket('2026-09-01', TODAY)).toBe('week') // +7
        expect(dueBucket('2026-09-02', TODAY)).toBe('later') // +8
    })
})

describe('dueLabel', () => {
    it('names the near dates and counts the overdue ones', () => {
        expect(dueLabel('2026-08-22', TODAY)).toBe('Overdue by 3 days')
        expect(dueLabel('2026-08-24', TODAY)).toBe('Overdue by 1 day')
        expect(dueLabel('2026-08-25', TODAY)).toBe('Due today')
        expect(dueLabel('2026-08-26', TODAY)).toBe('Due tomorrow')
    })

    it('uses a weekday inside the week and a date beyond it', () => {
        expect(dueLabel('2026-08-28', TODAY)).toBe('Due Fri')
        expect(dueLabel('2026-09-15', TODAY)).toBe('Due 15 Sep 2026')
    })
})

describe('sortTasks', () => {
    it('floats high priority and sinks low, keeping manual order within a tier', () => {
        const sorted = sortTasks([
            task({ _id: 'b', order: 1 }),
            task({ _id: 'low', priority: 'low', order: 0 }),
            task({ _id: 'a', order: 0 }),
            task({ _id: 'high', priority: 'high', order: 9 }),
        ])
        expect(sorted.map((t) => t._id)).toEqual(['high', 'a', 'b', 'low'])
    })

    it('does not mutate its input', () => {
        const input = [task({ _id: 'a', order: 1 }), task({ _id: 'b', order: 0 })]
        sortTasks(input)
        expect(input.map((t) => t._id)).toEqual(['a', 'b'])
    })
})

describe('groupByDue', () => {
    it('orders buckets by when they happen and drops the empty ones', () => {
        const groups = groupByDue(
            [
                task({ _id: 'later', dueDate: '2026-10-01' }),
                task({ _id: 'overdue', dueDate: '2026-08-20' }),
                task({ _id: 'none' }),
                task({ _id: 'today', dueDate: TODAY }),
            ],
            TODAY
        )
        expect(groups.map((g) => g.key)).toEqual(['overdue', 'today', 'later', 'someday'])
        expect(groups.every((g) => g.tasks.length > 0)).toBe(true)
    })
})

describe('groupByProject', () => {
    const projects = [project({ _id: 'p1', name: 'Migration' }), project({ _id: 'p2', name: 'Hiring' })]

    it('keeps projects in their own order and puts unfiled work last', () => {
        const groups = groupByProject(
            [
                task({ _id: 'loose' }),
                task({ _id: 'b', project: 'p2' }),
                task({ _id: 'a', project: 'p1' }),
            ],
            projects
        )
        expect(groups.map((g) => g.label)).toEqual(['Migration', 'Hiring', 'No project'])
    })

    it('files a task whose project no longer exists as unfiled', () => {
        const groups = groupByProject([task({ _id: 'orphan', project: 'deleted' })], projects)
        expect(groups.map((g) => g.key)).toEqual(['unfiled'])
    })

    it('omits projects with nothing in them', () => {
        const groups = groupByProject([task({ _id: 'a', project: 'p1' })], projects)
        expect(groups.map((g) => g.label)).toEqual(['Migration'])
    })
})

describe('waiting', () => {
    it('ages from the stamped waitingSince', () => {
        expect(waitingDays(task({ _id: 'a', waitingSince: '2026-08-18' }), TODAY)).toBe(7)
    })

    it('falls back to the creation date for items stamped before the field existed', () => {
        expect(waitingDays(task({ _id: 'a' }), TODAY)).toBe(24)
    })

    it('escalates tone at a week and a fortnight', () => {
        expect(waitTone(6)).toBe('fresh')
        expect(waitTone(7)).toBe('aging')
        expect(waitTone(13)).toBe('aging')
        expect(waitTone(14)).toBe('stale')
    })

    it('reports days since the last chase, or null when never chased', () => {
        expect(daysSinceNudge(task({ _id: 'a' }), TODAY)).toBeNull()
        expect(daysSinceNudge(task({ _id: 'a', nudgedAt: '2026-08-23' }), TODAY)).toBe(2)
    })
})

describe('needsChase', () => {
    it('stays quiet while the item is still fresh', () => {
        expect(needsChase(task({ _id: 'a', waitingSince: '2026-08-23' }), TODAY)).toBe(false)
    })

    it('asks for a chase once it has been sitting a week', () => {
        expect(needsChase(task({ _id: 'a', waitingSince: '2026-08-18' }), TODAY)).toBe(true)
    })

    it('goes quiet again after a recent chase, however old the item is', () => {
        const old = { _id: 'a', waitingSince: '2026-06-01' }
        expect(needsChase(task({ ...old, nudgedAt: '2026-08-24' }), TODAY)).toBe(false)
        expect(needsChase(task({ ...old, nudgedAt: '2026-08-10' }), TODAY)).toBe(true)
    })
})

describe('groupByPerson', () => {
    const names = new Map([
        ['s', 'Sarah'],
        ['t', 'Tom'],
    ])

    it('puts the longest-waiting person first and counts what needs chasing', () => {
        const groups = groupByPerson(
            [
                task({ _id: 'recent', waitingOn: 't', waitingSince: '2026-08-24' }),
                task({ _id: 'old', waitingOn: 's', waitingSince: '2026-08-01' }),
                task({ _id: 'newer', waitingOn: 's', waitingSince: '2026-08-24' }),
            ],
            names,
            TODAY
        )

        expect(groups.map((g) => g.label)).toEqual(['Sarah', 'Tom'])
        expect(groups[0].oldestDays).toBe(24)
        expect(groups[0].needsChase).toBe(1)
        // Oldest item first within the person, too.
        expect(groups[0].tasks.map((t) => t._id)).toEqual(['old', 'newer'])
        expect(groups[1].needsChase).toBe(0)
    })

    it('keeps items blocked on nobody rather than dropping them', () => {
        const groups = groupByPerson([task({ _id: 'a', waitingSince: TODAY })], new Map(), TODAY)
        expect(groups.map((g) => g.key)).toEqual(['unassigned'])
        expect(groups[0].label).toBe('Not assigned')
    })
})

describe('project state staleness', () => {
    it('measures the age of the status line', () => {
        expect(stateAgeDays(project({ _id: 'p' }), TODAY)).toBeNull()
        expect(
            stateAgeDays(project({ _id: 'p', stateUpdatedAt: '2026-08-20T10:00:00.000Z' }), TODAY)
        ).toBe(5)
    })

    it('counts a never-written or fortnight-old status as stale', () => {
        expect(isStateStale(project({ _id: 'p' }), TODAY)).toBe(true)
        expect(
            isStateStale(project({ _id: 'p', stateUpdatedAt: '2026-08-11T10:00:00.000Z' }), TODAY)
        ).toBe(true)
        expect(
            isStateStale(project({ _id: 'p', stateUpdatedAt: '2026-08-12T10:00:00.000Z' }), TODAY)
        ).toBe(false)
    })

    it('does not nag about projects that are not active', () => {
        expect(isStateStale(project({ _id: 'p', status: 'done' }), TODAY)).toBe(false)
        expect(isStateStale(project({ _id: 'p', status: 'paused' }), TODAY)).toBe(false)
    })

    it('reads the age in words', () => {
        expect(stateAgeLabel(project({ _id: 'p' }), TODAY)).toBe('No status yet')
        expect(
            stateAgeLabel(project({ _id: 'p', stateUpdatedAt: '2026-08-25T08:00:00.000Z' }), TODAY)
        ).toBe('Updated today')
        expect(
            stateAgeLabel(project({ _id: 'p', stateUpdatedAt: '2026-08-24T08:00:00.000Z' }), TODAY)
        ).toBe('Updated yesterday')
        expect(
            stateAgeLabel(project({ _id: 'p', stateUpdatedAt: '2026-08-18T08:00:00.000Z' }), TODAY)
        ).toBe('Updated 7 days ago')
    })
})
