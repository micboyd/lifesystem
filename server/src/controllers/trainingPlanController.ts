import { Response } from 'express'
import { Model, FilterQuery, Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import TrainingPlan, { IPlanItem, IPlanWarning, PlanRole } from '../models/TrainingPlan'
import FitnessPlanEntry, {
    FITNESS_PLAN_KINDS,
    FITNESS_PLAN_PARTS,
    FitnessPlanKind,
    FitnessPlanPart,
} from '../models/FitnessPlanEntry'
import Exercise from '../models/Exercise'
import Workout from '../models/Workout'
import ConditioningSession, {
    CONDITIONING_CATEGORIES,
    ConditioningCategory,
} from '../models/ConditioningSession'
import Mobility from '../models/Mobility'
import Recovery from '../models/Recovery'
import { toSessionParts } from '../lib/sessionParts'
import { buildPlanExport } from '../lib/planExport'
import {
    ScheduleBuilder,
    applyOverrides,
    dayMs,
    dateFromName,
    matchAllByName,
    matchByName,
    nameKey,
    weekdayIndex,
    weekdaysBetween,
    NamedRef,
} from '../lib/planSchedule'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Which slot each kind lands in by default: prep, then train, then wind down. */
const DEFAULT_PART: Record<FitnessPlanKind, FitnessPlanPart> = {
    mobility: 'morning',
    workout: 'morning',
    conditioning: 'afternoon',
    recovery: 'evening',
}

// ─── Small readers ──────────────────────────────────────────────────────────────

function str(raw: unknown): string | undefined {
    if (typeof raw !== 'string') return undefined
    const t = raw.trim()
    return t === '' ? undefined : t
}

function num(raw: unknown): number | undefined {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 0 ? n : undefined
}

function obj(raw: unknown): Record<string, unknown> | null {
    return raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : null
}

function arr(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return []
    return raw.filter(
        (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)
    )
}

function strList(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    return raw.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean)
}

/** Keep a slot name if recognised, else fall back to the kind's default. */
function toPart(raw: unknown, kind: FitnessPlanKind): FitnessPlanPart {
    return FITNESS_PLAN_PARTS.includes(raw as FitnessPlanPart)
        ? (raw as FitnessPlanPart)
        : DEFAULT_PART[kind]
}

// ─── Library reconciliation ─────────────────────────────────────────────────────

/** One library item the plan wants to exist, keyed by its name. */
interface LibrarySpec {
    name: string
    /** Fields used only when the item has to be created. */
    fields: Record<string, unknown>
}

/** Build specs from a section of the document, skipping rows without a name. */
function toSpecs(
    rows: Record<string, unknown>[],
    fields: (row: Record<string, unknown>) => Record<string, unknown>
): LibrarySpec[] {
    const out: LibrarySpec[] = []
    for (const row of rows) {
        const rowName = str(row.name)
        if (rowName) out.push({ name: rowName, fields: fields(row) })
    }
    return out
}

/** What resolving a library produced: name → item, plus what changed. */
interface Resolved {
    /** Normalised name → the library item it resolved to. */
    byKey: Map<string, NamedRef>
    /** Every item in the library after reconciliation, for prose matching. */
    all: NamedRef[]
    /** Normalised names of the items this import created. */
    created: Set<string>
    /** Normalised names of existing items this import refreshed. */
    updated: Set<string>
}

/** How an import treats a name that already exists in the library. */
interface EnsureOptions {
    /**
     * Refresh matching items from the plan instead of leaving them as they are.
     * The item keeps its `_id`, so anything pointing at it — planner entries,
     * completion logs — stays linked.
     */
    updateExisting?: boolean
    /** Fields to set when creating but never when refreshing, e.g. a pinned flag. */
    createOnly?: string[]
}

/**
 * Match each spec against the user's library by name and create the ones that
 * are missing. By default existing items are left exactly as they are, so
 * importing a plan never rewrites anything tuned by hand; `updateExisting`
 * opts into refreshing them, which is how a corrected plan pushes fixes through.
 */
