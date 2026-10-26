import { describe, it, expect } from 'vitest'
import { addDays } from './calendar'
import {
    buildTimeline,
    calibrate,
    cutRuns,
    makeWater,
    measureNutrition,
    measureTraining,
    sessionsByDate,
    startingPoint,
    timelineGaps,
    type TimelineInputs,
} from './timeline'
import type {
    ConditioningLog,
    MealPlanEntry,
    NutritionPhase,
    NutritionPhaseKind,
    PlanScheduleEntry,
    TimelineQuiz,
    TrainingPlan,
    WeightLog,
    WorkoutLog,
} from '../types'

const TODAY = '2026-11-02' // a Monday

function phase(start: string, end: string, kind: NutritionPhaseKind, calories?: number): NutritionPhase {
    return {
        _id: `${kind}-${start}`,
        name: kind === 'cut' ? 'Winter cut' : kind === 'gain' ? 'Lean build' : 'Hold',
        startDate: start,
        endDate: end,
        kind,
        targets: calories ? { calories } : {},
        createdAt: '',
        updatedAt: '',
    }
}

/** Strength Mon/Wed/Fri and runs Tue/Sat from `start` for `weeks`. */
function plan(start: string, weeks: number, name = 'Block A'): TrainingPlan {
    const schedule: PlanScheduleEntry[] = []
    for (let d = 0; d < weeks * 7; d++) {
        const date = addDays(start, d)
        const dow = d % 7
        if (dow === 0 || dow === 2 || dow === 4)
            schedule.push({ date, part: 'morning', kind: 'workout', role: 'strength', item: `w${dow}`, label: 'Lift' })
        if (dow === 1 || dow === 5)
            schedule.push({ date, part: 'afternoon', kind: 'conditioning', role: 'run', item: `r${dow}`, label: 'Run' })
    }
    return {
        _id: name,
        name,
        planStart: start,
        planEnd: addDays(start, weeks * 7 - 1),
        phases: [],
        weeklyTemplate: [],
        readinessRules: [],
        items: [],
        schedule,
        overrides: [],
        warnings: [],
        appliedEntries: 0,
        order: 0,
        createdAt: '',
        updatedAt: '',
    }
}

function weigh(date: string, weight: number, bodyFat?: number): WeightLog {
    return { _id: date, date, weight, bodyFat, createdAt: '', updatedAt: '' } as WeightLog
}

function lift(date: string, name: string, weight: number, reps: number): WorkoutLog {
    return {
        _id: `${date}-${name}`,
        workout: null,
        name: 'Session',
        date,
        exercises: [{ name, loggedSets: [{ weight, reps }] }],
        createdAt: '',
        updatedAt: '',
    } as WorkoutLog
}

const QUIZ: TimelineQuiz = {
    trainingAdherence: 0.9,
    nutritionAdherence: 0.9,
    trainingAge: 'intermediate',
    creatine: 'no',
    protein: 'always',
    sleep: '7to8',
    activity: 'some',
    answeredAt: '2026-11-01T00:00:00Z',
}

function inputs(over: Partial<TimelineInputs> = {}): TimelineInputs {
    return {
        today: TODAY,
        plans: [plan(TODAY, 12)],
        phases: [phase(TODAY, addDays(TODAY, 83), 'cut', 2100)],
        weightLogs: [weigh(TODAY, 90, 22)],
        workoutLogs: [],
        profile: { heightCm: 180, birthDate: '1992-05-01', sex: 'male' },
        quiz: QUIZ,
        ...over,
    }
}

describe('timelineGaps', () => {
    it('lists everything missing', () => {
        expect(timelineGaps(TODAY, [], [], undefined, [])).toEqual([
            'training-plan',
            'nutrition-plan',
            'body-profile',
            'weigh-in',
        ])
    })

    it('ignores plans that have already ended', () => {
        const old = plan('2026-01-05', 4)
        const done = phase('2026-01-05', '2026-02-01', 'cut', 2000)
        const i = inputs()
        expect(timelineGaps(TODAY, [old], [done], i.profile, i.weightLogs)).toEqual(['training-plan', 'nutrition-plan'])
    })

    it('is empty when everything is in place', () => {
        const i = inputs()
        expect(timelineGaps(TODAY, i.plans, i.phases, i.profile, i.weightLogs)).toEqual([])
    })
})

