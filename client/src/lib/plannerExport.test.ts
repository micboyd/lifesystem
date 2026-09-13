import { describe, it, expect } from 'vitest'
import {
    buildPlannerExport,
    countCompleted,
    countEntries,
    exportFilename,
    weekRangeFor,
    DEFAULT_EXPORT_OPTIONS,
    NO_LOGS,
    type PlannerExportInput,
    type PlannerExportLogs,
    type PlannerExportOptions,
} from './plannerExport'
import type {
    ConditioningLog,
    ConditioningSession,
    Exercise,
    FitnessFlagColor,
    FitnessNoteScope,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanNote,
    FitnessPlanPart,
    MobilityLog,
    Recovery,
    RecoveryLog,
    Workout,
    WorkoutLog,
} from '../types'

const STAMP = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }
const NOW = new Date('2026-08-18T09:00:00.000Z')

function workout(over: Partial<Workout> = {}): Workout {
    return {
        _id: 'w1',
        name: 'Lower A',
        description: '',
        duration: 45,
        showInPlanner: true,
        exercises: [{ exercise: 'e1', sets: 3, reps: '8-12' }],
        order: 0,
        ...STAMP,
        ...over,
    }
}

function session(over: Partial<ConditioningSession> = {}): ConditioningSession {
    return {
        _id: 's1',
        name: 'Bike Intervals',
        duration: 25,
        category: 'HIIT',
        parts: [{ name: 'Main set', detail: '8 x 30s', rounds: 8, roundLabel: 'interval' }],
        order: 0,
        ...STAMP,
        ...over,
    }
}

function recovery(over: Partial<Recovery> = {}): Recovery {
    return { _id: 'r1', name: 'Sauna', duration: 20, order: 0, ...STAMP, ...over }
}

/** A planned entry. `kind` decides which populated slot the item lands in. */
function entry(
    over: Partial<FitnessPlanEntry> & { date: string; kind: FitnessPlanKind }
): FitnessPlanEntry {
    return {
        _id: `${over.date}-${over.kind}-${over.order ?? 0}`,
        part: 'morning' as FitnessPlanPart,
        workout: null,
        session: null,
        recovery: null,
        mobility: null,
        plan: null,
        order: 0,
        ...STAMP,
        ...over,
    }
}

function note(
    scope: FitnessNoteScope,
    date: string,
    label: string,
    color: FitnessFlagColor = 'coral'
): FitnessPlanNote {
    return { _id: `${scope}-${date}`, scope, date, color, label, ...STAMP }
}

function workoutLog(over: Partial<WorkoutLog> & { date: string }): WorkoutLog {
    return {
        _id: `wl-${over.date}`,
        workout: 'w1',
        name: 'Lower A',
        exercises: [{ name: 'Back Squat', sets: 3, reps: '8-12' }],
        ...STAMP,
        ...over,
    }
}

function conditioningLog(over: Partial<ConditioningLog> & { date: string }): ConditioningLog {
    return {
        _id: `cl-${over.date}`,
        session: 's1',
        name: 'Bike Intervals',
        category: 'HIIT',
        duration: 25,
        ...STAMP,
        ...over,
    }
}

function mobilityLog(over: Partial<MobilityLog> & { date: string }): MobilityLog {
    return {
        _id: `ml-${over.date}`,
        mobility: 'm1',
        name: 'Hips',
        duration: 10,
        ...STAMP,
        ...over,
    }
}

function recoveryLog(over: Partial<RecoveryLog> & { date: string }): RecoveryLog {
    return {
        _id: `rl-${over.date}`,
        recovery: 'r1',
        name: 'Sauna',
        duration: 20,
        ...STAMP,
        ...over,
    }
}

function logs(over: Partial<PlannerExportLogs> = {}): PlannerExportLogs {
    return { ...NO_LOGS, ...over }
}

function input(over: Partial<PlannerExportInput> = {}): PlannerExportInput {
    return {
        start: '2026-08-17',
        end: '2026-08-23',
        entries: [],
        notes: [],
        logs: NO_LOGS,
        exercisesById: new Map<string, Exercise>(),
        // Logs off by default here so the existing expectations stay about the
        // plan alone; the suites below turn them on deliberately.
        options: { ...DEFAULT_EXPORT_OPTIONS, logs: false },
        ...over,
    }
}

