import { describe, it, expect } from 'vitest'
import {
    activePlan,
    buildTimeline,
    monthRange,
    overlapsWindow,
    packLaneRows,
    placeOnGrid,
    seasonForMonth,
    seasonProgress,
    LANE_SOURCE_ROUTES,
    type LaneSource,
} from './lifeTimeline'
import type { Course, Goal, LifePlan, MonthNote, NutritionPhase, SavingsTarget, Season, TrainingPlan } from '../types'
import { EMPTY_SEASON_LINKS } from '../types'

function season(startMonth: string, endMonth: string, name = 'Cut & 10K'): Season {
    return {
        _id: `s-${name}`,
        name,
        startMonth,
        endMonth,
        color: 'blue',
        intent: [],
        links: { ...EMPTY_SEASON_LINKS },
        order: 0,
    }
}

function plan(overrides: Partial<LifePlan> = {}): LifePlan {
    return {
        _id: 'plan1',
        name: '2026',
        start: '2026-01',
        end: '2026-12',
        pillars: ['training', 'nutrition', 'money', 'study', 'life'],
        seasons: [],
        order: 0,
        createdAt: '',
        updatedAt: '',
        ...overrides,
    }
}

const trainingPlan: TrainingPlan = {
    _id: 'tp1',
    name: '10K build',
    planStart: '2026-09-01',
    planEnd: '2026-11-30',
    phases: [{ name: 'Base' }, { name: 'Build' }],
    weeklyTemplate: [],
    readinessRules: [],
    items: [],
    overrides: [],
    warnings: [],
    appliedEntries: 0,
    order: 0,
    createdAt: '',
    updatedAt: '',
}

const nutritionPhase: NutritionPhase = {
    _id: 'np1',
    name: 'Autumn cut',
    startDate: '2026-09-15',
    endDate: '2026-11-15',
    kind: 'cut',
    targets: { calories: 2200, protein: 180 },
    weeklyRate: -0.5,
    createdAt: '',
    updatedAt: '',
}

const savingsTarget: SavingsTarget = {
    _id: 'st1',
    name: 'House fund',
    targetAmount: 20000,
    startingBalance: 0,
    annualInterestRate: 4,
    startMonth: '2026-01',
    targetMonth: '2026-12',
    savedMonth: '2026-01',
    onTrack: true,
    requiredMonthly: 400,
    contributionMonths: 12,
    totalContributions: 4800,
    interestEarned: 100,
    growthOnly: 0,
    createdAt: '',
    updatedAt: '',
}

const course: Course = {
    _id: 'c1',
    name: 'Finals',
    kind: 'course',
    requiredHours: 40,
    completedHours: 25,
    order: 0,
    targetDate: '2026-06-12',
    createdAt: '',
    updatedAt: '',
}

const monthNote: MonthNote = {
    _id: 'mn1',
    startMonth: '2026-10',
    endMonth: '2026-10',
    label: 'Portugal',
    color: 'amber',
    createdAt: '',
    updatedAt: '',
}

const activeGoal: Goal = {
    _id: 'g1',
    title: 'Sub-45 10K',
    targetDate: '2026-11-08',
    progress: 40,
    status: 'active',
    milestones: [],
    progressMode: 'manual',
    linkedHabits: [],
    createdAt: '',
    updatedAt: '',
}

describe('monthRange', () => {
    it('is inclusive at both ends', () => {
        expect(monthRange('2026-03', '2026-06')).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
    })

    it('returns a single month when start equals end', () => {
        expect(monthRange('2026-03', '2026-03')).toEqual(['2026-03'])
    })

    it('crosses a year boundary', () => {
        expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    })

    it('is empty for an inverted range', () => {
        expect(monthRange('2026-06', '2026-03')).toEqual([])
    })
})

describe('overlapsWindow', () => {
    it('counts a range that merely touches the window', () => {
        expect(overlapsWindow('2025-01', '2026-01', '2026-01', '2026-12')).toBe(true)
        expect(overlapsWindow('2026-12', '2027-06', '2026-01', '2026-12')).toBe(true)
    })

    it('counts a range that spans the whole window without starting in it', () => {
        expect(overlapsWindow('2025-01', '2027-12', '2026-01', '2026-12')).toBe(true)
    })

    it('rejects ranges either side of the window', () => {
        expect(overlapsWindow('2025-01', '2025-12', '2026-01', '2026-12')).toBe(false)
        expect(overlapsWindow('2027-01', '2027-12', '2026-01', '2026-12')).toBe(false)
    })
})