async function ensureLibrary<T extends { name: string; order: number }>(
    model: Model<T>,
    userId: string,
    specs: LibrarySpec[],
    options: EnsureOptions = {}
): Promise<Resolved> {
    const existing = await model
        .find({ user: userId } as FilterQuery<T>)
        .select('_id name')
        .lean<{ _id: Types.ObjectId; name: string }[]>()

    const byKey = new Map<string, NamedRef>()
    for (const e of existing) byKey.set(nameKey(e.name), { id: String(e._id), name: e.name })

    // De-duplicate the incoming specs by name, keeping the first-seen fields.
    const missing = new Map<string, LibrarySpec>()
    for (const spec of specs) {
        const key = nameKey(spec.name)
        if (!key || byKey.has(key) || missing.has(key)) continue
        missing.set(key, spec)
    }

    const created = new Set<string>()
    if (missing.size > 0) {
        const last = await model
            .findOne({ user: userId } as FilterQuery<T>)
            .sort({ order: -1 })
            .select('order')
            .lean<{ order: number } | null>()
        let order = last ? last.order + 1 : 0
        const entries = [...missing.entries()]
        const docs = entries.map(([, spec]) => ({
            user: userId,
            name: spec.name,
            ...spec.fields,
            order: order++,
        }))
        const inserted = await model.insertMany(docs as never)
        inserted.forEach((doc, i) => {
            const [key, spec] = entries[i]
            byKey.set(key, { id: String((doc as { _id: unknown })._id), name: spec.name })
            created.add(key)
        })
    }

    // Refresh the items that already existed, in place. Keeping each `_id` is the
    // whole point: planner entries and completion logs keep pointing at them.
    const updated = new Set<string>()
    if (options.updateExisting) {
        const skip = new Set(options.createOnly ?? [])
        for (const spec of specs) {
            const key = nameKey(spec.name)
            const ref = byKey.get(key)
            if (!ref || created.has(key) || updated.has(key)) continue
            const fields = Object.fromEntries(
                Object.entries(spec.fields).filter(([k]) => !skip.has(k))
            )
            await model.updateOne({ _id: ref.id, user: userId } as FilterQuery<T>, {
                $set: { name: spec.name, ...fields },
            })
            updated.add(key)
        }
    }

    return { byKey, all: [...byKey.values()], created, updated }
}

// ─── Import ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/plans/import — turn a pasted plan document into a saved plan.
 *
 * The document describes a whole training block: an exercise and session library,
 * weekday strength workouts, a dated run progression, mobility and recovery
 * routines, plus the prose that frames them (goal, phases, progression rules).
 * Importing does three things:
 *
 *  1. adds any library item the plan names that isn't already there — matched by
 *     name, so re-importing a revised plan reuses what you already have;
 *  2. saves the plan itself, linking every item it uses;
 *  3. materialises a day-by-day schedule, expanding weekday templates across the
 *     plan window and resolving dated sessions, so applying it is a plain insert.
 *
 * Nothing is written to the weekly planner here — that happens on apply.
 */