describe('buildTimeline', () => {
    it('runs weekly from today to the end of the last plan, any type', () => {
        const t = buildTimeline(
            inputs({ phases: [phase(TODAY, addDays(TODAY, 83), 'cut', 2100), phase(addDays(TODAY, 84), addDays(TODAY, 111), 'maintain', 2700)] })
        )
        expect(t.start).toBe(TODAY)
        expect(t.end).toBe(addDays(TODAY, 111))
        expect(t.weeks).toHaveLength(16)
        expect(t.weeks[0].start).toBe(TODAY)
        expect(t.weeks[15].end).toBe(t.end)
    })

    it('projects a realistic cut from the plans alone', () => {
        const t = buildTimeline(inputs())
        const loss = 90 - t.final.weight.mid
        // ~600 kcal/day under maintenance for 12 weeks, at 90% adherence.
        expect(loss).toBeGreaterThan(4)
        expect(loss).toBeLessThan(10)
        expect(t.final.fatChange).toBeLessThan(-4)
        // Lifting through a moderate cut holds or adds a little muscle, never a lot.
        expect(t.final.leanChange).toBeGreaterThanOrEqual(0)
        expect(t.final.leanChange).toBeLessThan(1)
        expect(t.final.bodyFat.mid).toBeLessThan(22)
        expect(t.calibration).toBeNull()
    })

    it('keeps ranges tight and widening with time', () => {
        const t = buildTimeline(inputs())
        const width = (w: { weight: { low: number; high: number } }) => w.weight.high - w.weight.low
        expect(width(t.weeks[0])).toBeLessThan(1)
        expect(width(t.weeks[11])).toBeGreaterThan(width(t.weeks[0]))
        expect(width(t.weeks[11])).toBeLessThanOrEqual(5)
    })

    it('loses less when the plan is followed less', () => {
        const strict = buildTimeline(inputs({ quiz: { ...QUIZ, nutritionAdherence: 1, trainingAdherence: 1 } }))
        const loose = buildTimeline(inputs({ quiz: { ...QUIZ, nutritionAdherence: 0.5 } }))
        expect(loose.final.weight.mid).toBeGreaterThan(strict.final.weight.mid + 1)
        expect(strict.perfect).toBeNull()
        expect(loose.perfect!.final.weight.mid).toBeCloseTo(strict.final.weight.mid, 1)
    })

    it('builds more muscle in a surplus than a deficit', () => {
        const gain = buildTimeline(inputs({ phases: [phase(TODAY, addDays(TODAY, 83), 'gain', 3200)] }))
        const cut = buildTimeline(inputs())
        expect(gain.final.leanChange).toBeGreaterThan(cut.final.leanChange + 0.5)
        expect(gain.final.weight.mid).toBeGreaterThan(90)
    })

    it('flags plan changes when phases are chained', () => {
        const t = buildTimeline(
            inputs({ phases: [phase(TODAY, addDays(TODAY, 55), 'cut', 2100), phase(addDays(TODAY, 56), addDays(TODAY, 83), 'maintain', 2700)] })
        )
        const all = t.weeks.flatMap((w) => w.milestones)
        expect(all.some((m) => m.kind === 'plan' && m.title.startsWith('Maintenance starts'))).toBe(true)
        expect(all.some((m) => m.title.includes('after the cut'))).toBe(true)
        expect(all[all.length - 1].title).toBe('Finish line')
    })

    it('treats a creatine load as water, not fat', () => {
        const start = { ...QUIZ, creatine: 'new' as const, creatineDoseG: 5, creatineStart: TODAY }
        const on = buildTimeline(inputs({ quiz: start }))
        const off = buildTimeline(inputs())
        expect(on.weeks[5].weight.mid - off.weeks[5].weight.mid).toBeGreaterThan(0.8)
        expect(on.weeks.flatMap((w) => w.milestones).some((m) => m.kind === 'water' && m.title.includes('creatine'))).toBe(true)
    })

    it('projects logged lifts upward with training', () => {
        const logs = [0, 7, 14, 21].map((d) => lift(addDays(TODAY, -28 + d), 'Back squat', 100, 5))
        const t = buildTimeline(inputs({ workoutLogs: logs, phases: [phase(TODAY, addDays(TODAY, 83), 'maintain', 2800)] }))
        expect(t.initial.lifts.map((l) => l.lift)).toEqual(['squat'])
        const squat = t.final.lifts[0]
        expect(squat.range.mid).toBeGreaterThan(t.initial.lifts[0].kg)
        expect(squat.range.low).toBeLessThan(squat.range.mid)
    })
})

