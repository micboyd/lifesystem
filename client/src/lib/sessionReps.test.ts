import { describe, expect, it } from 'vitest'
import { effortFacts, formatSeconds, partReps, repGroups, repsDistance, repsForExport } from './sessionReps'

const jog = { do: 'Jog', seconds: 90, speed: '7.0 km/h', rest: { do: 'Walk', seconds: 120 } }

describe('partReps', () => {
    it('uses written reps first', () => {
        expect(partReps({ name: 'x', reps: [jog], rounds: 1 })).toEqual([jog])
    })
    it('carries over rounds + roundDetails and steps', () => {
        expect(partReps({ name: 'x', rounds: 2, roundDetails: ['A'] })).toEqual([{ do: 'A' }, { do: 'Rep 2' }])
        expect(partReps({ name: 'x', steps: ['Leg swings'] })).toEqual([{ do: 'Leg swings' }])
        expect(partReps({ name: 'x', detail: 'Walk 5 min' })).toEqual([])
    })
})

describe('repGroups', () => {
    it('folds identical neighbours only', () => {
        const groups = repGroups([jog, jog, { do: 'Walk' }, jog])
        expect(groups.map((g) => [g.times, g.from])).toEqual([
            [2, 0],
            [1, 2],
            [1, 3],
        ])
    })
})

describe('facts', () => {
    it('reads how many, how far, how long, how hard', () => {
        expect(
            effortFacts({ do: 'Run', metres: 400, seconds: 150, pace: '8:30/km', incline: '1%', effort: 'Easy', count: 2 }).map(
                (f) => f.text
            )
        ).toEqual(['×2', '400 m', '2:30', '8:30/km', '1% incline', 'Easy'])
        expect(formatSeconds(90)).toBe('90 s')
        expect(formatSeconds(120)).toBe('2 min')
        expect(repsDistance([{ do: 'Run', metres: 400, rest: { do: 'Walk', metres: 150 } }])).toBe(550)
    })
    it('exports in the import format', () => {
        expect(repsForExport([jog, jog])).toEqual([
            { times: 2, do: 'Jog', time: '90 s', speed: '7.0 km/h', rest: { do: 'Walk', time: '2 min' } },
        ])
    })
})
