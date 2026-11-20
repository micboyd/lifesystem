import { describe, expect, it } from 'vitest'
import { parseDistance, parseDuration, readReps, repLine, repsForExport } from './sessionReps'
import { toSessionParts } from './sessionParts'
import { buildWatchWorkout } from './watchSteps'

describe('parseDuration', () => {
    it('reads the usual ways of writing a time', () => {
        expect(parseDuration(90)).toBe(90)
        expect(parseDuration('90s')).toBe(90)
        expect(parseDuration('90 sec')).toBe(90)
        expect(parseDuration('2 min')).toBe(120)
        expect(parseDuration('2.5 mins')).toBe(150)
        expect(parseDuration('1:30')).toBe(90)
        expect(parseDuration('1 h 20 min')).toBe(4800)
        expect(parseDuration('easy')).toBeUndefined()
    })
})

describe('parseDistance', () => {
    it('reads metres, km and miles', () => {
        expect(parseDistance(400)).toBe(400)
        expect(parseDistance('400 m')).toBe(400)
        expect(parseDistance('400m')).toBe(400)
        expect(parseDistance('1.5 km')).toBe(1500)
        expect(parseDistance('1 mile')).toBe(1609)
        expect(parseDistance('far')).toBeUndefined()
    })
})

describe('readReps', () => {
    it('unrolls times and reads a rest', () => {
        const reps = readReps([
            { times: 3, do: 'Run', distance: '400 m', pace: '8:30/km', rest: { do: 'Walk', distance: '150 m' } },
        ])!
        expect(reps).toHaveLength(3)
        expect(reps[0]).toEqual({
            do: 'Run',
            metres: 400,
            pace: '8:30/km',
            rest: { do: 'Walk', metres: 150 },
        })
        expect(repLine(reps[0])).toBe('Run 400 m · 8:30/km, then walk 150 m')
    })

    it('reads a rest written as a time as standing rest', () => {
        const [rep] = readReps([{ do: 'Bike sprint', time: '30s', effort: 'All out', rest: '90s' }])!
        expect(rep.rest).toEqual({ do: 'Rest', seconds: 90 })
    })

    it('takes bare strings as drills', () => {
        expect(readReps(['Leg swings ×10', ''])).toEqual([{ do: 'Leg swings ×10' }])
    })

    it('folds back into times on export', () => {
        const reps = readReps([{ times: 2, do: 'Run', time: '90s', rest: { do: 'Walk', time: '2 min' } }])!
        expect(repsForExport(reps)).toEqual([
            { times: 2, do: 'Run', time: '90 s', rest: { do: 'Walk', time: '2 min' } },
        ])
    })
})

describe('toSessionParts with reps', () => {
    it('works the counter out from the reps', () => {
        const [part] = toSessionParts([
            {
                name: 'Intervals',
                startMin: 5,
                endMin: 26,
                reps: [{ times: 6, do: 'Jog', time: '90s', speed: '7.0 km/h', rest: { do: 'Walk', time: '2 min' } }],
            },
        ])
        expect(part.rounds).toBe(6)
        expect(part.roundLabel).toBe('jog')
        expect(part.roundSeconds).toEqual([210, 210, 210, 210, 210, 210])
        expect(part.roundDetails?.[0]).toBe('Jog 90 s · 7.0 km/h, then walk 2 min')
    })

    it('turns the older rounds + roundDetails into reps', () => {
        const [part] = toSessionParts([
            { name: 'Run-walk', rounds: 2, roundDetails: ['400 m run', '400 m run'], roundSeconds: [200, 200] },
        ])
        expect(part.reps).toEqual([{ do: '400 m run' }, { do: '400 m run' }])
        expect(part.roundSeconds).toEqual([200, 200])
    })

    it('turns a steps list into reps on the counter', () => {
        const [part] = toSessionParts([{ name: 'Calf raises', steps: ['Set 1 - 15', 'Set 2 - 15'] }])
        expect(part.reps).toEqual([{ do: 'Set 1 - 15' }, { do: 'Set 2 - 15' }])
        expect(part.rounds).toBe(2)
        expect(part.steps).toBeUndefined()
    })
})

describe('watch steps from reps', () => {
    it('folds identical reps into a repeat with a pace alert', () => {
        const main = toSessionParts([
            {
                name: 'Intervals',
                reps: [{ times: 5, do: 'Run', distance: '400 m', pace: '8:30/km', rest: { do: 'Walk', distance: '150 m' } }],
            },
        ])
        const { steps, approximated } = buildWatchWorkout({ warmUp: [], main, coolDown: [] })
        expect(approximated).toEqual([])
        expect(steps).toHaveLength(1)
        const repeat = steps[0]
        expect(repeat.type).toBe('repeat')
        if (repeat.type !== 'repeat') return
        expect(repeat.times).toBe(5)
        expect(repeat.steps[0]).toMatchObject({
            type: 'run',
            end: { kind: 'distance', metres: 400 },
            paceTarget: { fastestSecPerKm: 480, slowestSecPerKm: 540 },
        })
        expect(repeat.steps[1]).toMatchObject({ type: 'walk', end: { kind: 'distance', metres: 150 } })
    })
})
