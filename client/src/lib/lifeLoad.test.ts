import { describe, it, expect } from 'vitest'
import {
    DEFAULT_CAPACITIES,
    computeMonthLoads,
    findPressurePoints,
    levelForRatio,
    overloadedReserves,
    peakMonth,
    reserveShape,
    type LoadInput,
    type Reserve,
} from './lifeLoad'
import type {
    Course,
    Goal,
    LifePlan,
    MonthNote,
    NutritionPhase,
    NutritionPhaseKind,
    PlanScheduleEntry,
    PlanWeekDay,
    SavingsTarget,
    TrainingPlan,
} from '../types'

/** A one-year plan, the window every case below is scored over. */
function plan(start = '2026-01', end = '2026-12'): LifePlan {
    return {
        _id: 'plan1',
        name: '2026',
        start,
        end,
        pillars: ['training', 'nutrition', 'money', 'study', 'life'],
        seasons: [],
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

/** A week of three strength days and two conditioning days — 5 hard sessions. */
function template(strength = 3, conditioning = 2): PlanWeekDay[] {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    return days.map((day, i) => ({
        day,
        strength: i < strength ? 'Upper A' : '',
        conditioning: i >= strength && i < strength + conditioning ? 'Intervals' : 'Rest',
    }))
}

function trainingPlan(
    planStart: string,
    planEnd: string,
    name = 'Build',
    extra: Partial<TrainingPlan> = {}
): TrainingPlan {
    return {
        _id: `tp-${name}`,
        name,
        planStart,
        planEnd,
        phases: [],
        weeklyTemplate: template(),
        readinessRules: [],
        items: [],
        overrides: [],
        warnings: [],
        appliedEntries: 0,
        order: 0,
        createdAt: '',
        updatedAt: '',
        ...extra,
    }
}

/** `count` strength sessions spread across the given month, as a materialised schedule. */
function schedule(month: string, count: number): PlanScheduleEntry[] {
    return Array.from({ length: count }, (_, i) => ({
        date: `${month}-${String(i + 1).padStart(2, '0')}`,
        part: 'morning' as const,
        kind: 'workout' as const,
        role: 'strength' as const,
        item: `w${i}`,
        label: 'Upper A',
    }))
}

function phase(
    startDate: string,
    endDate: string,
    kind: NutritionPhaseKind = 'cut',
    name = 'Cut',
    extra: Partial<NutritionPhase> = {}
): NutritionPhase {
    return {
        _id: `np-${name}`,
        name,
        startDate,
        endDate,
        kind,
        targets: {},
        // −0.5 kg/wk implies a 550 kcal/day deficit: 2.2 units of body.
        weeklyRate: kind === 'cut' ? -0.5 : kind === 'gain' ? 0.25 : undefined,
        createdAt: '',
        updatedAt: '',
        ...extra,
    }
}

function savings(
    startMonth: string,
    targetMonth: string,
    name = 'House',
    requiredMonthly = 400
): SavingsTarget {
    return {
        _id: `st-${name}`,
        name,
        targetAmount: 10000,
        startingBalance: 0,
        annualInterestRate: 0,
        startMonth,
        targetMonth,
        savedMonth: startMonth,
        onTrack: true,
        requiredMonthly,
        contributionMonths: 12,
        totalContributions: 4800,
        interestEarned: 0,
        growthOnly: 0,
        createdAt: '',
        updatedAt: '',
    }
}

function course(targetDate: string, name = 'Exam', required = 40, completed = 10): Course {
    return {
        _id: `c-${name}`,
        name,
        kind: 'course',
        requiredHours: required,
        completedHours: completed,
        order: 0,
        targetDate,
        createdAt: '',
        updatedAt: '',
    }
}

function flag(startMonth: string, endMonth: string, label = 'Portugal'): MonthNote {
    return {
        _id: `mn-${label}`,
        startMonth,
        endMonth,
        label,
        color: 'neutral',
        createdAt: '',
        updatedAt: '',
    }
}

function goal(targetDate: string, title = 'Sub-45 10K', status: Goal['status'] = 'active'): Goal {
    return {
        _id: `g-${title}`,
        title,
        targetDate,
        progress: 20,
        status,
        milestones: [],
        progressMode: 'manual',
        linkedHabits: [],
        createdAt: '',
        updatedAt: '',
    }
}

/** The load on one month of the default window. */
function loadFor(month: string, input: Omit<LoadInput, 'plan'>) {
    const loads = computeMonthLoads({ plan: plan(), ...input })
    const found = loads.find((l) => l.month === month)
    if (!found) throw new Error(`no load computed for ${month}`)
    return found
}

/** Shorthand for one reserve's demand in a month. */
function demandFor(month: string, reserve: Reserve, input: Omit<LoadInput, 'plan'>) {
    return loadFor(month, input).reserves[reserve].demand
}

describe('levelForRatio', () => {
    it('calls a month overloaded exactly when it asks for more than there is', () => {
        expect(levelForRatio(0)).toBe('quiet')
        expect(levelForRatio(0.49)).toBe('quiet')
        expect(levelForRatio(0.5)).toBe('steady')
        expect(levelForRatio(0.79)).toBe('steady')
        expect(levelForRatio(0.8)).toBe('busy')
        expect(levelForRatio(0.99)).toBe('busy')
        expect(levelForRatio(1)).toBe('overloaded')
        expect(levelForRatio(3)).toBe('overloaded')
    })
})

describe('computeMonthLoads', () => {
    it('covers every month of the plan window, in order', () => {
        const loads = computeMonthLoads({ plan: plan('2026-03', '2026-06') })
        expect(loads.map((l) => l.month)).toEqual(['2026-03', '2026-04', '2026-05', '2026-06'])
    })

    it('scores an empty month as unremarkable with nothing in it', () => {
        const load = loadFor('2026-05', {})
        expect(load.contributors).toEqual([])
        expect(load.peak).toBeNull()
        expect(load.level).toBeNull()
        for (const reserve of ['time', 'body', 'money', 'focus'] as const)
            expect(load.reserves[reserve].demand).toBe(0)
    })
})

describe('reserves are spent separately', () => {
    const targets = {
        savingsTargets: [
            savings('2026-01', '2026-12', 'House'),
            savings('2026-01', '2026-12', 'Car'),
            savings('2026-01', '2026-12', 'Wedding'),
            savings('2026-01', '2026-12', 'Christmas'),
        ],
    }

    it('leaves body, time and focus untouched by any number of savings targets', () => {
        const load = loadFor('2026-05', targets)
        expect(load.reserves.money.demand).toBe(1600)
        expect(load.reserves.body.demand).toBe(0)
        expect(load.reserves.time.demand).toBe(0)
        expect(load.reserves.focus.demand).toBe(0)
    })

    it('judges savings on what they cost, not how many there are', () => {
        // Four targets inside the free cash is not overload.
        expect(
            loadFor('2026-05', { ...targets, freeCash: { '2026-05': 2000 } }).reserves.money.level
        ).toBe('busy')
        // One target beyond it is.
        expect(
            loadFor('2026-05', {
                savingsTargets: [savings('2026-01', '2026-12', 'House', 900)],
                freeCash: { '2026-05': 700 },
            }).reserves.money.level
        ).toBe('overloaded')
    })

    it('leaves money unscored rather than guessing when free cash is unknown', () => {
        const money = loadFor('2026-05', targets).reserves.money
        expect(DEFAULT_CAPACITIES.money).toBeNull()
        expect(money.demand).toBe(1600)
        expect(money.capacity).toBeNull()
        expect(money.ratio).toBeNull()
        expect(money.level).toBeNull()
    })

    it('prefers a month-by-month free cash figure over the fallback capacity', () => {
        const input = {
            savingsTargets: [savings('2026-01', '2026-12', 'House', 500)],
            capacities: { money: { value: 1000, basis: 'default' as const } },
            freeCash: { '2026-06': 400 },
        }
        expect(loadFor('2026-05', input).reserves.money.level).toBe('steady')
        expect(loadFor('2026-06', input).reserves.money.level).toBe('overloaded')
        expect(loadFor('2026-06', input).reserves.money.capacityBasis).toBe('measured')
    })
})

describe('body', () => {
    const build = { trainingPlans: [trainingPlan('2026-01-01', '2026-12-31', '10K build')] }
    const cut = { nutritionPhases: [phase('2026-01-01', '2026-12-31', 'cut', 'Autumn cut')] }

    it('counts a deficit and hard sessions as the same reserve', () => {
        expect(demandFor('2026-05', 'body', build)).toBe(5)
        expect(demandFor('2026-05', 'body', cut)).toBe(2.2)
    })

    it('overloads on two commitments, because both come out of recovery', () => {
        const load = loadFor('2026-05', { ...build, ...cut })
        expect(load.contributors).toHaveLength(2)
        expect(load.reserves.body.demand).toBe(7.2)
        expect(load.reserves.body.level).toBe('overloaded')
        // And the same month is nowhere near overloaded on the reserve a summed
        // score would have blamed.
        expect(load.reserves.time.level).toBe('steady')
        expect(load.peak).toBe('body')
    })

    it('reads the true depth off measured maintenance when it is known', () => {
        const input = {
            nutritionPhases: [
                phase('2026-05-01', '2026-05-31', 'cut', 'Cut', { targets: { calories: 2000 } }),
            ],
            maintenanceKcal: 2500,
        }
        expect(demandFor('2026-05', 'body', input)).toBe(2)
        expect(loadFor('2026-05', input).contributors[0].detail).toBe('−500 kcal/day')
    })

    it('costs nothing for a surplus — eating over maintenance is not a recovery debt', () => {
        const gain = { nutritionPhases: [phase('2026-05-01', '2026-05-31', 'gain', 'Off-season')] }
        expect(demandFor('2026-05', 'body', gain)).toBe(0)
        expect(demandFor('2026-05', 'focus', gain)).toBe(1)
        expect(loadFor('2026-05', gain).contributors[0].detail).toBe('+275 kcal/day')
    })

    it('costs nothing at all for a maintain phase, but still lists it', () => {
        const load = loadFor('2026-05', {
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'maintain', 'Off-season')],
        })
        expect(load.contributors).toHaveLength(1)
        expect(load.contributors[0].label).toBe('Off-season')
        expect(load.reserves.body.demand).toBe(0)
        expect(load.reserves.focus.demand).toBe(0)
        expect(load.reserves.body.contributions).toEqual([])
    })

    it('charges a phase only for the part of the month it covers', () => {
        // Half of May at 2.2 units is 1.1.
        const half = { nutritionPhases: [phase('2026-05-01', '2026-05-16', 'cut')] }
        expect(demandFor('2026-05', 'body', half)).toBeCloseTo(1.14, 1)
    })
})

