/**
 * Rebuild the document a training plan was imported from.
 *
 * A saved plan is a reduced form of its source: the prose is kept verbatim, but
 * the libraries it named are replaced by links, and the weekday templates and
 * dated sessions are flattened into one materialised schedule. Exporting walks
 * that back — library bodies are read out of the libraries the plan points at,
 * and each session's day or date is recovered from the schedule — so the result
 * is a document `POST /api/plans/import` accepts and that rebuilds the same plan.
 *
 * The export reflects the libraries as they are *now*, not as they were pasted:
 * an exercise you have since retitled or re-prescribed comes back with your
 * version. That is the point — it makes export the way to get a plan out, edit
 * it as a whole and put it back.
 */

import { Types } from 'mongoose'
import { IPlanItem, ITrainingPlan } from '../models/TrainingPlan'
import { FitnessPlanKind } from '../models/FitnessPlanEntry'
import { ISessionPart } from '../models/ConditioningSession'
import { IMobilityPart } from '../models/Mobility'
import { IWorkoutExercise } from '../models/Workout'
import Exercise from '../models/Exercise'
import Workout from '../models/Workout'
import ConditioningSession from '../models/ConditioningSession'
import Mobility from '../models/Mobility'
import Recovery from '../models/Recovery'
import { DEFAULT_PART, WEEKDAY_NAMES, weekdayOf, weekdaysBetween } from './planSchedule'

// ─── Shapes read back out of the libraries ──────────────────────────────────────

interface Lean {
    _id: Types.ObjectId
    name: string
}
interface ExerciseLean extends Lean {
    description?: string
}
interface WorkoutLean extends Lean {
    description?: string
    duration: number
    exercises: IWorkoutExercise[]
}
interface SessionLean extends Lean {
    duration: number
    category: string
    purpose?: string
    parts: ISessionPart[]
    howToUse?: string
}
interface MobilityLean extends Lean {
    duration: number
    purpose?: string
    parts: IMobilityPart[]
    howToUse?: string
}
interface RecoveryLean extends Lean {
    duration: number
    purpose?: string
    notes?: string
}

// ─── Small writers ──────────────────────────────────────────────────────────────

/**
 * Drop keys the importer would read as absent anyway — undefined, empty strings
 * and empty arrays — so the exported document reads like something a person
 * wrote rather than a dump of every optional field. `null` is kept: an override
 * uses it to mean "empty this category", which is not the same as leaving it out.
 */
function compact(o: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(o)) {
        if (value === undefined || value === '') continue
        if (Array.isArray(value) && value.length === 0) continue
        out[key] = value
    }
    return out
}

/** A duration worth writing down. 0 is the model's default for "not set". */
function duration(minutes: number): number | undefined {
    return minutes > 0 ? minutes : undefined
}

/** Index library docs by id so the plan's own item order can drive the output. */
function index<T extends Lean>(docs: T[]): Map<string, T> {
    return new Map(docs.map((d) => [String(d._id), d]))
}

// ─── Recovering days and dates from the schedule ────────────────────────────────

/**
 * The weekday a workout repeats on, or undefined when it doesn't repeat.
 *
 * Strength workouts name a weekday in the source and are expanded across the
 * whole plan window, so the schedule is the only record of which day that was.
 * A workout an override dropped onto one or two odd days must *not* come back
 * with a `day` — that would turn a one-off into a weekly fixture — so a weekday
 * only counts when the workout lands on more than half of its occurrences in
 * the plan window.
 */
function recurringWeekday(dates: string[], planStart: string, planEnd: string): string | undefined {
    const counts = new Map<number, number>()
    for (const date of dates) {
        const weekday = weekdayOf(date)
        if (weekday === null) continue
        counts.set(weekday, (counts.get(weekday) ?? 0) + 1)
    }
    let best: number | null = null
    for (const [weekday, hits] of counts) {
        if (best === null || hits > counts.get(best)!) best = weekday
    }
    if (best === null) return undefined
    const occurrences = weekdaysBetween(planStart, planEnd, best).length
    return counts.get(best)! * 2 > occurrences ? WEEKDAY_NAMES[best] : undefined
}

// ─── Building the document ──────────────────────────────────────────────────────

export interface PlanExport {
    /** The plan in the shape `POST /api/plans/import` accepts. */
    document: Record<string, unknown>
    /** Anything the rebuild could not carry across, in plain English. */
    warnings: string[]
}

