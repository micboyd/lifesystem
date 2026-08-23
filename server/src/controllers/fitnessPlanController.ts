import { Response } from 'express'
import { FilterQuery, Model, Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import FitnessPlanEntry, {
    FITNESS_PLAN_KINDS,
    FitnessPlanKind,
    FITNESS_PLAN_PARTS,
    FitnessPlanPart,
} from '../models/FitnessPlanEntry'
import FitnessPlanNote, {
    FITNESS_NOTE_SCOPES,
    FitnessNoteScope,
    FITNESS_FLAG_COLORS,
    FitnessFlagColor,
} from '../models/FitnessPlanNote'
import Workout from '../models/Workout'
import ConditioningSession from '../models/ConditioningSession'
import Recovery from '../models/Recovery'
import Mobility from '../models/Mobility'
import TrainingPlan from '../models/TrainingPlan'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

/** The seven "YYYY-MM-DD" day keys of the week starting on `start` (inclusive). */
function weekDays(start: string): string[] {
    const [y, m, d] = start.split('-').map(Number)
    return Array.from({ length: 7 }, (_, i) => {
        const dt = new Date(Date.UTC(y, m - 1, d + i))
        return dt.toISOString().slice(0, 10)
    })
}

function isKind(v: unknown): v is FitnessPlanKind {
    return typeof v === 'string' && FITNESS_PLAN_KINDS.includes(v as FitnessPlanKind)
}

function isPart(v: unknown): v is FitnessPlanPart {
    return typeof v === 'string' && FITNESS_PLAN_PARTS.includes(v as FitnessPlanPart)
}

function isScope(v: unknown): v is FitnessNoteScope {
    return typeof v === 'string' && FITNESS_NOTE_SCOPES.includes(v as FitnessNoteScope)
}

function isColor(v: unknown): v is FitnessFlagColor {
    return typeof v === 'string' && FITNESS_FLAG_COLORS.includes(v as FitnessFlagColor)
}

/** Keep the slot if recognised, else fall back to the morning slot. */
function toPart(v: unknown): FitnessPlanPart {
    return FITNESS_PLAN_PARTS.includes(v as FitnessPlanPart)
        ? (v as FitnessPlanPart)
        : FITNESS_PLAN_PARTS[0]
}

/** True when the entry's referenced library item still exists after populate. */
function isResolved(e: {
    kind: FitnessPlanKind
    workout: unknown
    session: unknown
    recovery: unknown
    mobility: unknown
}): boolean {
    if (e.kind === 'workout') return !!e.workout
    if (e.kind === 'conditioning') return !!e.session
    if (e.kind === 'mobility') return !!e.mobility
    return !!e.recovery
}

/**
 * GET /api/fitness-plan?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List a user's planned training in a date range, with each item populated so the
 * client can render it. Entries whose library item was deleted are dropped.
 */
export async function listEntries(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }

    const entries = await FitnessPlanEntry.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    })
        .sort({ date: 1, order: 1, createdAt: 1 })
        .populate('workout')
        .populate('session')
        .populate('recovery')
        .populate('mobility')

    res.json({ message: 'OK', data: entries.filter(isResolved) })
}

/** POST /api/fitness-plan — place a workout, session or recovery item onto a day. */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, kind, item: itemId } = req.body
    if (!isDate(date) || !isKind(kind) || typeof itemId !== 'string') {
        res.status(400).json({ message: 'date, kind and item are required' })
        return
    }
    const part = toPart(req.body.part)

    // The referenced library item must exist and belong to the requesting user.
    if (kind === 'workout') {
        const workout = await Workout.findOne({ _id: itemId, user: req.userId })
        if (!workout) {
            res.status(404).json({ message: 'Workout not found' })
            return
        }
    } else if (kind === 'conditioning') {
        const session = await ConditioningSession.findOne({ _id: itemId, user: req.userId })
        if (!session) {
            res.status(404).json({ message: 'Session not found' })
            return
        }
    } else if (kind === 'mobility') {
        const mobility = await Mobility.findOne({ _id: itemId, user: req.userId })
        if (!mobility) {
            res.status(404).json({ message: 'Mobility routine not found' })
            return
        }
    } else {
        const recovery = await Recovery.findOne({ _id: itemId, user: req.userId })
        if (!recovery) {
            res.status(404).json({ message: 'Recovery item not found' })
            return
        }
    }

    const last = await FitnessPlanEntry.findOne({ user: req.userId, date, part }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const entry = await FitnessPlanEntry.create({
        user: req.userId,
        date,
        part,
        kind,
        workout: kind === 'workout' ? itemId : null,
        session: kind === 'conditioning' ? itemId : null,
        recovery: kind === 'recovery' ? itemId : null,
        mobility: kind === 'mobility' ? itemId : null,
        order,
    })
    await entry.populate('workout')
    await entry.populate('session')
    await entry.populate('recovery')
    await entry.populate('mobility')
    res.status(201).json({ message: 'Created', data: entry })
}

