import { describe, expect, it } from 'vitest'
import plan from './__fixtures__/prop-nov-may-outdoor.json'
import { buildWatchWorkout, readWatchSteps, watchStepsHash, type WatchStep } from './watchSteps'
import type { ISessionPart } from '../models/ConditioningSession'
import { toGarminWorkout } from '../garmin/connectWorkout'

type Session = { name: string; warmUp: ISessionPart[]; main: ISessionPart[]; coolDown: ISessionPart[] }
const sessions = plan.conditioning.post10KSessionLibrary as unknown as Session[]
const byName = (name: string) => {
    const s = sessions.find((x) => x.name === name)
    if (!s) throw new Error(`No session "${name}" in the fixture`)
    return s
}

/** Every leaf step, repeats expanded once. */
function leaves(steps: WatchStep[]): Exclude<WatchStep, { type: 'repeat' }>[] {
    return steps.flatMap((s) => (s.type === 'repeat' ? leaves(s.steps) : [s]))
}

describe('buildWatchWorkout', () => {
    it('Outdoor Run-Walk 1 - 5 x 400 m', () => {
        const w = buildWatchWorkout(byName('Outdoor Run-Walk 1 - 5 x 400 m'))
        expect(w.source).toBe('derived')
        expect(w.approximated).toEqual([])
        expect(w.steps).toEqual([
            { type: 'warmup', label: 'Walk 250 m easy', end: { kind: 'distance', metres: 250 } },
            { type: 'warmup', label: 'Walk 200 m brisk', end: { kind: 'distance', metres: 200 } },
            {
                type: 'repeat',
                times: 5,
                steps: [
                    {
                        type: 'run',
                        label: 'Run 400 m',
                        end: { kind: 'distance', metres: 400 },
                        paceTarget: { fastestSecPerKm: 480, slowestSecPerKm: 540 },
                    },
                    { type: 'walk', label: 'Walk 150 m', end: { kind: 'distance', metres: 150 } },
                ],
            },
            { type: 'cooldown', label: 'Walk 400 m easy', end: { kind: 'distance', metres: 400 } },
            { type: 'cooldown', label: 'Calf raises', end: { kind: 'lapButton' } },
        ])
    })

    it('Outdoor 5K - 8:30 per km: distance steps at the stated pace ±15 s', () => {
        const w = buildWatchWorkout(byName('Outdoor 5K - 8:30 per km'))
        expect(w.approximated).toEqual([])
        const main = w.steps[2]
        expect(main).toEqual({
            type: 'repeat',
            times: 5,
            steps: [
                {
                    type: 'run',
                    label: 'Run 1 km',
                    end: { kind: 'distance', metres: 1000 },
                    paceTarget: { fastestSecPerKm: 495, slowestSecPerKm: 525 },
                },
            ],
        })
        // Walks, warm-up and cool-down carry no pace alert.
        for (const s of leaves(w.steps)) if (s.type !== 'run') expect(s.paceTarget).toBeUndefined()
        expect(leaves(w.steps).filter((s) => s.end.kind === 'distance')).toHaveLength(4)
    })

    it('Outdoor Field 6: labelled blocks, timed reps repeat, Bronco on the lap button', () => {
        const w = buildWatchWorkout(byName('Outdoor Field 6'))
        expect(w.steps).toEqual([
            { type: 'warmup', label: 'Field warm-up', end: { kind: 'time', seconds: 720 } },
            {
                type: 'repeat',
                times: 4,
                steps: [{ type: 'run', label: 'Accelerations - rep', end: { kind: 'time', seconds: 75 } }],
            },
            { type: 'run', label: 'Bronco', end: { kind: 'lapButton' } },
            {
                type: 'repeat',
                times: 4,
                steps: [{ type: 'run', label: 'Strides - rep', end: { kind: 'time', seconds: 75 } }],
            },
            { type: 'cooldown', label: 'Walk and stretch', end: { kind: 'time', seconds: 300 } },
        ])
        expect(w.approximated).toEqual(['Field warm-up', 'Walk and stretch'])
    })

    it('Club Training: warm-up, main, cool-down as timed steps, no pace alerts', () => {
        const w = buildWatchWorkout(byName('Club Training'))
        expect(w.steps).toEqual([
            { type: 'warmup', label: 'Team warm-up', end: { kind: 'time', seconds: 900 } },
            { type: 'other', label: 'Club session', end: { kind: 'time', seconds: 3900 } },
            { type: 'cooldown', label: 'Cool-down', end: { kind: 'time', seconds: 600 } },
        ])
        expect(w.approximated).toEqual(['Team warm-up', 'Club session', 'Cool-down'])
    })

    it('League Match: halves of different lengths become one timed step each', () => {
        const w = buildWatchWorkout(byName('League Match'))
        expect(w.steps).toEqual([
            { type: 'warmup', label: 'Team warm-up', end: { kind: 'time', seconds: 1800 } },
            { type: 'other', label: 'Match - half 1', end: { kind: 'time', seconds: 3000 } },
            { type: 'other', label: 'Match - half 2', end: { kind: 'time', seconds: 2400 } },
            { type: 'cooldown', label: 'Cool-down', end: { kind: 'time', seconds: 900 } },
        ])
        for (const s of leaves(w.steps)) expect(s.paceTarget).toBeUndefined()
    })

    it('uses a session’s own watchSteps when it has them', () => {
        const watchSteps: WatchStep[] = [{ type: 'run', label: 'Go', end: { kind: 'lapButton' } }]
        const w = buildWatchWorkout({ ...byName('Club Training'), watchSteps })
        expect(w).toEqual({ steps: watchSteps, approximated: [], source: 'watchSteps' })
    })

    it('never blocks: a session with no parts still gets a step', () => {
        const w = buildWatchWorkout({ warmUp: [], main: [], coolDown: [] })
        expect(w.steps).toEqual([{ type: 'other', label: 'Session', end: { kind: 'lapButton' } }])
        expect(w.approximated).toEqual(['Session'])
    })

    it('every Run-Walk level puts 8:00-9:00/km on its run steps only', () => {
        for (const s of sessions.filter((x) => x.name.startsWith('Outdoor Run-Walk'))) {
            const runs = leaves(buildWatchWorkout(s).steps).filter((x) => x.type === 'run')
            expect(runs.length).toBeGreaterThan(0)
            for (const r of runs) expect(r.paceTarget).toEqual({ fastestSecPerKm: 480, slowestSecPerKm: 540 })
        }
    })
})