describe('buildTimeline', () => {
    const input = {
        plan: plan({ seasons: [season('2026-09', '2026-11')] }),
        trainingPlans: [trainingPlan],
        nutritionPhases: [nutritionPhase],
        savingsTargets: [savingsTarget],
        courses: [course],
        monthNotes: [monthNote],
        goals: [activeGoal],
    }

    it('lays out a column per month of the plan window', () => {
        expect(buildTimeline(input).months).toHaveLength(12)
    })

    it('gives a lane to each pillar the plan tracks, and no others', () => {
        const timeline = buildTimeline({ ...input, plan: plan({ pillars: ['training', 'money'] }) })
        expect(timeline.lanes.map((l) => l.pillar)).toEqual(['training', 'money'])
    })

    it('places a training plan as a bar on the month its dates fall in', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'training')
        expect(lane?.items).toHaveLength(1)
        expect(lane?.items[0]).toMatchObject({
            source: 'trainingPlan',
            recordId: 'tp1',
            label: '10K build',
            shape: 'bar',
            startMonth: '2026-09',
            endMonth: '2026-11',
            detail: '2 phases',
        })
    })

    /*
     * 15 September to 15 November is two months, not three: the bar has to start
     * halfway through its first column and stop halfway through its last, or the
     * timeline reads as a month longer than the phase actually is.
     */
    it('starts and ends a dated bar part-way through its months', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'nutrition')
        expect(lane?.items[0]).toMatchObject({
            startMonth: '2026-09',
            startOffset: 0.5,
            endMonth: '2026-11',
            endOffset: 0.5,
        })
    })

    it('fills whole months for a bar that runs from the 1st to a month end', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'training')
        expect(lane?.items[0]).toMatchObject({ startOffset: 0, endOffset: 1 })
    })

    it('rounds an offset to the nearest quarter of a month', () => {
        const timeline = buildTimeline({
            plan: plan(),
            nutritionPhases: [{ ...nutritionPhase, startDate: '2026-02-08', endDate: '2026-02-27' }],
        })
        // February: the 8th is a quarter in, the 27th rounds up to the last quarter.
        expect(timeline.lanes.find((l) => l.pillar === 'nutrition')?.items[0]).toMatchObject({
            startOffset: 0.25,
            endOffset: 1,
        })
    })

    it('never rounds a short bar away to nothing', () => {
        const timeline = buildTimeline({
            plan: plan(),
            nutritionPhases: [{ ...nutritionPhase, startDate: '2026-02-08', endDate: '2026-02-09' }],
        })
        const item = timeline.lanes.find((l) => l.pillar === 'nutrition')?.items[0]
        expect(item?.endOffset).toBeGreaterThan(item!.startOffset)
    })

    it('covers a whole month for a record that only knows months', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'money')
        expect(lane?.items[0]).toMatchObject({
            startMonth: '2026-01',
            startOffset: 0,
            endMonth: '2026-12',
            endOffset: 1,
        })
    })

    it('sits a deadline marker on the day, not the middle of the month', () => {
        const timeline = buildTimeline(input)
        // The 8th of a 30-day November is a quarter of the way in.
        expect(timeline.goals[0]).toMatchObject({ startOffset: 0.25, endOffset: 0.25 })
    })

    it('colours a nutrition phase by its kind and summarises its targets', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'nutrition')
        expect(lane?.items[0]).toMatchObject({
            color: 'rose',
            startMonth: '2026-09',
            endMonth: '2026-11',
            detail: '2200 kcal · 180g protein · -0.5 kg/wk',
        })
    })

    it('draws a course deadline as a marker on one month', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'study')
        expect(lane?.items[0]).toMatchObject({
            shape: 'marker',
            startMonth: '2026-06',
            endMonth: '2026-06',
            detail: '15h remaining',
        })
    })

    it('puts goal deadlines in their own marker row, not a pillar lane', () => {
        const timeline = buildTimeline(input)
        expect(timeline.goals).toHaveLength(1)
        expect(timeline.goals[0]).toMatchObject({
            source: 'goal',
            label: 'Sub-45 10K',
            startMonth: '2026-11',
            shape: 'marker',
        })
        expect(timeline.lanes.flatMap((l) => l.items).some((i) => i.source === 'goal')).toBe(false)
    })

    it('leaves out records that miss the window entirely', () => {
        const timeline = buildTimeline({ ...input, plan: plan({ start: '2026-01', end: '2026-03' }) })
        expect(timeline.lanes.find((l) => l.pillar === 'training')?.items).toEqual([])
    })

    it('clips a bar that runs past the window and says which end was cut', () => {
        const timeline = buildTimeline({
            plan: plan({ start: '2026-10', end: '2026-10' }),
            trainingPlans: [trainingPlan],
        })
        expect(timeline.lanes[0].items[0]).toMatchObject({
            startMonth: '2026-10',
            endMonth: '2026-10',
            startOffset: 0,
            endOffset: 1,
            clippedStart: true,
            clippedEnd: true,
        })
    })

    it('does not mark an unclipped bar as clipped', () => {
        const item = buildTimeline(input).lanes.find((l) => l.pillar === 'training')?.items[0]
        expect(item).toMatchObject({ clippedStart: false, clippedEnd: false })
    })

    it('skips a course with no deadline — it has nowhere to sit', () => {
        const timeline = buildTimeline({
            plan: plan(),
            courses: [{ ...course, targetDate: undefined }],
        })
        expect(timeline.lanes.find((l) => l.pillar === 'study')?.items).toEqual([])
    })

    it('leaves out completed goals', () => {
        const timeline = buildTimeline({
            plan: plan(),
            goals: [{ ...activeGoal, status: 'completed' }],
        })
        expect(timeline.goals).toEqual([])
    })

    it('carries a month flag through with its own colour', () => {
        const lane = buildTimeline(input).lanes.find((l) => l.pillar === 'life')
        expect(lane?.items[0]).toMatchObject({ label: 'Portugal', color: 'amber', shape: 'bar' })
    })

    it('builds a band per season, clipped to the window', () => {
        const timeline = buildTimeline(input)
        expect(timeline.bands).toHaveLength(1)
        expect(timeline.bands[0]).toMatchObject({ startMonth: '2026-09', endMonth: '2026-11' })
    })

    it('gives every item an id unique across sources', () => {
        const timeline = buildTimeline(input)
        const ids = [...timeline.lanes.flatMap((l) => l.items), ...timeline.goals].map((i) => i.id)
        expect(new Set(ids).size).toBe(ids.length)
    })
})

