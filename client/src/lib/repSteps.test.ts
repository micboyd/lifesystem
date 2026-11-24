import { describe, expect, it } from 'vitest'
import { mark, phraseOf, sectionLines, sectionSteps, stepDuration } from './repSteps'
import type { SessionPart } from '../types'

describe('stepDuration / mark', () => {
    it('reads lengths and clock marks', () => {
        expect(stepDuration(180)).toBe('3 min')
        expect(stepDuration(90)).toBe('1:30')
        expect(stepDuration(45)).toBe('45 s')
        expect(mark(690)).toBe('11:30')
        expect(mark(3930)).toBe('65:30')
    })
})

describe('phraseOf', () => {
    it('leads with time, then distance, then count', () => {
        expect(phraseOf({ do: 'Run', seconds: 120, speed: '10 km/h' })).toEqual({
            phrase: 'Run for 2 min',
            facts: [{ kind: 'speed', text: '10 km/h' }],
        })
        expect(phraseOf({ do: 'Run', metres: 400 }).phrase).toBe('Run 400 m')
        expect(phraseOf({ do: 'Calf raises', count: 10 }).phrase).toBe('Calf raises ×10')
        expect(phraseOf({ do: 'Stretch' }).phrase).toBe('Stretch')
    })
})

describe('sectionSteps', () => {
    it('times each step from the section start', () => {
        const part: SessionPart = {
            name: 'Intervals',
            startMin: 5,
            endMin: 14,
            reps: [
                { do: 'Run', seconds: 180, rest: { do: 'Walk', seconds: 90 } },
                { do: 'Run', seconds: 180, rest: { do: 'Walk', seconds: 90 } },
            ],
        }
        const steps = sectionSteps(part)
        expect(steps.map((r) => r.steps.map((s) => [s.phrase, s.at, s.rest]))).toEqual([
            [
                ['Run for 3 min', 300, false],
                ['Walk for 1:30', 480, true],
            ],
            [
                ['Run for 3 min', 570, false],
                ['Walk for 1:30', 750, true],
            ],
        ])
    })

    it('stops the times after an untimed step', () => {
        const steps = sectionSteps({
            name: 'Hills',
            startMin: 0,
            endMin: 10,
            reps: [
                { do: 'Run up', metres: 200, rest: { do: 'Walk down' } },
                { do: 'Run up', metres: 200 },
            ],
        })
        expect(steps[0].steps[0].at).toBe(0)
        expect(steps[0].steps[1].at).toBeUndefined()
        expect(steps[1].steps[0].at).toBeUndefined()
    })

    it('makes one step of a section without reps, from its slot', () => {
        const [only] = sectionSteps({
            name: 'Easy jog',
            startMin: 30,
            endMin: 40,
            detail: 'Nose breathing',
        })
        expect(only.steps).toEqual([
            {
                phrase: 'Easy jog for 10 min',
                at: 1800,
                facts: [],
                rest: false,
                note: 'Nose breathing',
            },
        ])
    })
})

describe('sectionLines', () => {
    it('folds identical reps and keeps each to the main numbers', () => {
        const run = {
            do: 'Run',
            seconds: 240,
            speed: '7.2 km/h',
            incline: '1%',
            rest: { do: 'Walk', seconds: 90, speed: '5.0 km/h' },
        }
        expect(
            sectionLines({
                name: 'Intervals',
                reps: [run, run, run, { do: 'Run', seconds: 240, speed: '7.2 km/h' }],
            })
        ).toEqual(['3× Run 4 min (7.2 km/h) · Walk 1:30 (5.0 km/h)', 'Run 4 min (7.2 km/h)'])
        expect(sectionLines({ name: 'Drills', reps: [{ do: 'Skips', metres: 20 }] })).toEqual([
            'Skips 20 m',
        ])
    })
})