describe('time', () => {
    it('prices a plan from its weekly template when the schedule is not loaded', () => {
        const input = { trainingPlans: [trainingPlan('2026-01-01', '2026-12-31')] }
        // 3 strength at 1h + 2 conditioning at 0.75h.
        expect(demandFor('2026-05', 'time', input)).toBe(4.5)
        expect(loadFor('2026-05', input).contributors[0].basis).toBe('assumed')
    })

    it("prefers the plan's own materialised schedule, and calls that measured", () => {
        // February 2026 is exactly four weeks: 8 sessions is 2 a week.
        const input = {
            trainingPlans: [
                trainingPlan('2026-02-01', '2026-02-28', 'Base', {
                    schedule: schedule('2026-02', 8),
                }),
            ],
        }
        expect(demandFor('2026-02', 'time', input)).toBe(2)
        expect(demandFor('2026-02', 'body', input)).toBe(2)
        expect(loadFor('2026-02', input).contributors[0].basis).toBe('measured')
    })

    it('charges a month only for the part of it a plan covers', () => {
        const input = { trainingPlans: [trainingPlan('2026-05-16', '2026-06-30')] }
        expect(demandFor('2026-05', 'time', input)).toBeCloseTo(2.32, 1)
        expect(demandFor('2026-06', 'time', input)).toBe(4.5)
    })

    it("raises a course's implied study rate as its deadline closes", () => {
        const input = { courses: [course('2026-03-31')] }
        const jan = demandFor('2026-01', 'time', input)
        const mar = demandFor('2026-03', 'time', input)
        expect(jan).toBeCloseTo(2.26, 1)
        expect(mar).toBeCloseTo(6.77, 1)
        expect(mar).toBeGreaterThan(jan)
    })

    it('drops a course once its deadline has passed', () => {
        const input = { courses: [course('2026-03-31')] }
        expect(loadFor('2026-04', input).contributors).toEqual([])
    })

    it('ignores a course with no deadline — it has no span to be live over', () => {
        const undated: Course = { ...course('2026-09-18'), targetDate: undefined }
        expect(loadFor('2026-09', { courses: [undated] }).contributors).toEqual([])
    })
})