describe('seasonForMonth', () => {
    const p = plan({ seasons: [season('2026-01', '2026-03', 'Winter'), season('2026-04', '2026-06', 'Spring')] })

    it('finds the season covering a month', () => {
        expect(seasonForMonth(p, '2026-02')?.name).toBe('Winter')
        expect(seasonForMonth(p, '2026-04')?.name).toBe('Spring')
    })

    it('is undefined for a month no season covers', () => {
        expect(seasonForMonth(p, '2026-09')).toBeUndefined()
    })
})

describe('activePlan', () => {
    const a = plan({ _id: 'a', start: '2026-01', end: '2026-12' })
    const b = plan({ _id: 'b', start: '2027-01', end: '2027-12' })

    it('picks the plan whose window covers the month', () => {
        expect(activePlan([a, b], '2027-05')?._id).toBe('b')
    })

    it('falls back to the first plan when the month sits in a gap', () => {
        expect(activePlan([a, b], '2030-01')?._id).toBe('a')
    })

    it('is undefined when there are no plans', () => {
        expect(activePlan([], '2026-05')).toBeUndefined()
    })
})

describe('seasonProgress', () => {
    it('counts which month of the season it is', () => {
        expect(seasonProgress(season('2026-09', '2026-11'), '2026-10')).toEqual({
            monthIndex: 2,
            monthCount: 3,
        })
    })

    it('reports a month outside the season as not started', () => {
        expect(seasonProgress(season('2026-09', '2026-11'), '2026-01')).toEqual({
            monthIndex: 0,
            monthCount: 3,
        })
    })
})