/**
 * PATCH /api/fitness-plan/:id — move an entry to a different slot of its day,
 * and/or accept a warning raised against it. A move appends the entry to the end
 * of the target slot; `ignoreClash` silences the calendar-clash warning for this
 * entry, `ignoreOverload` the doubled-up-slot one.
 * Body: { part?, ignoreClash?, ignoreOverload? } — at least one, any on its own.
 */
export async function updateEntry(req: AuthRequest, res: Response) {
    const { part, ignoreClash, ignoreOverload } = req.body
    const moving = part !== undefined
    const overriding = ignoreClash !== undefined
    const overloading = ignoreOverload !== undefined
    if (!moving && !overriding && !overloading) {
        res.status(400).json({ message: 'part, ignoreClash or ignoreOverload is required' })
        return
    }
    if (moving && !isPart(part)) {
        res.status(400).json({ message: 'part must be morning, afternoon or evening' })
        return
    }
    if (overriding && typeof ignoreClash !== 'boolean') {
        res.status(400).json({ message: 'ignoreClash must be true or false' })
        return
    }
    if (overloading && typeof ignoreOverload !== 'boolean') {
        res.status(400).json({ message: 'ignoreOverload must be true or false' })
        return
    }

    const entry = await FitnessPlanEntry.findOne({ _id: req.params.id, user: req.userId })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }

    if (moving && entry.part !== part) {
        const last = await FitnessPlanEntry.findOne({
            user: req.userId,
            date: entry.date,
            part,
        }).sort({ order: -1 })
        entry.part = part
        entry.order = last ? last.order + 1 : 0
    }
    if (overriding) entry.ignoreClash = ignoreClash
    if (overloading) entry.ignoreOverload = ignoreOverload

    if (entry.isModified()) await entry.save()

    await entry.populate('workout')
    await entry.populate('session')
    await entry.populate('recovery')
    await entry.populate('mobility')
    res.json({ message: 'Updated', data: entry })
}

/**
 * PUT /api/fitness-plan/reorder — set the top-to-bottom order of a day's slot.
 * Body: { date, part, ids } — `ids` lists the target slot's entries in their new
 * order. Each listed entry is moved onto `date` + `part` and given order = its
 * index, so this covers reordering within a slot, a move to another slot, and a
 * drag across to another day. Only the caller's own entries are touched.
 */
export async function reorderSlot(req: AuthRequest, res: Response) {
    const { date, part } = req.body
    const ids = req.body.ids
    if (!isDate(date) || !isPart(part)) {
        res.status(400).json({
            message: 'date (YYYY-MM-DD) and part (morning|afternoon|evening) are required',
        })
        return
    }
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
        res.status(400).json({ message: 'ids must be an array of entry ids' })
        return
    }

    // Restrict to the caller's own entries, so a stray id can't drag an unrelated
    // entry into the slot. Non-owned ids are silently skipped.
    const owned = await FitnessPlanEntry.find({
        user: req.userId,
        _id: { $in: ids },
    }).select('_id')
    const ownedIds = new Set(owned.map((e) => String(e._id)))

    const ops = ids
        .filter((id) => ownedIds.has(id))
        .map((id, index) => ({
            updateOne: {
                filter: { _id: id, user: req.userId },
                update: { $set: { date, part, order: index } },
            },
        }))

    if (ops.length > 0) await FitnessPlanEntry.bulkWrite(ops)
    res.json({ message: 'OK', data: { reordered: ops.length } })
}

/** DELETE /api/fitness-plan/:id — remove a planned item. */
export async function deleteEntry(req: AuthRequest, res: Response) {
    const entry = await FitnessPlanEntry.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Deleted', data: entry })
}

/**
 * POST /api/fitness-plan/copy-week — copy one week's plan onto another, for the
 * chosen categories only. Each item keeps its weekday, slot and order; only the
 * selected `kinds` in the target week are replaced (other categories untouched).
 * Body: { from: Monday, to: Monday, kinds: FitnessPlanKind[] }.
 */