describe('a cut the formula thinks is a surplus', () => {
    // A big, active lifter: Mifflin × low activity puts maintenance under the
    // plan's 2,850 kcal, so trusting the formula projected the cut as a gain.
    const today = '2026-10-22'
    const cut: NutritionPhase = {
        ...phase(today, '2027-06-01', 'cut', 2850),
        goal: { targetWeightKg: 95, targetDate: '2027-06-01', targetBodyFatPct: 20 },
    }
    const prop = (quiz: TimelineQuiz) =>
        buildTimeline({
            today,
            plans: [plan(today, 11)],
            phases: [cut],
            weightLogs: [weigh(today, 105.2, 29)],
            workoutLogs: [],
            profile: { heightCm: 183, birthDate: '1995-03-01', sex: 'male' },
            quiz,
        })
    const quiz: TimelineQuiz = { ...QUIZ, activity: 'low', trainingAdherence: 0.75, nutritionAdherence: 0.9 }

    it('reads maintenance back from the plan instead', () => {
        const t = prop(quiz)
        expect(t.burn.source).toBe('goal')
        expect(t.burn.planKcal!).toBeGreaterThan(2850)
        expect(t.burn.planKcal!).toBeGreaterThan(t.burn.formulaKcal)
    })

    it('loses weight and fat, and gets close to the goal when followed to the letter', () => {
        const t = prop(quiz)
        expect(t.final.weight.mid).toBeLessThan(105.2 - 4)
        expect(t.final.fatChange).toBeLessThan(-4)
        expect(t.final.bodyFat.mid).toBeLessThan(29)
        expect(t.perfect!.final.weight.mid).toBeLessThan(t.final.weight.mid)
        // The plan was written to reach 20%: followed fully, it does.
        expect(t.burn.source).toBe('goal')
        expect(t.perfect!.final.bodyFat.mid).toBeLessThanOrEqual(20.05)
        expect(t.perfect!.final.bodyFat.mid).toBeGreaterThan(19)
        for (let i = 1; i < t.weeks.length; i++) {
            expect(t.weeks[i].fatChange).toBeLessThanOrEqual(t.weeks[i - 1].fatChange + 0.01)
        }
    })

    it('suggests what closes the gap, biggest first, and all together beats any one', () => {
        const t = prop(quiz)
        expect(t.suggestions.length).toBeGreaterThanOrEqual(3)
        expect(t.suggestions[0].gain).toBeGreaterThanOrEqual(t.suggestions[1].gain)
        expect(t.suggestions.map((s) => s.key)).toContain('nutrition')
        expect(t.combined!.final.bodyFat.mid).toBeLessThan(t.suggestions[0].final.bodyFat.mid)
    })

    it('says when extra effort reaches the goal, and that all of it gets there soonest', () => {
        const t = prop(quiz)
        expect(t.goal.date).toBe('2027-06-01')
        const reaching = t.suggestions.filter((s) => s.reaches)
        for (const s of reaching) {
            expect(s.reaches! <= '2027-06-01').toBe(true)
            expect(s.reaches! >= t.combined!.reaches!).toBe(true)
        }
        expect(t.combined!.reaches! < '2027-04-01').toBe(true)
    })

    it('flags a goal no believable maintenance can reach', () => {
        const t = buildTimeline({
            today,
            plans: [plan(today, 11)],
            phases: [{ ...cut, targets: { calories: 3600 }, goal: { targetBodyFatPct: 10, targetDate: '2027-06-01' } }],
            weightLogs: [weigh(today, 105.2, 29)],
            workoutLogs: [],
            profile: { heightCm: 183, birthDate: '1995-03-01', sex: 'male' },
            quiz,
        })
        expect(t.burn.goalReachable).toBe(false)
        expect(t.burn.source).toBe('plan')
    })

    it('keeps training through the gap, says so, and never cheers a gain', () => {
        const t = prop(quiz)
        expect(t.trainingGaps).toHaveLength(1)
        expect(t.trainingGaps[0].end).toBe('2027-06-01')
        const all = t.weeks.flatMap((w) => w.milestones)
        expect(all.find((m) => m.title.startsWith('Training plan ends'))!.detail).toContain('keep training')
        expect(all.find((m) => m.title === 'Halfway there')!.detail).not.toContain('up on the scale')
    })
})

