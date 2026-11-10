import { describe, expect, it } from 'vitest'
import {
    convertGoal,
    daysForRepeat,
    doubledBackShare,
    repeatModeOf,
    sameRoute,
    estimateWalk,
    finishTime,
    formatMinutes,
    libraryTitle,
    SLOT_TIMES,
    nextWalk,
    targetMetres,
    walkDayItems,
    walkDayTotals,
    walkEstimate,
    walkGap,
    walkPart,
    walkTitle,
    type WalkLike,
} from './walking'

const walk = (over: Partial<WalkLike> = {}): WalkLike => ({
    _id: 'a',
    date: '2026-11-09',
    time: '14:30',
    name: '',
    pace: 'steady',
    goal: { kind: 'time', value: 60 },
    route: null,
    doneAt: null,
    ...over,
})

describe('targetMetres', () => {
    it('turns time into distance at the pace', () => {
        expect(targetMetres({ kind: 'time', value: 60 }, 'steady', null)).toBe(5000)
        expect(targetMetres({ kind: 'time', value: 30 }, 'brisk', null)).toBe(3000)
    })
    it('turns steps into distance by stride', () => {
        expect(targetMetres({ kind: 'steps', value: 1300 }, 'steady', null)).toBe(1000)
    })
    it('takes km as given', () => expect(targetMetres({ kind: 'distance', value: 3.5 }, 'relaxed', null)).toBe(3500))
    it('turns calories into distance using bodyweight', () => {
        // 3.6 MET × 100 kg = 360 kcal an hour = 5 km
        expect(targetMetres({ kind: 'calories', value: 360 }, 'steady', 100)).toBe(5000)
    })
    it('cannot do calories without a weight', () => {
        expect(targetMetres({ kind: 'calories', value: 360 }, 'steady', null)).toBeNull()
    })
    it('refuses nothing', () => expect(targetMetres({ kind: 'time', value: 0 }, 'steady', null)).toBeNull())
})

describe('estimateWalk', () => {
    it('gives every figure from the distance', () => {
        expect(estimateWalk(5000, 'steady', 100)).toEqual({ distanceM: 5000, minutes: 60, steps: 6500, kcal: 360 })
    })
    it('leaves calories unknown with no weight', () => expect(estimateWalk(5000, 'steady', null).kcal).toBeNull())
    it('round-trips a target', () => {
        const m = targetMetres({ kind: 'steps', value: 8000 }, 'brisk', 90)!
        expect(estimateWalk(m, 'brisk', 90).steps).toBeCloseTo(8000, -1)
    })
})

describe('convertGoal', () => {
    it('re-expresses a distance in another unit, rounded', () => {
        expect(convertGoal(5000, 'steps', 'steady', null)).toBe(6500)
        expect(convertGoal(3333, 'time', 'steady', null)).toBe(40)
        expect(convertGoal(3333, 'distance', 'steady', null)).toBe(3.3)
    })
    it('falls back when it has nothing to go on', () => {
        expect(convertGoal(null, 'steps', 'steady', null)).toBe(6000)
        expect(convertGoal(5000, 'calories', 'steady', null)).toBe(250)
    })
})

describe('walkGap', () => {
    const steps = { kind: 'steps' as const, value: 8000 }
    it('calls within 5% on target', () => {
        expect(walkGap(steps, estimateWalk(6000, 'steady', null))).toEqual({ onTarget: true, text: 'On target for 8,000 steps' })
    })
    it('says how far short, in the target’s unit', () => {
        expect(walkGap(steps, estimateWalk(4769, 'steady', null))?.text).toBe('1,800 steps short of 8,000 steps')
    })
    it('says how far over', () => {
        expect(walkGap({ kind: 'distance', value: 3 }, estimateWalk(4000, 'steady', null))?.text).toBe('1.0 km over 3.0 km')
    })
    it('has nothing to say about calories with no weight', () => {
        expect(walkGap({ kind: 'calories', value: 200 }, estimateWalk(4000, 'steady', null))).toBeNull()
    })
})