export async function copyWeek(req: AuthRequest, res: Response) {
    const { from, to } = req.body
    const kinds = req.body.kinds
    if (!isDate(from) || !isDate(to)) {
        res.status(400).json({ message: 'from and to (YYYY-MM-DD) are required' })
        return
    }
    if (!Array.isArray(kinds) || kinds.length === 0 || !kinds.every(isKind)) {
        res.status(400).json({ message: 'kinds must be a non-empty array of plan kinds' })
        return
    }
    const uniqueKinds = [...new Set(kinds as FitnessPlanKind[])]

    const fromDays = weekDays(from)
    const toDays = weekDays(to)
    // Same week + same day keys → nothing to do (copying onto itself).
    if (from === to) {
        res.json({ message: 'OK', data: [] })
        return
    }

    // Wipe the selected categories from the target week, then clone the source.
    await FitnessPlanEntry.deleteMany({
        user: req.userId,
        date: { $in: toDays },
        kind: { $in: uniqueKinds },
    })

    const source = await FitnessPlanEntry.find({
        user: req.userId,
        date: { $in: fromDays },
        kind: { $in: uniqueKinds },
    }).sort({ date: 1, order: 1, createdAt: 1 })

    const dateMap = new Map(fromDays.map((d, i) => [d, toDays[i]]))
    const docs = source.map((e) => ({
        user: req.userId,
        date: dateMap.get(e.date),
        part: e.part,
        kind: e.kind,
        workout: e.workout,
        session: e.session,
        recovery: e.recovery,
        mobility: e.mobility,
        order: e.order,
    }))

    if (docs.length > 0) await FitnessPlanEntry.insertMany(docs)
    res.json({ message: 'OK', data: { copied: docs.length } })
}

/**
 * POST /api/fitness-plan/clear — delete every planned entry whose date falls in
 * [start, end] (inclusive). Clears a single day (start === end) or a whole week.
 * Flag notes are left untouched. Body: { start: YYYY-MM-DD, end: YYYY-MM-DD }.
 */
export async function clearRange(req: AuthRequest, res: Response) {
    const { start, end } = req.body
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }
    if (end < start) {
        res.status(400).json({ message: 'end must not be before start' })
        return
    }
    // Dates are zero-padded ISO strings, so a lexicographic range is a date range.
    const { deletedCount } = await FitnessPlanEntry.deleteMany({
        user: req.userId,
        date: { $gte: start, $lte: end },
    })
    res.json({ message: 'OK', data: { cleared: deletedCount ?? 0 } })
}

// ─── Restoring a week ───────────────────────────────────────────────────────────

/** Payload rows that are objects. Anything else in the array is ignored. */
function rows(raw: unknown): Record<string, unknown>[] {
    if (!Array.isArray(raw)) return []
    return raw.filter(
        (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r)
    )
}

/** Which of `ids` name a document in `model` belonging to `user`. */
async function ownedIds<T>(model: Model<T>, user: string, ids: string[]): Promise<Set<string>> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id))
    if (valid.length === 0) return new Set()
    const docs = await model
        .find({ _id: { $in: valid }, user } as FilterQuery<T>)
        .select('_id')
        .lean<{ _id: Types.ObjectId }[]>()
    return new Set(docs.map((d) => String(d._id)))
}

/** One planned item as the client wants it put back. */
interface RestoredEntry {
    date: string
    part: FitnessPlanPart
    kind: FitnessPlanKind
    /** The library item's id. */
    item: string
    /** The training plan that placed it, or null when it was placed by hand. */
    plan: string | null
    order: number
    /** Whether its calendar clash had been accepted. */
    ignoreClash: boolean
    /** Whether its overloaded slot had been accepted. */
    ignoreOverload: boolean
}

/**
 * PUT /api/fitness-plan/week — make [start, end] look exactly like the payload.
 *
 * The planner writes each change straight through as it's made, so cancelling an
 * edit can't unwind a queue of saves. Instead the client keeps the week as it was
 * when editing began and hands it back here, and this replaces the window
 * wholesale — one operation whatever was done in between, and no dependence on
 * the ids of entries that have since been deleted.
 *
 * Body: { start, end, entries: RestoredEntry[], notes: [{scope,date,color,label}] }.
 * Rows naming a library item or plan the caller doesn't own are dropped rather
 * than trusted, so a snapshot can only ever put back the caller's own training.
 */