describe('the whole chain stays on screen', () => {
    // Plans began 23 days ago: three whole weeks are behind, and today is day 3 of week 4.
    const began = addDays(TODAY, -23)
    const t = buildTimeline(
        inputs({
            plans: [plan(began, 16)],
            phases: [phase(began, addDays(began, 16 * 7 - 1), 'cut', 2100)],
            weightLogs: [weigh(addDays(began, 2), 92), weigh(addDays(began, 12), 91.2, 23), weigh(TODAY, 90, 22)],
            workoutLogs: [lift(addDays(began, 8), 'Back squat', 100, 5), lift(addDays(began, 15), 'Back squat', 102.5, 5)],
        })
    )

    it('starts at the earliest plan, with the past weeks from the records', () => {
        expect(t.chainStart).toBe(began)
        expect(t.past.map((w) => w.index)).toEqual([1, 2, 3])
        expect(t.past[0].weight).toBeCloseTo(92)
        expect(t.past[1].bodyFat).toBeCloseTo(23)
        expect(t.past[2].weight).toBeNull()
        expect(t.past[1].lifts[0].kg).toBeCloseTo(100 * (1 + 5 / 30))
        expect(t.past[0].lifts[0].kg).toBeNull()
    })

    it('carries on counting from this week, on the same grid', () => {
        const now = t.weeks[0]
        expect(now.index).toBe(4)
        expect(now.start).toBe(addDays(began, 21))
        expect(now.start <= TODAY && now.end >= TODAY).toBe(true)
        expect(t.weeks[1].start).toBe(addDays(now.end, 1))
    })
})

describe('milestones count from the start of the plans', () => {
    // Six weeks into a 16-week cut, with 4 kg off the scale already.
    const began = addDays(TODAY, -42)
    const given = (start: string) =>
        inputs({
            plans: [plan(start, 16)],
            phases: [phase(start, addDays(start, 16 * 7 - 1), 'cut', 2100)],
            weightLogs: [
                weigh(began, 96),
                weigh(addDays(began, 14), 94.5),
                weigh(addDays(began, 28), 93),
                weigh(TODAY, 92),
            ],
        })
    const t = buildTimeline(given(began))
    const titles = (x: typeof t) => x.weeks.flatMap((w) => w.milestones).map((m) => m.title)

    it('reads what’s already done off the weigh-ins, less the cut’s first water', () => {
        expect(t.since.weight).toBeCloseTo(96)
        // Trend about 92.1 today, minus 0.8 kg of glycogen water.
        expect(t.since.fat).toBeGreaterThan(2.5)
        expect(t.since.fat).toBeLessThan(3.5)
        expect(t.since.lean).toBe(0)
    })

    it('doesn’t promise the fat steps already passed', () => {
        expect(titles(t)).not.toContain('First kilo of fat gone')
        expect(titles(t)).not.toContain('Waistband feels looser')
        expect(titles(t)).toContain('Leaner in photos')
        // Starting today, the same plans would still have them ahead.
        expect(titles(buildTimeline(given(TODAY)))).toContain('First kilo of fat gone')
    })

    it('puts halfway at the middle of the plans, measured from their start', () => {
        const half = t.weeks.flatMap((w) => w.milestones).find((m) => m.title === 'Halfway there')!
        expect(half.date).toBe(addDays(began, 55))
        expect(half.detail).toContain('down on the scale so far')
    })

    it('counts nothing when the plans start today', () => {
        const fresh = buildTimeline(given(TODAY))
        expect(fresh.since).toEqual({ weight: fresh.initial.weight, fat: 0, lean: 0 })
    })
})