function options(over: Partial<PlannerExportOptions>): PlannerExportOptions {
    return { ...DEFAULT_EXPORT_OPTIONS, logs: false, ...over }
}

describe('weekRangeFor', () => {
    it('widens to whole Monday–Sunday weeks', () => {
        // Wednesday to Friday of the same week.
        expect(weekRangeFor('2026-08-19', '2026-08-21')).toEqual({
            start: '2026-08-17',
            end: '2026-08-23',
        })
    })

    it('leaves an already-aligned week alone', () => {
        expect(weekRangeFor('2026-08-17', '2026-08-23')).toEqual({
            start: '2026-08-17',
            end: '2026-08-23',
        })
    })

    it('spans every week the range touches', () => {
        expect(weekRangeFor('2026-08-20', '2026-09-01')).toEqual({
            start: '2026-08-17',
            end: '2026-09-06',
        })
    })

    it('copes with the bounds the wrong way round', () => {
        expect(weekRangeFor('2026-08-23', '2026-08-17')).toEqual({
            start: '2026-08-17',
            end: '2026-08-23',
        })
    })
})

describe('buildPlannerExport', () => {
    it('groups entries by day and slot, in slot order', () => {
        const payload = buildPlannerExport(
            input({
                entries: [
                    entry({
                        date: '2026-08-19',
                        kind: 'recovery',
                        part: 'evening',
                        recovery: recovery(),
                    }),
                    entry({
                        date: '2026-08-19',
                        kind: 'workout',
                        part: 'morning',
                        workout: workout(),
                    }),
                ],
            }),
            NOW
        )

        expect(payload.weeks).toHaveLength(1)
        const [day] = payload.weeks[0].days
        expect(day.date).toBe('2026-08-19')
        expect(day.weekday).toBe('Wednesday')
        expect(day.morning?.map((e) => e.name)).toEqual(['Lower A'])
        expect(day.afternoon).toBeUndefined()
        expect(day.evening?.map((e) => e.name)).toEqual(['Sauna'])
    })

    it('sorts a slot by each entry’s order', () => {
        const payload = buildPlannerExport(
            input({
                entries: [
                    entry({
                        date: '2026-08-19',
                        kind: 'conditioning',
                        order: 2,
                        session: session({ name: 'Second' }),
                    }),
                    entry({
                        date: '2026-08-19',
                        kind: 'workout',
                        order: 0,
                        workout: workout({ name: 'First' }),
                    }),
                ],
            }),
            NOW
        )

        expect(payload.weeks[0].days[0].morning?.map((e) => e.name)).toEqual(['First', 'Second'])
    })

    it('defaults an entry with no slot to morning', () => {
        const e = entry({ date: '2026-08-19', kind: 'workout', workout: workout() })
        // A legacy row saved before slots existed.
        delete (e as Partial<FitnessPlanEntry>).part
        const payload = buildPlannerExport(input({ entries: [e] }), NOW)
        expect(payload.weeks[0].days[0].morning).toHaveLength(1)
    })

    it('drops entries whose library item has been deleted', () => {
        const payload = buildPlannerExport(
            input({ entries: [entry({ date: '2026-08-19', kind: 'workout' })] }),
            NOW
        )
        expect(payload.weeks).toHaveLength(0)
        expect(countEntries(payload)).toBe(0)
    })

    it('ignores entries outside the widened range', () => {
        const payload = buildPlannerExport(
            input({
                entries: [entry({ date: '2026-08-24', kind: 'workout', workout: workout() })],
            }),
            NOW
        )
        expect(countEntries(payload)).toBe(0)
    })

    it('counts totals per kind, for the week and the whole range', () => {
        const payload = buildPlannerExport(
            input({
                end: '2026-08-30',
                entries: [
                    entry({ date: '2026-08-19', kind: 'workout', workout: workout() }),
                    entry({ date: '2026-08-21', kind: 'workout', workout: workout() }),
                    entry({ date: '2026-08-26', kind: 'conditioning', session: session() }),
                ],
            }),
            NOW
        )

        expect(payload.totals).toEqual({ workout: 2, conditioning: 1, mobility: 0, recovery: 0 })
        expect(payload.weeks[0].totals.workout).toBe(2)
        expect(payload.weeks[1].totals).toEqual({
            workout: 0,
            conditioning: 1,
            mobility: 0,
            recovery: 0,
        })
        expect(countEntries(payload)).toBe(3)
    })

    it('carries the plan that placed an entry, and an accepted clash', () => {
        const payload = buildPlannerExport(
            input({
                entries: [
                    entry({
                        date: '2026-08-19',
                        kind: 'workout',
                        workout: workout(),
                        plan: 'plan-1',
                        ignoreClash: true,
                    }),
                    entry({
                        date: '2026-08-20',
                        kind: 'workout',
                        workout: workout(),
                    }),
                ],
            }),
            NOW
        )

        const [placed, byHand] = payload.weeks[0].days.flatMap((d) => d.morning ?? [])
        expect(placed).toMatchObject({ item: 'w1', plan: 'plan-1', ignoreClash: true })
        expect(byHand.plan).toBeNull()
        expect(byHand).not.toHaveProperty('ignoreClash')
    })
})