export async function importPlan(req: AuthRequest, res: Response) {
    const doc = obj(req.body)
    if (!doc) {
        res.status(400).json({ message: 'Expected a plan object.' })
        return
    }

    const name = str(doc.planName) ?? str(doc.name)
    if (!name) {
        res.status(400).json({ message: '"planName" is required.' })
        return
    }

    const planStart = str(doc.planStart) ?? ''
    const planEnd = str(doc.planEnd) ?? ''
    if (!DATE_RE.test(planStart) || !DATE_RE.test(planEnd)) {
        res.status(400).json({ message: '"planStart" and "planEnd" must be "YYYY-MM-DD" dates.' })
        return
    }
    if (dayMs(planEnd) < dayMs(planStart)) {
        res.status(400).json({ message: '"planEnd" must not be before "planStart".' })
        return
    }

    const userId = req.userId!
    // Options ride on the query string so the body stays a pasteable plan document.
    const updateExisting = req.query.updateExisting === '1'
    const replaceId = typeof req.query.replace === 'string' ? req.query.replace : null
    const ensure = { updateExisting }

    const warnings: IPlanWarning[] = []
    const conditioningDoc = obj(doc.conditioning) ?? {}
    const mobilityDoc = obj(doc.mobility) ?? {}
    const recoveryDoc = obj(doc.recovery) ?? {}
    const strengthWorkouts = arr(doc.strengthWorkouts)

    // ── Exercises: the named library plus anything a workout references ─────────
    const exerciseSpecs = toSpecs(arr(doc.exerciseLibrary), (e) => ({
        description: str(e.description) ?? '',
    }))
    for (const w of strengthWorkouts) {
        for (const line of arr(w.exercises)) {
            const lineName = str(line.name)
            if (lineName) exerciseSpecs.push({ name: lineName, fields: { description: '' } })
        }
    }
    const exercises = await ensureLibrary(Exercise, userId, exerciseSpecs, ensure)

    // ── Strength workouts ──────────────────────────────────────────────────────
    /** Prescription lines resolved to library exercise ids. */
    function workoutLines(raw: unknown) {
        const out: Record<string, unknown>[] = []
        const used = new Set<string>()
        for (const line of arr(raw)) {
            const lineName = str(line.name)
            if (!lineName) continue
            const key = nameKey(lineName)
            const ref = exercises.byKey.get(key)
            // The workout model holds one slot per exercise, so a repeat within a
            // single workout would overwrite itself — keep the first.
            if (!ref || used.has(key)) continue
            used.add(key)
            // `phase` says when in the block the line applies; it reads as a note.
            const note = str(line.notes)
            const phase = str(line.phase)
            out.push({
                exercise: new Types.ObjectId(ref.id),
                sets: num(line.sets) !== undefined ? Math.round(num(line.sets)!) : undefined,
                reps: str(line.reps),
                rest: str(line.rest),
                notes: note && phase ? `${note} (${phase})` : (note ?? phase),
            })
        }
        return out
    }

    const workoutSpecs = toSpecs(strengthWorkouts, (w) => ({
        description: str(w.purpose) ?? '',
        duration: num(w.duration) ?? 0,
        exercises: workoutLines(w.exercises),
        showInPlanner: false,
    }))
    const workouts = await ensureLibrary(Workout, userId, workoutSpecs, {
        ...ensure,
        createOnly: ['showInPlanner'],
    })

    // ── Conditioning: the dated run plan plus the post-goal session library ─────
    const runPlan = arr(conditioningDoc.existingRunPlan)
    const postLibrary = arr(conditioningDoc.post10KSessionLibrary)
    const sessionFields = (s: Record<string, unknown>) => ({
        duration: num(s.duration) ?? 0,
        category: CONDITIONING_CATEGORIES.includes(s.category as ConditioningCategory)
            ? (s.category as ConditioningCategory)
            : CONDITIONING_CATEGORIES[0],
        purpose: str(s.purpose),
        parts: toSessionParts(s.parts),
        howToUse: str(s.howToUse),
    })
    const runSpecs = toSpecs(runPlan, sessionFields)
    const postSpecs = toSpecs(postLibrary, sessionFields)
    const sessions = await ensureLibrary(
        ConditioningSession,
        userId,
        [...runSpecs, ...postSpecs],
        ensure
    )

    // ── Mobility and recovery libraries ────────────────────────────────────────
    const mobilitySpecs = toSpecs(arr(mobilityDoc.library), (m) => ({
        duration: num(m.duration) ?? 0,
        purpose: str(m.purpose),
        parts: toSessionParts(m.parts),
        howToUse: str(m.howToUse),
    }))
    const mobility = await ensureLibrary(Mobility, userId, mobilitySpecs, ensure)

    const recoverySpecs = toSpecs(arr(recoveryDoc.library), (r) => ({
        duration: num(r.duration) ?? 0,
        purpose: str(r.purpose),
        notes: str(r.notes) ?? str(r.howToUse),
    }))
    const recovery = await ensureLibrary(Recovery, userId, recoverySpecs, ensure)

    // ── Schedule ───────────────────────────────────────────────────────────────
    const schedule = new ScheduleBuilder()

    // Strength: each workout names the weekday it belongs to, repeated weekly.
    for (const w of strengthWorkouts) {
        const ref = workouts.byKey.get(nameKey(str(w.name) ?? ''))
        if (!ref) continue
        const weekday = weekdayIndex(w.day)
        if (weekday === null) {
            warnings.push({
                source: 'strengthWorkouts',
                message: `"${ref.name}" has no recognisable "day", so it wasn't scheduled.`,
            })
            continue
        }
        const part = toPart(w.part, 'workout')
        for (const date of weekdaysBetween(planStart, planEnd, weekday)) {
            schedule.add(date, 'workout', 'strength', ref, part, 'recurring')
        }
    }

    // The run progression: one dated session each, with the date either given
    // outright or carried in the session name ("… - Mon 10 Aug").
    for (const s of runPlan) {
        const sName = str(s.name)
        if (!sName) continue
        const ref = sessions.byKey.get(nameKey(sName))
        if (!ref) continue
        const explicit = str(s.date)
        const date =
            explicit && DATE_RE.test(explicit) ? explicit : dateFromName(sName, planStart, planEnd)
        if (!date) {
            warnings.push({
                source: 'existingRunPlan',
                message: `Couldn't work out a date for "${sName}", so it wasn't scheduled.`,
            })
            continue
        }
        schedule.add(
            date,
            'conditioning',
            'run',
            ref,
            toPart(s.part, 'conditioning'),
            'dated',
            str(s.notes)
        )
    }

    // The post-goal calendar: explicit dates naming a session from the library.
    for (const row of arr(conditioningDoc.post10KCalendar)) {
        const date = str(row.date)
        const sessionName = str(row.session)
        if (!date || !DATE_RE.test(date) || !sessionName) continue
        const ref =
            sessions.byKey.get(nameKey(sessionName)) ?? matchByName(sessionName, sessions.all)
        if (!ref) {
            warnings.push({
                source: 'post10KCalendar',
                message: `No conditioning session matches "${sessionName}" (${date}).`,
            })
            continue
        }
        schedule.add(
            date,
            'conditioning',
            'conditioning',
            ref,
            toPart(row.part, 'conditioning'),
            'dated',
            str(row.notes)
        )
    }

    // The weekly template fills in mobility and recovery, and covers strength for
    // plans that only describe their week in the table. Cells are prose ("Sauna
    // Recovery optional"), so a library name contained in the text counts.
    for (const row of arr(doc.weeklyTemplate)) {
        const weekday = weekdayIndex(row.day)
        if (weekday === null) continue
        const dates = weekdaysBetween(planStart, planEnd, weekday)
        if (dates.length === 0) continue

        // A cell can name more than one routine ("Pre-Run Dynamic Mobility before
        // the run; Upper-Body and Shoulder Mobility before lifting"), and the two
        // columns cross over — Thursday's recovery cell names a mobility routine.
        // So each cell is read against its own library and then the other one: the
        // column decides the role and the slot, the library it was found in decides
        // the kind. That keeps Thursday's stretch linked to the mobility library
        // while still landing in the evening, where the plan puts it.
        const cells = [
            { role: 'mobility', own: 'mobility', other: 'recovery', text: row.mobility },
            { role: 'recovery', own: 'recovery', other: 'mobility', text: row.recovery },
        ] as const
        const libraryOf: Record<'mobility' | 'recovery', Resolved> = { mobility, recovery }

        for (const date of dates) {
            for (const ref of matchAllByName(row.strength, workouts.all)) {
                schedule.add(date, 'workout', 'strength', ref, DEFAULT_PART.workout, 'recurring')
            }
            for (const { role, own, other, text } of cells) {
                const hits = matchAllByName(text, libraryOf[own].all)
                const kind = hits.length ? own : other
                for (const ref of hits.length ? hits : matchAllByName(text, libraryOf[other].all)) {
                    schedule.add(date, kind, role, ref, DEFAULT_PART[role], 'recurring')
                }
            }
        }
    }

    // ── Dated overrides ────────────────────────────────────────────────────────
    // Exceptions to the recurring week — a holiday with no gym access, a match day
    // that replaces the usual session, a deload. Applied last, in document order,
    // so a later override wins over an earlier one covering the same days.
    const {
        applied: overrides,
        refs: overrideRefs,
        problems,
    } = applyOverrides(
        schedule,
        arr(doc.scheduleOverrides),
        {
            workout: workouts.all,
            conditioning: sessions.all,
            mobility: mobility.all,
            recovery: recovery.all,
        },
        toPart
    )
    for (const message of problems) warnings.push({ source: 'scheduleOverrides', message })

    // ── Linked items ───────────────────────────────────────────────────────────
    const items: IPlanItem[] = []
    const pushItems = (
        kind: FitnessPlanKind,
        role: PlanRole,
        resolved: Resolved,
        specs: LibrarySpec[]
    ) => {
        const seen = new Set<string>()
        for (const spec of specs) {
            const key = nameKey(spec.name)
            const ref = resolved.byKey.get(key)
            if (!ref || seen.has(key)) continue
            seen.add(key)
            items.push({
                kind,
                role,
                item: new Types.ObjectId(ref.id),
                label: ref.name,
                created: resolved.created.has(key),
            })
        }
    }
    pushItems('workout', 'strength', workouts, workoutSpecs)
    pushItems('conditioning', 'run', sessions, runSpecs)
    pushItems('conditioning', 'conditioning', sessions, postSpecs)
    pushItems('mobility', 'mobility', mobility, mobilitySpecs)
    pushItems('recovery', 'recovery', recovery, recoverySpecs)

    // An override can name a workout the plan's own sections never mention — a
    // one-off match-day session, say. Link those too, so the plan still points at
    // everything it will place.
    const linked = new Set(items.map((i) => String(i.item)))
    for (const { kind, role, ref } of overrideRefs) {
        if (linked.has(ref.id)) continue
        linked.add(ref.id)
        items.push({
            kind,
            role,
            item: new Types.ObjectId(ref.id),
            label: ref.name,
            created: false,
        })
    }

    const goal = obj(doc.goal) ?? undefined

    // Replacing keeps the plan's `_id`, so planner entries it already placed stay
    // stamped with it — re-applying then cleanly supersedes them instead of
    // doubling up, which creating a second plan of the same name would do.
    const target = replaceId
        ? await TrainingPlan.findOne({ _id: replaceId, user: userId }).select('_id order')
        : null
    if (replaceId && !target) {
        res.status(404).json({ message: 'The plan you asked to replace no longer exists.' })
        return
    }
    const last = target
        ? null
        : await TrainingPlan.findOne({ user: userId }).sort({ order: -1 }).select('order')

    const content = {
        user: userId,
        name,
        source: str(doc.source),
        generatedAt: str(doc.generatedAt),
        planStart,
        planEnd,
        goal,
        phases: arr(doc.trainingPhases).map((p) => ({
            name: str(p.name) ?? 'Phase',
            dates: str(p.dates),
            focus: str(p.focus),
            conditioning: str(p.conditioning),
            strength: str(p.strength),
            recoveryPriority: str(p.recoveryPriority),
        })),
        weeklyTemplate: arr(doc.weeklyTemplate)
            .map((d) => ({
                day: str(d.day) ?? '',
                strength: str(d.strength),
                conditioning: str(d.conditioning),
                mobility: str(d.mobility),
                recovery: str(d.recovery),
            }))
            .filter((d) => d.day !== ''),
        strengthProgression: obj(doc.strengthProgression) ?? undefined,
        mobilityUse: obj(mobilityDoc.weeklyUse) ?? undefined,
        recoveryUse: obj(recoveryDoc.weeklyUse) ?? undefined,
        readinessRules: strList(doc.readinessRules),
        items,
        schedule: schedule.sorted(),
        overrides,
        // Kept verbatim so exporting can hand the rows back: `overrides` above is
        // a summary for the detail view and can't be read back into rules.
        sourceOverrides: arr(doc.scheduleOverrides),
        warnings,
        appliedAt: null,
        order: target ? target.order : last ? last.order + 1 : 0,
    }

    const plan = target
        ? (await TrainingPlan.findOneAndUpdate(
              { _id: target._id, user: userId },
              { $set: content },
              { new: true }
          ))!
        : await TrainingPlan.create(content)

    // A replaced plan's old placements describe the previous schedule, so clear
    // them: the plan is no longer applied until it's applied again.
    const staleEntries = target
        ? ((await FitnessPlanEntry.deleteMany({ user: userId, plan: plan._id })).deletedCount ?? 0)
        : 0

    res.status(201).json({
        message: `Imported “${plan.name}”`,
        data: plan,
        summary: {
            exercisesCreated: exercises.created.size,
            workoutsCreated: workouts.created.size,
            conditioningCreated: sessions.created.size,
            mobilityCreated: mobility.created.size,
            recoveryCreated: recovery.created.size,
            itemsCreated:
                exercises.created.size +
                workouts.created.size +
                sessions.created.size +
                mobility.created.size +
                recovery.created.size,
            itemsUpdated:
                exercises.updated.size +
                workouts.updated.size +
                sessions.updated.size +
                mobility.updated.size +
                recovery.updated.size,
            replacedPlan: !!target,
            staleEntries,
            itemsLinked: items.length,
            scheduled: plan.schedule.length,
            overrides: overrides.length,
            warnings: warnings.length,
        },
    })
}