describe('startingPoint', () => {
    it('uses a recent logged body fat first, then the quiz, then an estimate', () => {
        expect(startingPoint(inputs()).bodyFatSource).toBe('logged')
        expect(startingPoint(inputs({ weightLogs: [weigh(TODAY, 90)], quiz: { ...QUIZ, bodyFatPct: 18 } }))).toMatchObject({
            bodyFat: 18,
            bodyFatSource: 'quiz',
        })
        const est = startingPoint(inputs({ weightLogs: [weigh(TODAY, 90)] }))
        expect(est.bodyFatSource).toBe('estimated')
        expect(est.bodyFat).toBeGreaterThan(15)
        expect(est.bodyFat).toBeLessThan(30)
    })
})

describe('calibrate', () => {
    it('needs a fortnight of weigh-ins', () => {
        expect(calibrate(inputs({ weightLogs: [weigh(TODAY, 90), weigh(addDays(TODAY, -5), 90.5)] }), 22)).toBeNull()
    })

    it('corrects the burn when the scale moves faster than the plan predicts', () => {
        // In the cut for four weeks already, losing a kilo a week.
        const started = addDays(TODAY, -28)
        const base = inputs({
            plans: [plan(started, 16)],
            phases: [phase(started, addDays(TODAY, 83), 'cut', 2100)],
        })
        const logs = Array.from({ length: 29 }, (_, i) => weigh(addDays(started, i), 94 - (4 * i) / 28))
        const cal = calibrate({ ...base, weightLogs: logs }, 22)!
        expect(cal).not.toBeNull()
        expect(cal.observedRate).toBeLessThan(cal.predictedRate)
        expect(cal.offsetKcal).toBeLessThan(0)

        const plain = buildTimeline({ ...base, weightLogs: [weigh(TODAY, logs[28].weight, 22)] })
        const calibrated = buildTimeline({ ...base, weightLogs: logs.map((l, i) => (i === 28 ? { ...l, bodyFat: 22 } : l)) })
        expect(calibrated.final.weight.mid).toBeLessThan(plain.final.weight.mid)
        // More data, tighter range.
        const w = (t: typeof plain) => t.final.weight.high - t.final.weight.low
        expect(w(calibrated)).toBeLessThan(w(plain))
    })
})

describe('helpers', () => {
    it('merges back-to-back cuts into one run', () => {
        const runs = cutRuns([
            phase('2026-11-02', '2026-11-29', 'cut'),
            phase('2026-11-30', '2026-12-27', 'cut'),
            phase('2026-12-28', '2027-01-24', 'maintain'),
        ])
        expect(runs).toEqual([{ start: '2026-11-02', end: '2026-12-27', refeedAfter: true }])
    })

    it('ramps water in and back out', () => {
        const water = makeWater(QUIZ, [phase('2026-11-02', '2026-11-29', 'cut'), phase('2026-11-30', '2026-12-27', 'maintain')])
        expect(water('2026-11-01')).toBe(0)
        expect(water('2026-11-12')).toBeCloseTo(-0.8)
        expect(water('2026-12-20')).toBeCloseTo(0)
    })

    it('counts each scheduled session once across overlapping plans', () => {
        const a = plan(TODAY, 1)
        const sessions = sessionsByDate([a, { ...a, _id: 'copy' }])
        expect(sessions.get(TODAY)).toEqual({ strength: 1, cardio: 0 })
        expect(sessions.get(addDays(TODAY, 1))).toEqual({ strength: 0, cardio: 1 })
    })
})