describe('buildPlannerExport — flags', () => {
    it('attaches day and week flags', () => {
        const payload = buildPlannerExport(
            input({
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
                notes: [
                    note('week', '2026-08-17', 'Deload', 'amber'),
                    note('day', '2026-08-19', 'Key session'),
                ],
            }),
            NOW
        )

        expect(payload.weeks[0].flag).toEqual({ color: 'amber', label: 'Deload' })
        expect(payload.weeks[0].days[0].flag).toEqual({ color: 'coral', label: 'Key session' })
    })

    it('keeps a flagged but otherwise empty day', () => {
        const payload = buildPlannerExport(
            input({ notes: [note('day', '2026-08-19', 'Rest')] }),
            NOW
        )
        expect(payload.weeks[0].days.map((d) => d.date)).toEqual(['2026-08-19'])
    })

    it('leaves flags out entirely when they are not wanted', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ flags: false }),
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
                notes: [
                    note('week', '2026-08-17', 'Deload'),
                    note('day', '2026-08-19', 'Key session'),
                ],
            }),
            NOW
        )

        expect(payload.weeks[0]).not.toHaveProperty('flag')
        expect(payload.weeks[0].days[0]).not.toHaveProperty('flag')
    })
})

describe('buildPlannerExport — completion', () => {
    it('marks an entry done when a log matches its item and day', () => {
        const payload = buildPlannerExport(
            input({
                logs: logs({ workout: [workoutLog({ date: '2026-08-19' })] }),
                entries: [
                    entry({ date: '2026-08-19', kind: 'workout', workout: workout() }),
                    entry({ date: '2026-08-20', kind: 'workout', workout: workout() }),
                ],
            }),
            NOW
        )

        const rows = payload.weeks[0].days.flatMap((d) => d.morning ?? [])
        expect(rows.map((r) => r.done)).toEqual([true, false])
    })

    it('omits done entirely when completion is off', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ completion: false, logs: false }),
                logs: logs({ workout: [workoutLog({ date: '2026-08-19' })] }),
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )
        expect(payload.weeks[0].days[0].morning?.[0]).not.toHaveProperty('done')
    })
})

describe('buildPlannerExport — details', () => {
    it('expands a workout with its exercise names', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ details: true }),
                exercisesById: new Map([
                    ['e1', { _id: 'e1', name: 'Back Squat', description: '', order: 0, ...STAMP }],
                ]),
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )

        expect(payload.weeks[0].days[0].morning?.[0].details).toEqual({
            duration: 45,
            exercises: [{ name: 'Back Squat', sets: 3, reps: '8-12' }],
        })
    })

    it('falls back to the exercise id when it is not in the library', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ details: true }),
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )
        const details = payload.weeks[0].days[0].morning?.[0].details as {
            exercises: { name: string }[]
        }
        expect(details.exercises[0].name).toBe('e1')
    })

    it('expands a conditioning session with its parts', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ details: true }),
                entries: [entry({ date: '2026-08-19', kind: 'conditioning', session: session() })],
            }),
            NOW
        )

        expect(payload.weeks[0].days[0].morning?.[0].details).toEqual({
            duration: 25,
            category: 'HIIT',
            parts: [{ name: 'Main set', detail: '8 x 30s', rounds: 8, roundLabel: 'interval' }],
        })
    })

    it('leaves details off by default', () => {
        const payload = buildPlannerExport(
            input({
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )
        expect(payload.weeks[0].days[0].morning?.[0]).not.toHaveProperty('details')
    })
})