describe('prop-nov-may-outdoor.json', () => {
    it('has the 112 conditioning calendar entries', () => {
        expect(plan.conditioning.post10KCalendar).toHaveLength(112)
    })

    it('every calendar entry generates a valid Garmin workout', () => {
        const names = new Set(sessions.map((s) => s.name))
        for (const row of plan.conditioning.post10KCalendar) {
            expect(names.has(row.session), row.session).toBe(true)
            const s = byName(row.session)
            const w = buildWatchWorkout(s)
            expect(w.steps.length).toBeGreaterThan(0)
            // Every step it built round-trips through the importer's validator.
            expect(readWatchSteps({ watchSteps: w.steps }, s.name).errors).toEqual([])
            const g = toGarminWorkout(s.name, w.steps, 60)
            expect(g.sportType.sportTypeKey).toBe('running')
            const flat = (xs: Record<string, unknown>[]): Record<string, unknown>[] =>
                xs.flatMap((x) => (x.type === 'RepeatGroupDTO' ? [x, ...flat(x.workoutSteps as never)] : [x]))
            const all = flat(g.workoutSegments[0].workoutSteps as never)
            expect(all.map((x) => x.stepOrder)).toEqual(all.map((_, i) => i + 1))
            for (const x of all) {
                if (x.type === 'RepeatGroupDTO') expect(x.numberOfIterations).toBeGreaterThan(0)
                else expect(['lap.button', 'time', 'distance']).toContain((x.endCondition as { conditionTypeKey: string }).conditionTypeKey)
            }
        }
    })
})

describe('readWatchSteps', () => {
    it('accepts a missing list', () => {
        expect(readWatchSteps({}, 'S')).toEqual({ value: {}, errors: [] })
    })

    it('rejects malformed steps with the place named', () => {
        const { errors } = readWatchSteps(
            {
                watchSteps: [
                    { type: 'jog', label: 'x', end: { kind: 'time', seconds: 60 } },
                    { type: 'run', label: 'y', end: { kind: 'distance' } },
                    { type: 'repeat', times: 0, steps: [] },
                    { type: 'run', label: 'z', end: { kind: 'lapButton' }, paceTarget: { fastestSecPerKm: 600, slowestSecPerKm: 500 } },
                ],
            },
            'Session "S"'
        )
        expect(errors).toHaveLength(5)
        expect(errors[0]).toContain('watchSteps[0]')
    })
})

describe('watchStepsHash', () => {
    it('changes with the steps or the name, not otherwise', () => {
        const steps = buildWatchWorkout(byName('Club Training')).steps
        expect(watchStepsHash('A', steps)).toBe(watchStepsHash('A', structuredClone(steps)))
        expect(watchStepsHash('A', steps)).not.toBe(watchStepsHash('B', steps))
        expect(watchStepsHash('A', steps)).not.toBe(watchStepsHash('A', steps.slice(1)))
    })
})
