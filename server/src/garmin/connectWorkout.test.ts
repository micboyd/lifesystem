import { describe, expect, it } from 'vitest'
import { GARMIN_NAME_MAX, paceTargetValues, secPerKmToMps, toGarminWorkout, workoutName } from './connectWorkout'

describe('pace conversion', () => {
    it('seconds per km → metres per second', () => {
        expect(secPerKmToMps(500)).toBe(2)
        expect(secPerKmToMps(480)).toBeCloseTo(2.083333, 6)
        expect(secPerKmToMps(540)).toBeCloseTo(1.851852, 6)
    })

    it('puts the slower pace in targetValueOne (Garmin stores speed)', () => {
        expect(paceTargetValues({ fastestSecPerKm: 480, slowestSecPerKm: 540 })).toEqual({
            targetValueOne: 1.851852,
            targetValueTwo: 2.083333,
        })
    })
})

describe('toGarminWorkout', () => {
    const w = toGarminWorkout(
        'Run-walk',
        [
            { type: 'warmup', label: 'Walk 250 m easy', end: { kind: 'distance', metres: 250 } },
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
                    {
                        type: 'walk',
                        label: 'Walk 150 m',
                        end: { kind: 'distance', metres: 150 },
                        // Ignored: only run steps carry a pace alert.
                        paceTarget: { fastestSecPerKm: 480, slowestSecPerKm: 540 },
                    },
                ],
            },
            { type: 'cooldown', label: 'Calf raises', end: { kind: 'lapButton' } },
        ],
        2310
    )
    // Garmin's JSON, read loosely in the assertions below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const steps = w.workoutSegments[0].workoutSteps as Record<string, any>[]

    it('is a running workout', () => {
        expect(w.sportType.sportTypeKey).toBe('running')
        expect(w.workoutSegments[0].sportType.sportTypeKey).toBe('running')
        expect(w.estimatedDurationInSecs).toBe(2310)
    })

    it('writes distance, repeat and lap-button steps in Garmin’s shape', () => {
        expect(steps[0]).toMatchObject({
            type: 'ExecutableStepDTO',
            stepOrder: 1,
            stepType: { stepTypeKey: 'warmup' },
            endCondition: { conditionTypeKey: 'distance' },
            endConditionValue: 250,
            targetType: { workoutTargetTypeKey: 'no.target' },
            description: 'Walk 250 m easy',
        })
        expect(steps[1]).toMatchObject({
            type: 'RepeatGroupDTO',
            stepOrder: 2,
            numberOfIterations: 5,
            childStepId: 1,
            endCondition: { conditionTypeKey: 'iterations' },
        })
        const [run, walk] = steps[1].workoutSteps
        expect(run).toMatchObject({
            stepOrder: 3,
            childStepId: 1,
            stepType: { stepTypeKey: 'interval' },
            targetType: { workoutTargetTypeKey: 'pace.zone' },
            targetValueOne: 1.851852,
            targetValueTwo: 2.083333,
        })
        expect(walk).toMatchObject({ stepOrder: 4, stepType: { stepTypeKey: 'recovery' }, targetType: { workoutTargetTypeKey: 'no.target' } })
        expect(walk.targetValueOne).toBeUndefined()
        expect(steps[2]).toMatchObject({ stepOrder: 5, endCondition: { conditionTypeKey: 'lap.button' } })
        expect(steps[2].endConditionValue).toBeUndefined()
    })

    it('truncates long names to Garmin’s limit', () => {
        expect(workoutName('x'.repeat(200))).toHaveLength(GARMIN_NAME_MAX)
        expect(workoutName('  Outdoor Field 6 ')).toBe('Outdoor Field 6')
    })
})