describe('buildPlannerExport — empty days', () => {
    it('skips empty days and empty weeks by default', () => {
        const payload = buildPlannerExport(
            input({
                end: '2026-08-30',
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )

        expect(payload.weeks).toHaveLength(1)
        expect(payload.weeks[0].days).toHaveLength(1)
    })

    it('keeps every date in the range when asked', () => {
        const payload = buildPlannerExport(
            input({
                end: '2026-08-30',
                options: options({ emptyDays: true }),
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )

        expect(payload.weeks).toHaveLength(2)
        expect(payload.weeks[0].days).toHaveLength(7)
        expect(payload.weeks[1].days).toHaveLength(7)
        expect(payload.weeks[1].days.every((d) => !d.morning && !d.evening)).toBe(true)
    })
})

describe('buildPlannerExport — completed sessions', () => {
    const withLogs = options({ logs: true })

    it('carries each day\u2019s logs, whatever category they came from', () => {
        const payload = buildPlannerExport(
            input({
                options: withLogs,
                logs: logs({
                    workout: [workoutLog({ date: '2026-08-19', durationMin: 52 })],
                    conditioning: [conditioningLog({ date: '2026-08-19', rpe: 8 })],
                    mobility: [mobilityLog({ date: '2026-08-21' })],
                    recovery: [recoveryLog({ date: '2026-08-21' })],
                }),
            }),
            NOW
        )

        const days = payload.weeks[0].days
        expect(days.map((d) => d.date)).toEqual(['2026-08-19', '2026-08-21'])
        expect(days[0].completed?.map((c) => [c.kind, c.name])).toEqual([
            ['workout', 'Lower A'],
            ['conditioning', 'Bike Intervals'],
        ])
        expect(days[0].completed?.[0].durationMin).toBe(52)
        expect(days[0].completed?.[1].rpe).toBe(8)
        expect(days[0].completed?.[1].category).toBe('HIIT')
        expect(days[1].completed?.map((c) => c.kind)).toEqual(['recovery', 'mobility'])
    })

    it('keeps a day nothing was planned on but something was done on', () => {
        const payload = buildPlannerExport(
            input({
                options: withLogs,
                logs: logs({ workout: [workoutLog({ date: '2026-08-20' })] }),
            }),
            NOW
        )
        const day = payload.weeks[0].days[0]
        expect(day.date).toBe('2026-08-20')
        expect(day).not.toHaveProperty('morning')
        expect(day.completed?.[0].planned).toBe(false)
    })

    it('flags a log the plan had asked for as planned', () => {
        const payload = buildPlannerExport(
            input({
                options: withLogs,
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
                logs: logs({
                    workout: [
                        workoutLog({ date: '2026-08-19' }),
                        // Same workout, a day it was never planned for.
                        workoutLog({ date: '2026-08-21' }),
                    ],
                }),
            }),
            NOW
        )
        const byDate = new Map(payload.weeks[0].days.map((d) => [d.date, d]))
        expect(byDate.get('2026-08-19')?.completed?.[0].planned).toBe(true)
        expect(byDate.get('2026-08-21')?.completed?.[0].planned).toBe(false)
    })

    it('ignores logs outside the range', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ logs: true, emptyDays: true }),
                logs: logs({ workout: [workoutLog({ date: '2026-09-01' })] }),
            }),
            NOW
        )
        expect(payload.weeks[0].days.every((d) => !d.completed)).toBe(true)
        expect(countCompleted(payload)).toBe(0)
    })

    it('totals what was completed beside what was planned', () => {
        const payload = buildPlannerExport(
            input({
                options: withLogs,
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
                logs: logs({
                    workout: [workoutLog({ date: '2026-08-19' })],
                    recovery: [recoveryLog({ date: '2026-08-22' })],
                }),
            }),
            NOW
        )
        expect(payload.totals).toEqual({ workout: 1, conditioning: 0, mobility: 0, recovery: 0 })
        expect(payload.completed).toEqual({
            workout: 1,
            conditioning: 0,
            mobility: 0,
            recovery: 1,
        })
        expect(payload.weeks[0].completed).toEqual(payload.completed)
        expect(countEntries(payload)).toBe(1)
        expect(countCompleted(payload)).toBe(2)
    })

    it('still marks planned rows done, and keeps a log of a deleted item', () => {
        const payload = buildPlannerExport(
            input({
                options: withLogs,
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
                logs: logs({
                    workout: [
                        workoutLog({ date: '2026-08-19' }),
                        workoutLog({ date: '2026-08-20', workout: null, name: 'Old Lower' }),
                    ],
                }),
            }),
            NOW
        )
        expect(payload.weeks[0].days[0].morning?.[0].done).toBe(true)
        const orphan = payload.weeks[0].days[1].completed?.[0]
        expect(orphan).toMatchObject({ item: null, name: 'Old Lower', planned: false })
    })

    it('omits the logs entirely when the option is off', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ logs: false }),
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
                logs: logs({
                    workout: [
                        workoutLog({ date: '2026-08-19' }),
                        workoutLog({ date: '2026-08-20' }),
                    ],
                }),
            }),
            NOW
        )
        expect(payload).not.toHaveProperty('completed')
        expect(payload.weeks[0]).not.toHaveProperty('completed')
        // The unplanned day goes with them, but the planned row is still marked done.
        expect(payload.weeks[0].days.map((d) => d.date)).toEqual(['2026-08-19'])
        expect(payload.weeks[0].days[0].morning?.[0].done).toBe(true)
    })

    it('expands a log into the sets performed when details are on', () => {
        const payload = buildPlannerExport(
            input({
                options: options({ logs: true, details: true }),
                logs: logs({
                    workout: [
                        workoutLog({
                            date: '2026-08-19',
                            exercises: [
                                {
                                    name: 'Back Squat',
                                    sets: 3,
                                    reps: '8-12',
                                    loggedSets: [
                                        { weight: 80, reps: 10 },
                                        { weight: 85, reps: 8 },
                                    ],
                                },
                            ],
                        }),
                    ],
                    conditioning: [
                        conditioningLog({
                            date: '2026-08-19',
                            rounds: [{ name: 'Main set', done: 6, target: 8 }],
                        }),
                    ],
                }),
            }),
            NOW
        )
        const done = payload.weeks[0].days[0].completed ?? []
        expect(done[0].details).toEqual({
            exercises: [
                {
                    name: 'Back Squat',
                    sets: 3,
                    reps: '8-12',
                    performed: [
                        { weight: 80, reps: 10 },
                        { weight: 85, reps: 8 },
                    ],
                },
            ],
        })
        expect(done[1].details).toEqual({ rounds: [{ name: 'Main set', done: 6, target: 8 }] })
    })

    it('leaves the sets out when details are off', () => {
        const payload = buildPlannerExport(
            input({
                options: withLogs,
                logs: logs({ workout: [workoutLog({ date: '2026-08-19' })] }),
            }),
            NOW
        )
        expect(payload.weeks[0].days[0].completed?.[0]).not.toHaveProperty('details')
    })
})

