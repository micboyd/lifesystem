import { describe, it, expect } from 'vitest'
import {
    buildPlannerExport,
    countEntries,
    exportFilename,
    logKey,
    weekRangeFor,
    DEFAULT_EXPORT_OPTIONS,
    type PlannerExportInput,
    type PlannerExportOptions,
} from './plannerExport'
import type {
    ConditioningSession,
    Exercise,
    FitnessFlagColor,
    FitnessNoteScope,
    FitnessPlanEntry,
    FitnessPlanKind,
    FitnessPlanNote,
    FitnessPlanPart,
    Recovery,
    Workout,
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

function input(over: Partial<PlannerExportInput> = {}): PlannerExportInput {
    return {
        start: '2026-08-17',
        end: '2026-08-23',
        entries: [],
        notes: [],
        doneKeys: new Set<string>(),
        exercisesById: new Map<string, Exercise>(),
        options: DEFAULT_EXPORT_OPTIONS,
        ...over,
    }
}

function options(over: Partial<PlannerExportOptions>): PlannerExportOptions {
    return { ...DEFAULT_EXPORT_OPTIONS, ...over }
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
                doneKeys: new Set([logKey('workout', 'w1', '2026-08-19')]),
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
                options: options({ completion: false }),
                doneKeys: new Set([logKey('workout', 'w1', '2026-08-19')]),
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