describe('focus', () => {
    it('counts deadlines only in the month they land', () => {
        const input = { goals: [goal('2026-09-30')] }
        expect(demandFor('2026-08', 'focus', input)).toBe(0)
        expect(demandFor('2026-09', 'focus', input)).toBe(1)
        expect(demandFor('2026-10', 'focus', input)).toBe(0)
    })

    it('ignores goals that are done or abandoned', () => {
        expect(demandFor('2026-09', 'focus', { goals: [goal('2026-09-30', 'Done', 'completed')] })).toBe(0)
        expect(demandFor('2026-09', 'focus', { goals: [goal('2026-09-30', 'Gone', 'abandoned')] })).toBe(0)
    })

    it('overloads on four concurrent behaviour changes', () => {
        const load = loadFor('2026-09', {
            nutritionPhases: [phase('2026-09-01', '2026-09-30', 'cut')],
            trainingPlans: [trainingPlan('2026-09-01', '2026-09-30')],
            courses: [course('2026-09-30')],
            monthNotes: [flag('2026-09', '2026-09')],
            goals: [goal('2026-09-30')],
        })
        // cut 1 + plan 0.5 + course 1 + flag 0.5 + deadline 1
        expect(load.reserves.focus.demand).toBe(4)
        expect(load.reserves.focus.level).toBe('overloaded')
    })
})