describe('weekRangeFor — past and month ranges', () => {
    it('widens a whole month to the weeks holding it', () => {
        // September 2026 runs Tue 1st to Wed 30th.
        expect(weekRangeFor('2026-09-01', '2026-09-30')).toEqual({
            start: '2026-08-31',
            end: '2026-10-04',
        })
    })

    it('widens a range that runs back from a week', () => {
        // The four weeks up to and including the week of 17 Aug.
        expect(weekRangeFor('2026-07-27', '2026-08-23')).toEqual({
            start: '2026-07-27',
            end: '2026-08-23',
        })
    })
})

describe('payload envelope', () => {
    it('stamps the export and reports the widened range', () => {
        const payload = buildPlannerExport(input({ start: '2026-08-19', end: '2026-08-19' }), NOW)
        expect(payload.exportedAt).toBe('2026-08-18T09:00:00.000Z')
        expect(payload.source).toBe('AdminLife Planner')
        expect(payload.range).toEqual({ start: '2026-08-17', end: '2026-08-23' })
    })
})

describe('exportFilename', () => {
    it('names a single week by its Monday', () => {
        const payload = buildPlannerExport(
            input({
                entries: [entry({ date: '2026-08-19', kind: 'workout', workout: workout() })],
            }),
            NOW
        )
        expect(exportFilename(payload)).toBe('planner-2026-08-17.json')
    })

    it('names a longer span by both ends', () => {
        const payload = buildPlannerExport(
            input({ end: '2026-08-30', options: options({ emptyDays: true }) }),
            NOW
        )
        expect(exportFilename(payload)).toBe('planner-2026-08-17_to_2026-08-30.json')
    })
})