export async function restoreWeek(req: AuthRequest, res: Response) {
    const { start, end } = req.body
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }
    if (end < start) {
        res.status(400).json({ message: 'end must not be before start' })
        return
    }
    const userId = req.userId!

    const wanted: RestoredEntry[] = []
    rows(req.body.entries).forEach((r, i) => {
        if (!isDate(r.date) || r.date < start || r.date > end) return
        if (!isKind(r.kind) || typeof r.item !== 'string') return
        wanted.push({
            date: r.date,
            part: toPart(r.part),
            kind: r.kind,
            item: r.item,
            plan: typeof r.plan === 'string' ? r.plan : null,
            order: typeof r.order === 'number' ? r.order : i,
            ignoreClash: r.ignoreClash === true,
            ignoreOverload: r.ignoreOverload === true,
        })
    })

    const idsOf = (kind: FitnessPlanKind) =>
        wanted.filter((e) => e.kind === kind).map((e) => e.item)
    const [workouts, sessions, mobility, recovery, plans] = await Promise.all([
        ownedIds(Workout, userId, idsOf('workout')),
        ownedIds(ConditioningSession, userId, idsOf('conditioning')),
        ownedIds(Mobility, userId, idsOf('mobility')),
        ownedIds(Recovery, userId, idsOf('recovery')),
        ownedIds(
            TrainingPlan,
            userId,
            wanted.map((e) => e.plan).filter((p): p is string => p !== null)
        ),
    ])
    const owned: Record<FitnessPlanKind, Set<string>> = {
        workout: workouts,
        conditioning: sessions,
        mobility,
        recovery,
    }

    const docs = wanted
        .filter((e) => owned[e.kind].has(e.item))
        .map((e) => ({
            user: userId,
            date: e.date,
            part: e.part,
            kind: e.kind,
            workout: e.kind === 'workout' ? e.item : null,
            session: e.kind === 'conditioning' ? e.item : null,
            recovery: e.kind === 'recovery' ? e.item : null,
            mobility: e.kind === 'mobility' ? e.item : null,
            // Keeping the stamp matters: it's what lets a plan be un-applied later
            // without disturbing anything placed by hand.
            plan: e.plan && plans.has(e.plan) ? e.plan : null,
            order: e.order,
            ignoreClash: e.ignoreClash,
            ignoreOverload: e.ignoreOverload,
        }))

    const noteDocs = rows(req.body.notes)
        .filter(
            (n) =>
                isScope(n.scope) &&
                isDate(n.date) &&
                n.date >= start &&
                n.date <= end &&
                isColor(n.color)
        )
        .map((n) => ({
            user: userId,
            scope: n.scope as FitnessNoteScope,
            date: n.date as string,
            color: n.color as FitnessFlagColor,
            label: typeof n.label === 'string' ? n.label.trim() : '',
        }))

    await FitnessPlanEntry.deleteMany({ user: userId, date: { $gte: start, $lte: end } })
    if (docs.length > 0) await FitnessPlanEntry.insertMany(docs)

    // A week flag is stored on its own Monday, which is inside the window, so
    // clearing the range never reaches a neighbouring week's flag.
    await FitnessPlanNote.deleteMany({ user: userId, date: { $gte: start, $lte: end } })
    if (noteDocs.length > 0) await FitnessPlanNote.insertMany(noteDocs)

    res.json({ message: 'OK', data: { entries: docs.length, notes: noteDocs.length } })
}

/**
 * GET /api/fitness-plan/notes?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List the user's day/week flag+label notes whose date falls in the range. Week
 * notes are keyed by their Monday, so a week view's range includes its own note.
 */
export async function listNotes(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }

    const notes = await FitnessPlanNote.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    }).sort({ date: 1 })

    res.json({ message: 'OK', data: notes })
}

/**
 * PUT /api/fitness-plan/notes — create or update the note for one day or week.
 * Upserts on (user, scope, date). An empty label with no colour clears the note
 * instead (nothing left to flag), so toggling a flag off removes it.
 * Body: { scope: 'day'|'week', date, color, label }.
 */
export async function saveNote(req: AuthRequest, res: Response) {
    const { scope, date, color } = req.body
    const label = typeof req.body.label === 'string' ? req.body.label.trim() : ''
    if (!isScope(scope) || !isDate(date)) {
        res.status(400).json({ message: 'scope (day|week) and date (YYYY-MM-DD) are required' })
        return
    }
    if (!isColor(color)) {
        res.status(400).json({ message: 'color must be one of the flag colours' })
        return
    }

    const note = await FitnessPlanNote.findOneAndUpdate(
        { user: req.userId, scope, date },
        { $set: { color, label }, $setOnInsert: { user: req.userId, scope, date } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    res.json({ message: 'Saved', data: note })
}

/** DELETE /api/fitness-plan/notes/:id — remove a day or week flag. */
export async function deleteNote(req: AuthRequest, res: Response) {
    const note = await FitnessPlanNote.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!note) {
        res.status(404).json({ message: 'Note not found' })
        return
    }
    res.json({ message: 'Deleted', data: note })
}
