import { describe, expect, it } from 'vitest'
import { partSteps, plannedSeconds, sessionDistance, stepStarts, watchRouteSteps } from './routeDistance'
import type { SessionPart } from '../types'

const walkWarmUp: SessionPart = { name: 'Walk', detail: 'Walk 250 m easy, then 200 m brisk.', startMin: 0, endMin: 5 }
const coolWalk: SessionPart = { name: 'Walk', detail: '400 m easy walk.', startMin: 30.5, endMin: 35.5 }
const calves: SessionPart = {
    name: 'Calf raises',
    detail: 'On a step, bodyweight. 1 sec pause at the top, 3 sec down. Bodyweight until 3x20 is easy, then hold a dumbbell.',
}

const runWalk1 = {
    name: 'Outdoor Run-Walk 1 - 5 x 400 m',
    warmUp: [walkWarmUp],
    main: [{ name: 'Run-walk intervals', detail: '5 x 400 m run at 8:30/km, then 150 m walk.', rounds: 5, startMin: 5, endMin: 30.5 }],
    coolDown: [coolWalk, calves],
}

const fiveK = {
    name: 'Outdoor 5K - 8:30 per km',
    warmUp: [walkWarmUp],
    main: [{ name: '5K continuous', detail: '5 km continuous at 8:30/km. Tap each km.', rounds: 5 }],
    coolDown: [{ ...coolWalk }, calves],
}

describe('sessionDistance', () => {
    it('Outdoor Run-Walk 1 is 3,600 m with warm-up, walks and cool-down', () => {
        const d = sessionDistance(runWalk1)
        expect(d.totalM).toBe(3600)
        expect(d.source).toBe('detail')
    })

    it('Outdoor 5K is 5,850 m', () => {
        expect(sessionDistance(fiveK).totalM).toBe(5850)
    })

    it('reads run paces and works walking pace out from the slot', () => {
        const d = sessionDistance(runWalk1)
        const run = d.steps.find((s) => s.kind === 'run')!
        expect(run.paceSecPerKm).toBe(510)
        // Main: 25.5 min less 5 × 400 m at 8:30 = 8.5 min over 750 m of walking.
        const mainWalk = d.steps.find((s) => s.label === 'Walk 1')!
        expect(mainWalk.paceSecPerKm).toBe(680)
        expect(Math.round(plannedSeconds(d.steps) / 60)).toBe(36)
    })

    it.each(['Club Training', 'League Match', 'Outdoor Field 1'])('asks for a distance on %s', (name) => {
        expect(sessionDistance({ ...runWalk1, name }).totalM).toBeNull()
    })

    it('asks for a distance when the drill wording is a pitch session', () => {
        const drills = {
            name: 'Speed work',
            warmUp: [],
            main: [{ name: 'Strides', detail: '6 x 50 m at 60%. Walk back - 80 sec per rep.' }],
            coolDown: [],
        }
        expect(sessionDistance(drills).totalM).toBeNull()
    })

    it('asks when the main block has no distance at all', () => {
        expect(sessionDistance({ name: 'Bike', warmUp: [walkWarmUp], main: [{ name: 'Ride', detail: '30 min easy' }], coolDown: [] }).totalM).toBeNull()
    })

    it('uses watchSteps first when every step is a distance', () => {
        const watchSteps = [
            { type: 'warmup', label: 'Walk', end: { kind: 'distance', metres: 500 } },
            {
                type: 'repeat',
                times: 3,
                steps: [
                    { type: 'run', label: 'Run', end: { kind: 'distance', metres: 1000 }, paceTarget: { fastestSecPerKm: 400, slowestSecPerKm: 420 } },
                    { type: 'walk', label: 'Walk', end: { kind: 'distance', metres: 200 } },
                ],
            },
            { type: 'cooldown', label: 'Walk', end: { kind: 'distance', metres: 300 } },
        ]
        const d = sessionDistance({ ...runWalk1, watchSteps })
        expect(d).toMatchObject({ totalM: 4400, source: 'watchSteps' })
        expect(d.steps[1]).toMatchObject({ kind: 'run', paceSecPerKm: 410 })
    })

    it('falls back to the text when a watch step ends on time or the lap button', () => {
        const watchSteps = [{ type: 'warmup', label: 'Walk', end: { kind: 'time', seconds: 300 } }]
        expect(watchRouteSteps(watchSteps)).toBeNull()
        expect(sessionDistance({ ...runWalk1, watchSteps })).toMatchObject({ totalM: 3600, source: 'detail' })
    })
})

describe('partSteps', () => {
    it('reads km and decimals', () => {
        expect(partSteps({ name: 'Run', detail: '2.5 km easy run at 7:00/km' })).toEqual([
            { kind: 'run', distanceM: 2500, paceSecPerKm: 420, label: 'Run' },
        ])
    })
    it('ignores parts with no distance', () => {
        expect(partSteps(calves)).toEqual([])
    })
})

describe('stepStarts', () => {
    it('marks each change between running and walking', () => {
        const starts = stepStarts(sessionDistance(runWalk1).steps)
        expect(starts.slice(0, 4).map((s) => [s.kind, s.atM])).toEqual([
            ['walk', 0],
            ['run', 450],
            ['walk', 850],
            ['run', 1000],
        ])
        expect(starts.filter((s) => s.kind === 'run')).toHaveLength(5)
    })
})