describe('measured vs assumed', () => {
    it('reports how much of a reserve rests on a standing-in figure', () => {
        const load = loadFor('2026-05', {
            // 4.5 measured hours of training against 2 assumed hours of month flag.
            trainingPlans: [
                trainingPlan('2026-05-01', '2026-05-31', 'Base', { schedule: [] }),
            ],
            monthNotes: [flag('2026-05', '2026-05')],
        })
        expect(load.reserves.time.demand).toBe(6.5)
        expect(load.reserves.time.assumedShare).toBe(1)

        const measured = loadFor('2026-02', {
            trainingPlans: [
                trainingPlan('2026-02-01', '2026-02-28', 'Base', { schedule: schedule('2026-02', 8) }),
            ],
            monthNotes: [flag('2026-02', '2026-02')],
        })
        // 2 measured hours against 2 assumed.
        expect(measured.reserves.time.assumedShare).toBe(0.5)
    })

    it('lists the heaviest spender of a reserve first', () => {
        const load = loadFor('2026-05', {
            monthNotes: [flag('2026-05', '2026-05')],
            trainingPlans: [trainingPlan('2026-05-01', '2026-05-31', 'Build')],
        })
        expect(load.reserves.time.contributions.map((c) => c.contributor.label)).toEqual([
            'Build',
            'Portugal',
        ])
    })
})