// ─── Read / delete ──────────────────────────────────────────────────────────────

/** GET /api/plans — the plan library, without the (large) schedule arrays. */
export async function listPlans(req: AuthRequest, res: Response) {
    const plans = await TrainingPlan.find({ user: req.userId })
        .select('-schedule')
        .sort({ order: 1, createdAt: 1 })
    // The planner needs to know how many entries each plan has placed, and the
    // schedule is excluded above, so count entries per plan in one pass.
    const applied = await FitnessPlanEntry.aggregate<{ _id: Types.ObjectId; count: number }>([
        { $match: { user: new Types.ObjectId(req.userId), plan: { $ne: null } } },
        { $group: { _id: '$plan', count: { $sum: 1 } } },
    ])
    const counts = new Map(applied.map((a) => [String(a._id), a.count]))
    res.json({
        message: 'OK',
        data: plans.map((p) => ({
            ...p.toObject(),
            appliedEntries: counts.get(String(p._id)) ?? 0,
        })),
    })
}

/** GET /api/plans/:id — one plan in full, including its schedule. */
export async function getPlan(req: AuthRequest, res: Response) {
    const plan = await TrainingPlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const appliedEntries = await FitnessPlanEntry.countDocuments({
        user: req.userId,
        plan: plan._id,
    })
    res.json({ message: 'OK', data: { ...plan.toObject(), appliedEntries } })
}

