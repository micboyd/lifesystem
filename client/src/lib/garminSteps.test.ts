import { describe, expect, it } from 'vitest'
import { countSteps, formatMetres, formatSeconds, stepEnd, stepPace } from './garminSteps'

describe('garminSteps', () => {
    it('formats distances, times and paces', () => {
        expect(formatMetres(400)).toBe('400 m')
        expect(formatMetres(5000)).toBe('5 km')
        expect(formatMetres(1250)).toBe('1250 m')
        expect(formatSeconds(45)).toBe('45 s')
        expect(formatSeconds(75)).toBe('1:15')
        expect(formatSeconds(720)).toBe('12 min')
    })

    it('describes a step’s end and pace', () => {
        const run = {
            type: 'run' as const,
            label: 'Run 400 m',
            end: { kind: 'distance' as const, metres: 400 },
            paceTarget: { fastestSecPerKm: 480, slowestSecPerKm: 540 },
        }
        expect(stepEnd(run)).toBe('400 m')
        expect(stepPace(run)).toBe('8:00–9:00 /km')
        expect(stepEnd({ type: 'other', label: 'Calf raises', end: { kind: 'lapButton' } })).toBe('Lap button')
        expect(stepPace({ type: 'walk', label: 'Walk', end: { kind: 'time', seconds: 60 } })).toBeNull()
    })

    it('counts steps through repeats', () => {
        expect(
            countSteps([
                { type: 'warmup', label: 'a', end: { kind: 'lapButton' } },
                {
                    type: 'repeat',
                    times: 5,
                    steps: [
                        { type: 'run', label: 'r', end: { kind: 'lapButton' } },
                        { type: 'walk', label: 'w', end: { kind: 'lapButton' } },
                    ],
                },
            ])
        ).toBe(11)
    })
})