describe('conflicts', () => {
    it('flags a cut and a gain running at once', () => {
        const load = loadFor('2026-05', {
            nutritionPhases: [
                phase('2026-04-01', '2026-05-20', 'cut', 'Spring cut'),
                phase('2026-05-10', '2026-07-01', 'gain', 'Off-season'),
            ],
        })
        expect(load.conflicts.map((c) => c.kind)).toEqual(['opposing-phases'])
        expect(load.conflicts[0].between).toEqual(['nutritionPhase:np-Spring cut', 'nutritionPhase:np-Off-season'])
    })

    it('flags a deep cut under a heavy training week', () => {
        const load = loadFor('2026-05', {
            trainingPlans: [trainingPlan('2026-05-01', '2026-05-31', '10K build')],
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'cut')],
        })
        expect(load.conflicts.map((c) => c.kind)).toEqual(['deep-cut-in-heavy-block'])
    })

    it('stays quiet about an ordinary cut alongside ordinary training', () => {
        // A gentle cut (−0.2 kg/wk ≈ 0.88 units) under three easy sessions a week.
        const load = loadFor('2026-05', {
            trainingPlans: [
                trainingPlan('2026-05-01', '2026-05-31', 'Base', { weeklyTemplate: template(2, 1) }),
            ],
            nutritionPhases: [phase('2026-05-01', '2026-05-31', 'cut', 'Gentle', { weeklyRate: -0.2 })],
        })
        expect(load.conflicts).toEqual([])
    })

    it('calls committing beyond free cash a conflict, not merely a heavy month', () => {
        const load = loadFor('2026-05', {
            savingsTargets: [savings('2026-01', '2026-12', 'House', 900)],
            freeCash: { '2026-05': 700 },
        })
        expect(load.conflicts.map((c) => c.kind)).toEqual(['unfundable'])
        expect(load.conflicts[0].detail).toContain('£900')
        expect(load.conflicts[0].detail).toContain('£700')
    })

    it('says nothing about money it cannot price', () => {
        const load = loadFor('2026-05', {
            savingsTargets: [savings('2026-01', '2026-12', 'House', 9000)],
        })
        expect(load.conflicts).toEqual([])
    })
})

describe('findPressurePoints', () => {
    it('returns the months where a reserve went over, or two things fought', () => {
        const loads = computeMonthLoads({
            plan: plan(),
            trainingPlans: [trainingPlan('2026-09-01', '2026-11-30', '10K build')],
            nutritionPhases: [phase('2026-09-15', '2026-11-15', 'cut', 'Autumn cut')],
            savingsTargets: [savings('2026-01', '2026-12')],
            monthNotes: [flag('2026-10', '2026-10')],
        })
        expect(findPressurePoints(loads).map((l) => l.month)).toEqual([
            '2026-09',
            '2026-10',
            '2026-11',
        ])
    })

    it('flags one commitment on its own when it is genuinely over capacity', () => {
        const loads = computeMonthLoads({
            plan: plan('2026-05', '2026-05'),
            savingsTargets: [savings('2026-05', '2026-05', 'Car', 900)],
            freeCash: { '2026-05': 700 },
        })
        expect(findPressurePoints(loads)).toHaveLength(1)
    })

    it('stays empty for a window with nothing in it', () => {
        expect(findPressurePoints(computeMonthLoads({ plan: plan() }))).toEqual([])
    })
})

describe('overloadedReserves', () => {
    it('names which reserves went over, hottest first', () => {
        const load = loadFor('2026-09', {
            trainingPlans: [trainingPlan('2026-09-01', '2026-09-30', '10K build')],
            nutritionPhases: [phase('2026-09-01', '2026-09-30', 'cut')],
            courses: [course('2026-09-30', 'Exam', 80, 0)],
            monthNotes: [flag('2026-09', '2026-09')],
        })
        expect(overloadedReserves(load).map((r) => r.reserve)).toEqual(['time', 'body', 'focus'])
    })
})

describe('peakMonth', () => {
    it('finds the most strained month by its hottest reserve', () => {
        const loads = computeMonthLoads({
            plan: plan(),
            trainingPlans: [trainingPlan('2026-02-01', '2026-03-31')],
            nutritionPhases: [phase('2026-03-01', '2026-03-31')],
        })
        expect(peakMonth(loads)?.month).toBe('2026-03')
    })

    it('is undefined for an empty window', () => {
        expect(peakMonth([])).toBeUndefined()
    })
})

describe('reserveShape', () => {
    it("reads a stretch of months as how hard it leans on each reserve", () => {
        const loads = computeMonthLoads({
            plan: plan('2026-09', '2026-11'),
            trainingPlans: [trainingPlan('2026-09-01', '2026-11-30', '10K build')],
            savingsTargets: [savings('2026-09', '2026-11', 'House', 400)],
        })
        const shape = reserveShape(loads)
        expect(shape.body).toBeCloseTo(5 / 6, 2)
        expect(shape.time).toBeCloseTo(4.5 / 9, 2)
        expect(shape.focus).toBeCloseTo(0.5 / 3, 2)
        // Unpriceable, so it reports nothing rather than zero.
        expect(shape.money).toBeNull()
    })
})