describe('measured adherence', () => {
    const START = addDays(TODAY, -28) // a Monday, four weeks back
    const running = () => [plan(START, 16)]

    /** Logs for the plan's sessions in the last four weeks, keeping every `keep`-th one. */
    function logs(keep: (i: number) => boolean, shift = 0) {
        const workoutLogs: WorkoutLog[] = []
        const conditioningLogs: ConditioningLog[] = []
        running()[0]
            .schedule!.filter((e) => e.date < TODAY)
            .forEach((e, i) => {
                if (!keep(i)) return
                const date = addDays(e.date, shift)
                if (e.kind === 'workout') workoutLogs.push({ ...lift(date, 'Squat', 100, 5), workout: e.item })
                else conditioningLogs.push({ _id: `${date}-${e.item}`, session: e.item, date } as ConditioningLog)
            })
        return { workoutLogs, conditioningLogs }
    }

    function ate(date: string, calories: number): MealPlanEntry {
        return {
            _id: `${date}-${calories}`,
            date,
            slot: 'lunch',
            name: 'Food',
            macros: { calories, protein: 0, carbs: 0, fat: 0 },
            status: 'eaten',
            extra: false,
            order: 0,
            createdAt: '',
            updatedAt: '',
        } as MealPlanEntry
    }

    it('counts scheduled sessions done against the logs, a day either side allowed', () => {
        const half = measureTraining(inputs({ plans: running(), ...logs((i) => i % 2 === 0) }))
        expect(half.total).toBe(20)
        expect(half.hit).toBe(10)
        expect(half.measured).toBeCloseTo(0.5)
        expect(half.days).toBe(28)
        expect(half.used).toBeCloseTo(0.5)

        const moved = measureTraining(inputs({ plans: running(), ...logs(() => true, 1) }))
        expect(moved.hit).toBe(20)
    })

    it('leaves the quiz alone without evidence, or with no logs at all', () => {
        const fresh = measureTraining(inputs())
        expect(fresh.measured).toBeNull()
        expect(fresh.used).toBe(QUIZ.trainingAdherence)
        const unlogged = measureTraining(inputs({ plans: running() }))
        expect(unlogged.measured).toBeNull()
        expect(unlogged.used).toBe(QUIZ.trainingAdherence)
    })

    it('trusts the logs more the more days there are', () => {
        const recent = [plan(addDays(TODAY, -14), 14)]
        const workoutLogs = [{ ...lift(addDays(TODAY, -14), 'Squat', 100, 5), workout: 'w0' }]
        const r = measureTraining(inputs({ plans: recent, workoutLogs }))
        expect(r.days).toBe(14)
        expect(r.weight).toBeCloseTo(0.5)
        expect(r.used).toBeCloseTo(0.9 * 0.5 + r.measured! * 0.5)
    })

    it('counts logged days on target, skipping days with nothing logged', () => {
        const cut = phase(START, addDays(TODAY, 83), 'cut', 2000)
        const mealEntries = [
            // 10 days on target (one a little under, fine on a cut), 2 well over, the rest unlogged.
            ...Array.from({ length: 9 }, (_, i) => ate(addDays(START, i), 2050)),
            ate(addDays(START, 9), 1850),
            ate(addDays(START, 10), 2600),
            ate(addDays(START, 11), 2500),
            ate(TODAY, 4000), // today isn't over
        ]
        const r = measureNutrition(inputs({ phases: [cut], mealEntries }))
        expect(r.total).toBe(12)
        expect(r.hit).toBe(10)
        expect(r.days).toBe(12)
        expect(r.weight).toBeCloseTo(12 / 28)
    })

    it('projects with the blend, and says so in the suggestions', () => {
        const cut = phase(START, addDays(TODAY, 83), 'cut', 2100)
        const stated = buildTimeline(inputs({ plans: running(), phases: [cut], quiz: { ...QUIZ, trainingAdherence: 1, nutritionAdherence: 1 } }))
        const measured = buildTimeline(
            inputs({
                plans: running(),
                phases: [cut],
                quiz: { ...QUIZ, trainingAdherence: 1, nutritionAdherence: 1 },
                ...logs((i) => i % 2 === 0),
            })
        )
        expect(stated.perfect).toBeNull()
        expect(measured.adherence.training.used).toBeCloseTo(0.5)
        expect(measured.adherence.training.stated).toBe(1)
        expect(measured.perfect).not.toBeNull()
        expect(measured.final.weight.mid).toBeGreaterThan(stated.final.weight.mid)
        const training = measured.suggestions.find((s) => s.key === 'training')
        expect(training?.detail).toContain('10 of 20 sessions')
    })
})
