import { describe, expect, it } from 'vitest'
import {
    freshSeeds,
    historyToPrune,
    matchesStart,
    pickRoute,
    rankValid,
    scaledLength,
    toleranceM,
    withinTolerance,
    type Candidate,
} from './routeSelect'

const cand = (key: string, distanceM: number, ascentM = 10, repeatedShare = 0, cells = [key]): Candidate => ({
    key,
    seed: 1,
    distanceM,
    ascentM,
    repeatedShare,
    cells,
})

describe('tolerance', () => {
    it('is 250 m for short routes and 5% for long ones', () => {
        expect(toleranceM(3600)).toBe(250)
        expect(toleranceM(5000)).toBe(250)
        expect(toleranceM(10_000)).toBe(500)
    })
    it('accepts the edge and rejects just past it', () => {
        expect(withinTolerance(3850, 3600)).toBe(true)
        expect(withinTolerance(3851, 3600)).toBe(false)
        expect(withinTolerance(3350, 3600)).toBe(true)
        expect(withinTolerance(10_501, 10_000)).toBe(false)
    })
})

describe('pickRoute', () => {
    it('prefers the lowest climb among valid routes', () => {
        const pick = pickRoute([cand('a', 3600, 40), cand('b', 3700, 12), cand('c', 3500, 30)], 3600, [], [])
        expect(pick).toMatchObject({ kind: 'valid', route: { key: 'b' } })
    })
    it('breaks a climb tie on the least doubling back', () => {
        const ranked = rankValid([cand('a', 3600, 20, 0.3), cand('b', 3600, 21, 0.05)], 3600)
        expect(ranked[0].key).toBe('b')
    })
    it('never picks an out-of-tolerance route when a valid one exists', () => {
        const pick = pickRoute([cand('far', 3601, 0), cand('ok', 3840, 80)], 3600, [], [])
        expect(pick.kind).toBe('valid')
        const far = pickRoute([cand('x', 4200, 0), cand('ok', 3840, 80)], 3600, [], [])
        expect(far).toMatchObject({ route: { key: 'ok' } })
    })
    it('falls back to the closest route with its exact difference', () => {
        const pick = pickRoute([cand('a', 4400), cand('b', 3100), cand('c', 4000)], 3600, [], [])
        expect(pick).toEqual({ kind: 'closest', route: expect.objectContaining({ key: 'c' }), diffM: 400 })
    })
    it('reports a short fallback as a negative difference', () => {
        const pick = pickRoute([cand('a', 3000)], 3600, [], [])
        expect(pick).toMatchObject({ kind: 'closest', diffM: -600 })
    })
    it('skips routes already seen and reported', () => {
        const seen = [['a']]
        const bad = [['b']]
        const pick = pickRoute([cand('a', 3600), cand('b', 3600), cand('c', 3900)], 3600, seen, bad)
        expect(pick).toMatchObject({ kind: 'closest', route: { key: 'c' } })
    })
    it('returns none when every route was already seen', () => {
        expect(pickRoute([cand('a', 3600)], 3600, [['a']], [])).toEqual({ kind: 'none' })
    })
})

describe('freshSeeds', () => {
    it('never repeats a used key, within or across presses', () => {
        const used = new Set<string>()
        for (let press = 0; press < 30; press++) {
            const seeds = freshSeeds('loop', used, 5)
            expect(seeds).toHaveLength(5)
            for (const s of seeds) {
                expect(used.has(s.key)).toBe(false)
                used.add(s.key)
            }
        }
        expect(used.size).toBe(150)
    })
    it('skips a key it has already been given', () => {
        let i = 0
        // First draw collides with a used key, then fresh values follow.
        const vals = [0, 0, 0, 0, 0.5, 0.5]
        const seeds = freshSeeds('loop', new Set(['loop:0:3']), 1, () => vals[i++])
        expect(seeds[0].key).toBe('loop:50000:4')
    })
})

describe('scaledLength', () => {
    it('shrinks the request when every result ran long', () => {
        expect(scaledLength(3600, 3600, [4400, 4500, 4320])).toBe(2945)
    })
    it('stretches it when every result ran short', () => {
        expect(scaledLength(3600, 3600, [2800, 3000, 2900])).toBeGreaterThan(4300)
    })
    it('leaves mixed results alone', () => {
        expect(scaledLength(3600, 3600, [3000, 4400])).toBe(3600)
    })
})

describe('historyToPrune', () => {
    const at = (n: number) => new Date(2026, 10, n)
    it('keeps the chosen route however old it is', () => {
        const routes = [
            { id: 'chosen', chosen: true, createdAt: at(1) },
            { id: 'r2', chosen: false, createdAt: at(2) },
            { id: 'r3', chosen: false, createdAt: at(3) },
            { id: 'r4', chosen: false, createdAt: at(4) },
        ]
        expect(historyToPrune(routes, 2)).toEqual(['r2'])
    })
})

describe('start preference', () => {
    const withOpening = (key: string, openingM: number, ascentM = 10): Candidate => ({ ...cand(key, 3600, ascentM), openingM })
    it('ranks a route that starts the way asked above a flatter one that does not', () => {
        const flatDown = withOpening('a', -8, 5)
        const hillyUp = withOpening('b', 12, 40)
        expect(rankValid([flatDown, hillyUp], 3600, 'uphill')[0].key).toBe('b')
        expect(rankValid([flatDown, hillyUp], 3600, 'downhill')[0].key).toBe('a')
        expect(rankValid([flatDown, hillyUp], 3600)[0].key).toBe('a')
    })
    it('treats a couple of metres as flat', () => {
        expect(matchesStart(2, 'uphill')).toBe(false)
        expect(matchesStart(3, 'uphill')).toBe(true)
        expect(matchesStart(-3, 'downhill')).toBe(true)
        expect(matchesStart(undefined, 'any')).toBe(true)
    })
})

