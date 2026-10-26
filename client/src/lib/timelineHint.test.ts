import { describe, it, expect } from 'vitest'
import { addDays } from './calendar'
import { timelineHint } from './timelineHint'
import type { Milestone, Timeline, TimelineWeek } from './timeline'
import type { NutritionPhaseKind } from '../types'

const TODAY = '2026-11-04'

/**
 * A timeline `total` weeks long with today two days into week `week` — only the
 * fields the hint reads. `since` is the trend when the plans began, `now` today's.
 */
function timeline({
    total,
    week,
    milestones = [],
    since = 90,
    now = 90,
    kind = 'cut',
    goalKg = null,
}: {
    total: number
    week: number
    milestones?: Milestone[]
    since?: number
    now?: number
    kind?: NutritionPhaseKind | null
    goalKg?: number | null
}): Timeline {
    const chainStart = addDays(TODAY, -(week - 1) * 7 - 2)
    const phase = kind ? { name: 'Winter cut', kind } : null
    const weeks: TimelineWeek[] = []
    for (let i = week; i <= total; i++) {
        const start = addDays(chainStart, (i - 1) * 7)
        weeks.push({ index: i, start, end: addDays(start, 6), phase, milestones: [] } as unknown as TimelineWeek)
    }
    weeks[0].milestones = milestones
    return {
        start: TODAY,
        chainStart,
        past: Array.from({ length: week - 1 }, (_, i) => ({ index: i + 1 })),
        end: weeks[weeks.length - 1].end,
        initial: { weight: now },
        since: { weight: since, fat: 0, lean: 0 },
        weeks,
        goal: { weightKg: goalKg, bodyFatPct: null, date: null },
        plans: kind ? [{ id: 'p', name: 'Winter cut', start: chainStart, end: TODAY, type: 'nutrition', kind }] : [],
    } as unknown as Timeline
}

function milestone(date: string, kind: Milestone['kind'], title: string): Milestone {
    return { date, kind, title, detail: '' }
}

describe('timelineHint', () => {
    it('counts the week from the start of the plans', () => {
        const h = timelineHint(timeline({ total: 12, week: 3 }), TODAY)
        expect(h).toMatchObject({ week: 3, total: 12, weeksLeft: 9 })
        expect(h.progress).toBeGreaterThan(0.15)
        expect(h.progress).toBeLessThan(0.25)
    })

    it('picks the nudge for the stage', () => {
        const stage = (week: number, total = 16) => timelineHint(timeline({ total, week }), TODAY).stage
        expect(stage(1)).toBe('start')
        expect(stage(3)).toBe('early')
        expect(stage(6)).toBe('building')
        // 16 weeks: the midpoint, day 55, falls in week 8.
        expect(stage(8)).toBe('halfway')
        expect(stage(10)).toBe('late')
        expect(stage(14)).toBe('final')
        expect(stage(16)).toBe('last')
    })

    it('lets the end of the plans win over the start on a short run', () => {
        expect(timelineHint(timeline({ total: 2, week: 1 }), TODAY).stage).toBe('final')
        expect(timelineHint(timeline({ total: 1, week: 1 }), TODAY).stage).toBe('last')
    })

    it('says early on that changes are coming', () => {
        expect(timelineHint(timeline({ total: 12, week: 2 }), TODAY).message).toContain('start to see them soon')
    })

    it('points at the next change to notice, not plan changes or ones already past', () => {
        const h = timelineHint(
            timeline({
                total: 12,
                week: 3,
                milestones: [
                    milestone(addDays(TODAY, -1), 'fat', 'First kilo of fat gone'),
                    milestone(addDays(TODAY, 2), 'plan', 'Training plan starts — Block B'),
                    milestone(addDays(TODAY, 10), 'fat', 'Waistband feels looser'),
                ],
            }),
            TODAY
        )
        expect(h.next?.title).toBe('Waistband feels looser')
        expect(timelineHint(timeline({ total: 12, week: 3 }), TODAY).next).toBeNull()
    })

    it('mentions progress so far only when it goes the plans’ way', () => {
        const soFar = (over: Parameters<typeof timeline>[0]) => timelineHint(timeline(over), TODAY).soFar
        expect(soFar({ total: 12, week: 4, since: 92, now: 90.5 })).toBeCloseTo(-1.5)
        expect(soFar({ total: 12, week: 4, since: 90, now: 91 })).toBeNull()
        expect(soFar({ total: 12, week: 4, since: 90, now: 89.8 })).toBeNull()
        expect(soFar({ total: 12, week: 4, since: 80, now: 81.5, kind: 'gain' })).toBeCloseTo(1.5)
        // A goal weight decides the direction over the phase kind.
        expect(soFar({ total: 12, week: 4, since: 80, now: 81.5, goalKg: 85 })).toBeCloseTo(1.5)
        expect(soFar({ total: 12, week: 4, since: 92, now: 90, kind: 'maintain' })).toBeNull()
        expect(soFar({ total: 12, week: 4, since: 92, now: 90, kind: null })).toBeNull()
    })
})