export async function buildPlanExport(plan: ITrainingPlan): Promise<PlanExport> {
    const user = plan.user
    const warnings: string[] = []
    const schedule = plan.schedule ?? []

    const itemsOfKind = (kind: FitnessPlanKind) => plan.items.filter((i) => i.kind === kind)
    const workoutItems = itemsOfKind('workout')
    const sessionItems = itemsOfKind('conditioning')
    const mobilityItems = itemsOfKind('mobility')
    const recoveryItems = itemsOfKind('recovery')
    const ids = (items: IPlanItem[]) => items.map((i) => i.item)

    const [workoutDocs, sessionDocs, mobilityDocs, recoveryDocs] = await Promise.all([
        Workout.find({ _id: { $in: ids(workoutItems) }, user }).lean<WorkoutLean[]>(),
        ConditioningSession.find({ _id: { $in: ids(sessionItems) }, user }).lean<SessionLean[]>(),
        Mobility.find({ _id: { $in: ids(mobilityItems) }, user }).lean<MobilityLean[]>(),
        Recovery.find({ _id: { $in: ids(recoveryItems) }, user }).lean<RecoveryLean[]>(),
    ])
    const workouts = index(workoutDocs)
    const sessions = index(sessionDocs)
    const mobilities = index(mobilityDocs)
    const recoveries = index(recoveryDocs)

    // A plan links library items rather than owning them, so one can have been
    // deleted since the import. Its name still appears everywhere the plan uses
    // it, so export it as a bare name: re-importing recreates a stub rather than
    // silently dropping the session from the week.
    const missing = (label: string, library: string) =>
        warnings.push(
            `“${label}” is no longer in your ${library} library, so it was exported by name only.`
        )

    /** Placements of one library item, in date order. */
    const placements = (kind: FitnessPlanKind, role: IPlanItem['role'], item: Types.ObjectId) =>
        schedule
            .filter((e) => e.kind === kind && e.role === role && String(e.item) === String(item))
            .sort((a, b) => a.date.localeCompare(b.date))

    /** The slot, written down only when it isn't the default for its kind. */
    const partOf = (kind: FitnessPlanKind, part: string | undefined) =>
        part && part !== DEFAULT_PART[kind] ? part : undefined

    // ── Strength workouts, and the exercises they prescribe ────────────────────
    const exerciseDocs = await Exercise.find({
        _id: { $in: workoutDocs.flatMap((w) => w.exercises.map((e) => e.exercise)) },
        user,
    }).lean<ExerciseLean[]>()
    const exercises = index(exerciseDocs)

    const strengthWorkouts = workoutItems.map((item) => {
        const doc = workouts.get(String(item.item))
        const dates = placements('workout', item.role, item.item)
        const day = recurringWeekday(
            dates.map((e) => e.date),
            plan.planStart,
            plan.planEnd
        )
        const part = partOf('workout', dates[0]?.part)
        if (!doc) {
            missing(item.label, 'strength')
            return compact({ day, name: item.label, part })
        }
        return compact({
            day,
            name: doc.name,
            part,
            duration: duration(doc.duration),
            purpose: doc.description,
            exercises: doc.exercises
                .map((line) => {
                    const exercise = exercises.get(String(line.exercise))
                    if (!exercise) return null
                    return compact({
                        name: exercise.name,
                        sets: line.sets,
                        reps: line.reps,
                        rest: line.rest,
                        notes: line.notes,
                    })
                })
                .filter(Boolean),
        })
    })

    const exerciseLibrary = exerciseDocs.map((e) =>
        compact({ name: e.name, description: e.description })
    )

    // ── Conditioning: the dated run plan, then the session library + calendar ───
    const sessionBody = (doc: SessionLean) =>
        compact({
            name: doc.name,
            duration: duration(doc.duration),
            category: doc.category,
            purpose: doc.purpose,
            parts: doc.parts.map((p) =>
                compact({
                    name: p.name,
                    detail: p.detail,
                    rounds: p.rounds,
                    roundLabel: p.roundLabel,
                    roundDetails: p.roundDetails,
                    roundSeconds: p.roundSeconds,
                    startAtSec: p.startAtSec,
                })
            ),
            howToUse: doc.howToUse,
        })

    // Each run is a one-off written for a specific day, so its date rides on the
    // row itself. Writing the date out explicitly means a re-import never has to
    // parse it back out of the session name.
    const existingRunPlan = sessionItems
        .filter((i) => i.role === 'run')
        .flatMap((item) => {
            const doc = sessions.get(String(item.item))
            if (!doc) missing(item.label, 'conditioning')
            const body = doc ? sessionBody(doc) : { name: item.label }
            const dates = placements('conditioning', 'run', item.item)
            if (dates.length === 0) return [compact(body)]
            return dates.map((e) =>
                compact({
                    ...body,
                    date: e.date,
                    part: partOf('conditioning', e.part),
                    notes: e.notes,
                })
            )
        })

    const postItems = sessionItems.filter((i) => i.role === 'conditioning')
    const post10KSessionLibrary = postItems.map((item) => {
        const doc = sessions.get(String(item.item))
        if (!doc) {
            missing(item.label, 'conditioning')
            return { name: item.label }
        }
        return sessionBody(doc)
    })
    const post10KCalendar = postItems
        .flatMap((item) =>
            placements('conditioning', 'conditioning', item.item).map((e) =>
                compact({
                    date: e.date,
                    session: item.label,
                    part: partOf('conditioning', e.part),
                    notes: e.notes,
                })
            )
        )
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))

    // ── Mobility and recovery ──────────────────────────────────────────────────
    // Both are placed by the weekly template, which is stored verbatim, so these
    // sections only have to carry the routines themselves.
    const mobilityLibrary = mobilityItems.map((item) => {
        const doc = mobilities.get(String(item.item))
        if (!doc) {
            missing(item.label, 'mobility')
            return { name: item.label }
        }
        return compact({
            name: doc.name,
            duration: duration(doc.duration),
            purpose: doc.purpose,
            parts: doc.parts.map((p) => compact({ name: p.name, detail: p.detail })),
            howToUse: doc.howToUse,
        })
    })

    const recoveryLibrary = recoveryItems.map((item) => {
        const doc = recoveries.get(String(item.item))
        if (!doc) {
            missing(item.label, 'recovery')
            return { name: item.label }
        }
        return compact({
            name: doc.name,
            duration: duration(doc.duration),
            purpose: doc.purpose,
            notes: doc.notes,
        })
    })

    // ── Dated exceptions ───────────────────────────────────────────────────────
    // `overrides` on the plan is a summary written for the detail view and can't
    // be read back into rules, so the raw rows are what get exported. Plans
    // imported before those were kept have nothing to give back.
    const sourceOverrides = Array.isArray(plan.sourceOverrides) ? plan.sourceOverrides : []
    if (sourceOverrides.length === 0 && plan.overrides.length > 0) {
        warnings.push(
            `This plan's ${plan.overrides.length} dated exception(s) can't be exported — it was imported before exceptions were kept in their original form. Re-import it once to restore them.`
        )
    }

    const conditioning = compact({ existingRunPlan, post10KSessionLibrary, post10KCalendar })
    const mobility = compact({ library: mobilityLibrary, weeklyUse: plan.mobilityUse })
    const recovery = compact({ library: recoveryLibrary, weeklyUse: plan.recoveryUse })

    const document = compact({
        planName: plan.name,
        planStart: plan.planStart,
        planEnd: plan.planEnd,
        source: plan.source,
        generatedAt: plan.generatedAt,
        goal: plan.goal,
        trainingPhases: plan.phases.map((p) =>
            compact({
                name: p.name,
                dates: p.dates,
                focus: p.focus,
                conditioning: p.conditioning,
                strength: p.strength,
                recoveryPriority: p.recoveryPriority,
            })
        ),
        weeklyTemplate: plan.weeklyTemplate.map((d) =>
            compact({
                day: d.day,
                strength: d.strength,
                conditioning: d.conditioning,
                mobility: d.mobility,
                recovery: d.recovery,
            })
        ),
        exerciseLibrary,
        strengthWorkouts,
        strengthProgression: plan.strengthProgression,
        conditioning: Object.keys(conditioning).length > 0 ? conditioning : undefined,
        mobility: Object.keys(mobility).length > 0 ? mobility : undefined,
        recovery: Object.keys(recovery).length > 0 ? recovery : undefined,
        scheduleOverrides: sourceOverrides,
        readinessRules: plan.readinessRules,
    })

    return { document, warnings }
}