/**
 * GET /api/plans/:id/export — the plan as an import document.
 *
 * Round-trips: the result is the same shape `POST /api/plans/import` accepts, so
 * a plan can be pulled out, edited as a whole and pasted back over itself. The
 * library sections are rebuilt from the libraries as they stand now, so anything
 * tuned by hand since the import comes back tuned. `warnings` lists whatever the
 * rebuild couldn't carry across.
 */
export async function exportPlan(req: AuthRequest, res: Response) {
    const plan = await TrainingPlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const { document, warnings } = await buildPlanExport(plan)
    res.json({ message: 'OK', data: document, warnings })
}

/** PATCH /api/plans/:id — rename or reorder a plan. */
export async function updatePlan(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    const newName = str(req.body?.name)
    if (newName) fields.name = newName
    if (typeof req.body?.order === 'number') fields.order = req.body.order

    const plan = await TrainingPlan.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    res.json({ message: 'Saved', data: plan })
}

/**
 * DELETE /api/plans/:id — remove a plan and any planner entries it placed. The
 * library items it created stay; they're shared with the rest of the app.
 */
export async function deletePlan(req: AuthRequest, res: Response) {
    const plan = await TrainingPlan.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const { deletedCount } = await FitnessPlanEntry.deleteMany({ user: req.userId, plan: plan._id })
    res.json({ message: `Deleted “${plan.name}”`, data: plan, removedEntries: deletedCount ?? 0 })
}