describe('times', () => {
    it('adds on the walk', () => expect(finishTime('14:30', 45)).toBe('15:15'))
    it('wraps past midnight', () => expect(finishTime('23:30', 45)).toBe('00:15'))
    it('formats long walks', () => {
        expect(formatMinutes(45)).toBe('45 min')
        expect(formatMinutes(65)).toBe('1 h 05 min')
    })
    it('places a walk in the day', () => {
        expect(walkPart('07:00')).toBe('morning')
        expect(walkPart('12:00')).toBe('afternoon')
        expect(walkPart('17:00')).toBe('evening')
    })
})

describe('walks on a day', () => {
    it('names an unnamed walk by its part of the day', () => {
        expect(walkTitle(walk({ time: '07:00' }))).toBe('Morning walk')
        expect(walkTitle(walk({ name: 'To the park' }))).toBe('To the park')
    })
    it('prefers the route’s real length over the target', () => {
        expect(walkEstimate(walk({ route: { distanceM: 2500 } }), null)?.distanceM).toBe(2500)
        expect(walkEstimate(walk(), null)?.distanceM).toBe(5000)
    })
    it('picks the earliest walk not done', () => {
        const walks = [walk({ _id: 'late', time: '18:00' }), walk({ _id: 'early', time: '08:00', doneAt: 'x' }), walk({ _id: 'mid', time: '12:00' })]
        expect(nextWalk(walks)?._id).toBe('mid')
    })
    it('adds the day up', () => {
        const t = walkDayTotals([walk(), walk({ _id: 'b', doneAt: 'x' })], 100)
        expect(t).toEqual({ count: 2, done: 1, distanceM: 10000, minutes: 120, steps: 13000, kcal: 720 })
    })
    it('builds Your day items in time order', () => {
        const items = walkDayItems([walk({ _id: 'b', time: '18:00', doneAt: 'x' }), walk({ _id: 'a', time: '08:00' })], null)
        expect(items.map((i) => i.id)).toEqual(['a', 'b'])
        expect(items[0]).toMatchObject({ title: 'Morning walk', detail: '08:00 · 1 h 00 min · 6,500 steps', done: false })
        expect(items[1].done).toBe(true)
    })
})

describe('repeats', () => {
    it('names the common patterns', () => {
        expect(repeatModeOf([])).toBe('once')
        expect(repeatModeOf([5, 4, 3, 2, 1])).toBe('weekdays')
        expect(repeatModeOf([0, 1, 2, 3, 4, 5, 6])).toBe('daily')
        expect(repeatModeOf([1, 3])).toBe('custom')
    })
    it('turns a pattern into days', () => expect(daysForRepeat('weekdays')).toEqual([1, 2, 3, 4, 5]))
})

describe('sameRoute', () => {
    const a = { distanceM: 100, coords: [[0, 0], [1, 1], [2, 2]] }
    it('matches the same line', () => expect(sameRoute(a, { ...a })).toBe(true))
    it('tells a different length apart', () => expect(sameRoute(a, { ...a, distanceM: 101 })).toBe(false))
    it('tells a different line of the same length apart', () => {
        expect(sameRoute(a, { distanceM: 100, coords: [[0, 0], [9, 9], [2, 2]] })).toBe(false)
    })
})

describe('doubledBackShare', () => {
    it('is half for there and back', () => expect(doubledBackShare([[0, 0], [1, 0], [2, 0], [1, 0], [0, 0]])).toBeCloseTo(0.5))
    it('is nothing for a loop', () => expect(doubledBackShare([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]])).toBe(0))
})

describe('the library', () => {
    it('falls back to where a walk starts', () => {
        expect(libraryTitle({ name: '', start: { label: 'Home' } })).toBe('Walk from Home')
        expect(libraryTitle({ name: 'Coffee', start: { label: 'Home' } })).toBe('Coffee')
    })
    it('lands each slot in its own part of the day', () => {
        for (const part of ['morning', 'afternoon', 'evening'] as const) expect(walkPart(SLOT_TIMES[part])).toBe(part)
    })
})