describe('packLaneRows', () => {
    /** A bar spanning the given months, optionally starting/ending part-way in. */
    function bar(
        id: string,
        startMonth: string,
        endMonth: string,
        startOffset = 0,
        endOffset = 1
    ) {
        return {
            id,
            source: 'monthNote' as const,
            recordId: id,
            pillar: 'life' as const,
            label: id,
            shape: 'bar' as const,
            color: 'neutral' as const,
            startMonth,
            endMonth,
            startOffset,
            endOffset,
            clippedStart: false,
            clippedEnd: false,
        }
    }

    it('keeps sequential items on one row', () => {
        const rows = packLaneRows([bar('a', '2026-01', '2026-02'), bar('b', '2026-03', '2026-04')])
        expect(rows).toHaveLength(1)
        expect(rows[0].map((i) => i.id)).toEqual(['a', 'b'])
    })

    it('pushes an overlapping item onto a second row', () => {
        const rows = packLaneRows([bar('a', '2026-01', '2026-06'), bar('b', '2026-03', '2026-08')])
        expect(rows.map((r) => r.map((i) => i.id))).toEqual([['a'], ['b']])
    })

    it('treats items sharing a single month as overlapping', () => {
        const rows = packLaneRows([bar('a', '2026-01', '2026-03'), bar('b', '2026-03', '2026-05')])
        expect(rows).toHaveLength(2)
    })

    it('reuses the first row that has cleared', () => {
        const rows = packLaneRows([
            bar('a', '2026-01', '2026-03'),
            bar('b', '2026-02', '2026-04'),
            bar('c', '2026-05', '2026-06'),
        ])
        expect(rows.map((r) => r.map((i) => i.id))).toEqual([['a', 'c'], ['b']])
    })

    it('needs as many rows as there are items live at once', () => {
        const rows = packLaneRows([
            bar('a', '2026-01', '2026-12'),
            bar('b', '2026-01', '2026-12'),
            bar('c', '2026-01', '2026-12'),
        ])
        expect(rows).toHaveLength(3)
    })

    it('is empty for an empty lane', () => {
        expect(packLaneRows([])).toEqual([])
    })

    /*
     * The whole point of quarter placement: two things can share a month without
     * sharing any time, and forcing them onto separate rows would say they
     * overlapped when they didn't.
     */
    it('keeps items that split a month on one row', () => {
        const rows = packLaneRows([
            bar('a', '2026-01', '2026-03', 0, 0.5),
            bar('b', '2026-03', '2026-05', 0.5, 1),
        ])
        expect(rows.map((r) => r.map((i) => i.id))).toEqual([['a', 'b']])
    })

    it('still separates items that genuinely overlap inside a month', () => {
        const rows = packLaneRows([
            bar('a', '2026-01', '2026-03', 0, 0.75),
            bar('b', '2026-03', '2026-05', 0.5, 1),
        ])
        expect(rows).toHaveLength(2)
    })
})

describe('placeOnGrid', () => {
    const months = monthRange('2026-01', '2026-12')

    function bar(startMonth: string, endMonth: string, startOffset: number, endOffset: number) {
        return {
            id: 'x',
            source: 'monthNote' as const,
            recordId: 'x',
            pillar: 'life' as const,
            label: 'x',
            shape: 'bar' as const,
            color: 'neutral' as const,
            startMonth,
            endMonth,
            startOffset,
            endOffset,
            clippedStart: false,
            clippedEnd: false,
        }
    }

    it('spans whole columns for a whole-month bar with no inset', () => {
        expect(placeOnGrid(bar('2026-03', '2026-05', 0, 1), months)).toEqual({
            startIndex: 2,
            span: 3,
            left: 0,
            right: 0,
        })
    })

    it('insets each end by its share of the span', () => {
        // Half of one month out of a two-month span is a quarter of the width.
        expect(placeOnGrid(bar('2026-03', '2026-04', 0.5, 0.5), months)).toEqual({
            startIndex: 2,
            span: 2,
            left: 25,
            right: 25,
        })
    })

    it('is null for a bar whose months are off the grid', () => {
        expect(placeOnGrid(bar('2025-03', '2025-04', 0, 1), months)).toBeNull()
    })
})

describe('LANE_SOURCE_ROUTES', () => {
    it('names a route for every lane source', () => {
        for (const source of Object.keys(LANE_SOURCE_ROUTES) as LaneSource[]) {
            expect(LANE_SOURCE_ROUTES[source]).toMatch(/^\//)
        }
    })

    /*
     * The timeline drawer's footer links to wherever a record is edited. For
     * most sources that is another page and a plain link works. A nutrition
     * phase is edited on the Life Plan page itself — the page the drawer is
     * already on — so a link there navigates nowhere and looks broken, which is
     * exactly the bug this documents. Those sources need the drawer's
     * `onOpenHere` handler instead.
     *
     * If a new source is ever edited on Life Plan too, this fails and points at
     * the handler that needs extending.
     */
    it('flags the sources edited on the Life Plan page itself', () => {
        const samePage = (Object.keys(LANE_SOURCE_ROUTES) as LaneSource[]).filter(
            (s) => LANE_SOURCE_ROUTES[s] === '/life-plan'
        )
        expect(samePage).toEqual(['nutritionPhase'])
    })
})