// ─── Apply ──────────────────────────────────────────────────────────────────────

/** Read the subset of kinds to apply, defaulting to all of them. */
function readKinds(raw: unknown): FitnessPlanKind[] {
    if (!Array.isArray(raw)) return [...FITNESS_PLAN_KINDS]
    const picked = raw.filter((k): k is FitnessPlanKind =>
        FITNESS_PLAN_KINDS.includes(k as FitnessPlanKind)
    )
    return picked.length ? picked : [...FITNESS_PLAN_KINDS]
}

/** Set the ref field matching `kind`; the others stay null. */
function refFields(kind: FitnessPlanKind, item: Types.ObjectId) {
    return {
        workout: kind === 'workout' ? item : null,
        session: kind === 'conditioning' ? item : null,
        recovery: kind === 'recovery' ? item : null,
        mobility: kind === 'mobility' ? item : null,
    }
}

/**
 * POST /api/plans/:id/apply — push the plan's schedule onto the weekly planner.
 *
 * `start`/`end` narrow the window (defaulting to the whole plan) and `kinds`
 * narrows which libraries are placed, so a plan can be rolled out a block at a
 * time. Entries this plan previously placed inside the window are cleared first,
 * which makes applying idempotent; hand-placed entries are left alone. Set
 * `replace` to also clear entries the plan didn't place.
 */
export async function applyPlan(req: AuthRequest, res: Response) {
    const plan = await TrainingPlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }

    const body = obj(req.body) ?? {}
    const rawStart = str(body.start)
    const rawEnd = str(body.end)
    const start = rawStart && DATE_RE.test(rawStart) ? rawStart : plan.planStart
    const end = rawEnd && DATE_RE.test(rawEnd) ? rawEnd : plan.planEnd
    if (dayMs(end) < dayMs(start)) {
        res.status(400).json({ message: '"end" must not be before "start".' })
        return
    }
    const kinds = readKinds(body.kinds)
    const replace = body.replace === true

    const due = plan.schedule.filter(
        (e) => e.date >= start && e.date <= end && kinds.includes(e.kind)
    )

    // Clear what we're about to re-place so applying twice doesn't duplicate.
    const clearFilter = {
        user: req.userId,
        date: { $gte: start, $lte: end },
        kind: { $in: kinds },
        ...(replace ? {} : { plan: plan._id }),
    }
    const { deletedCount } = await FitnessPlanEntry.deleteMany(clearFilter)

    // Seed each day+slot's `order` from whatever survived the clear, so plan
    // entries append below anything placed by hand.
    const nextOrder = new Map<string, number>()
    if (due.length > 0) {
        const survivors = await FitnessPlanEntry.aggregate<{
            _id: { date: string; part: FitnessPlanPart }
            max: number
        }>([
            {
                $match: {
                    user: new Types.ObjectId(req.userId),
                    date: { $gte: start, $lte: end },
                },
            },
            { $group: { _id: { date: '$date', part: '$part' }, max: { $max: '$order' } } },
        ])
        for (const s of survivors) nextOrder.set(`${s._id.date}|${s._id.part}`, s.max + 1)
    }

    const docs = due.map((e) => {
        const key = `${e.date}|${e.part}`
        const order = nextOrder.get(key) ?? 0
        nextOrder.set(key, order + 1)
        return {
            user: req.userId,
            date: e.date,
            part: e.part,
            kind: e.kind,
            ...refFields(e.kind, e.item),
            plan: plan._id,
            order,
        }
    })

    if (docs.length > 0) await FitnessPlanEntry.insertMany(docs)
    plan.appliedAt = new Date()
    await plan.save()

    res.json({
        message: `Applied ${docs.length} session(s) from “${plan.name}”`,
        data: {
            placed: docs.length,
            removed: deletedCount ?? 0,
            start,
            end,
            kinds,
            // The day the first session actually landed on. A plan can start well
            // after the window's start — or after today — so the planner needs this
            // to open on a week that has something in it.
            firstDate: due.reduce<string | null>(
                (min, e) => (min === null || e.date < min ? e.date : min),
                null
            ),
        },
    })
}

/** DELETE /api/plans/:id/apply — remove every planner entry this plan placed. */
export async function unapplyPlan(req: AuthRequest, res: Response) {
    const plan = await TrainingPlan.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) {
        res.status(404).json({ message: 'Plan not found' })
        return
    }
    const { deletedCount } = await FitnessPlanEntry.deleteMany({ user: req.userId, plan: plan._id })
    plan.appliedAt = null
    await plan.save()
    res.json({
        message: `Removed ${deletedCount ?? 0} planned session(s)`,
        data: { removed: deletedCount ?? 0 },
    })
}
