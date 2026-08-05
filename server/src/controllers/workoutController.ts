import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import Workout, { IWorkoutExercise } from '../models/Workout'
import Exercise from '../models/Exercise'
import { newBatchId, makeLastImportHandler, makeUndoImportHandler } from '../lib/importBatch'
import { nameKey, extractOverwrite } from '../lib/importReconcile'

/** GET /api/workouts/import/last — summarise the most recent import batch. */
export const lastImport = makeLastImportHandler(Workout)
/** DELETE /api/workouts/import/last — revert the most recent import batch. */
export const undoImport = makeUndoImportHandler(Workout)

/** Coerce an optional sets value to a non-negative integer, else undefined. */
function toSets(raw: unknown): number | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || n < 0) return undefined
    return Math.round(n)
}

/** Coerce an optional reps value to a trimmed non-empty string, else undefined. */
function toReps(raw: unknown): string | undefined {
    if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
    if (typeof raw !== 'string') return undefined
    const t = raw.trim()
    return t === '' ? undefined : t
}

/**
 * Normalise a request value into a de-duplicated list of workout exercises that
 * actually belong to the user. Each entry may be a bare exercise id (string) or
 * an object `{ exercise, sets?, reps? }`. Unknown or malformed ids are dropped so
 * a workout never references an exercise the user can't see; submitted order is
 * preserved and an exercise appears at most once.
 */
async function toWorkoutExercises(raw: unknown, userId: unknown): Promise<IWorkoutExercise[]> {
    if (!Array.isArray(raw)) return []
    const entries: { id: string; sets?: number; reps?: string }[] = []
    const seen = new Set<string>()
    for (const item of raw) {
        let id: string | undefined
        let sets: number | undefined
        let reps: string | undefined
        if (typeof item === 'string') {
            id = item
        } else if (item && typeof item === 'object') {
            const o = item as Record<string, unknown>
            if (typeof o.exercise === 'string') id = o.exercise
            sets = toSets(o.sets)
            reps = toReps(o.reps)
        }
        if (!id || !Types.ObjectId.isValid(id) || seen.has(id)) continue
        seen.add(id)
        entries.push({ id, sets, reps })
    }
    if (entries.length === 0) return []

    // Keep only ids the user owns, preserving the submitted order.
    const owned = await Exercise.find({ _id: { $in: entries.map((e) => e.id) }, user: userId }).select(
        '_id'
    )
    const ownedSet = new Set(owned.map((e) => String(e._id)))
    return entries
        .filter((e) => ownedSet.has(e.id))
        .map((e) => ({
            exercise: new Types.ObjectId(e.id),
            ...(e.sets !== undefined ? { sets: e.sets } : {}),
            ...(e.reps !== undefined ? { reps: e.reps } : {}),
        }))
}

/** GET /api/workouts — list the user's workouts in library order. */
export async function listWorkouts(req: AuthRequest, res: Response) {
    const workouts = await Workout.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: workouts })
}

/** POST /api/workouts — create a workout, appended to the end of the library. */
export async function createWorkout(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const last = await Workout.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const workout = await Workout.create({
        user: req.userId,
        name,
        description: typeof req.body.description === 'string' ? req.body.description.trim() : '',
        showInPlanner: req.body.showInPlanner === true,
        exercises: await toWorkoutExercises(req.body.exercises, req.userId),
        order,
    })
    res.status(201).json({ message: 'Created', data: workout })
}

/** PUT /api/workouts/:id — update fields and/or reorder. */
export async function updateWorkout(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (typeof b.description === 'string') fields.description = b.description.trim()
    if (typeof b.showInPlanner === 'boolean') fields.showInPlanner = b.showInPlanner
    if (Array.isArray(b.exercises)) fields.exercises = await toWorkoutExercises(b.exercises, req.userId)
    if (typeof b.order === 'number') fields.order = b.order

    const workout = await Workout.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!workout) {
        res.status(404).json({ message: 'Workout not found' })
        return
    }
    res.json({ message: 'Saved', data: workout })
}

// ─── Import: shared normalisation ───────────────────────────────────────────────

/** One exercise line from an import, before its name is resolved to a library id. */
interface NormExercise {
    name: string
    sets?: number
    reps?: string
}

/** A workout as accepted by the importer, before exercises are resolved to ids. */
interface NormWorkout {
    name: string
    description: string
    showInPlanner: boolean
    /** Exercise lines in first-seen order, de-duplicated by name within the workout. */
    exerciseItems: NormExercise[]
}

/**
 * Canonical key for matching an exercise name: trimmed, lower-cased and with
 * runs of whitespace collapsed, so "Barbell  Bench Press" and "barbell bench
 * press" resolve to the same library exercise.
 */
function normKey(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Pull the workout array out of either a bare array or a `{ workouts: [...] }` object. */
function toWorkoutList(body: unknown): unknown[] | null {
    if (Array.isArray(body)) return body
    if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>).workouts)) {
        return (body as Record<string, unknown>).workouts as unknown[]
    }
    return null
}

/**
 * Validate and normalise a raw workout list. Returns the normalised workouts, or
 * a list of human-readable errors when validation fails (all-or-nothing).
 */
function normaliseWorkouts(rawList: unknown[]): { items: NormWorkout[]; errors: string[] } {
    const errors: string[] = []
    const items: NormWorkout[] = []

    rawList.forEach((raw_item, i) => {
        if (!raw_item || typeof raw_item !== 'object') {
            errors.push(`Workout ${i + 1}: must be an object`)
            return
        }
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) {
            errors.push(`Workout ${i + 1}: "name" is required`)
            return
        }
        // De-duplicate exercise lines within a workout by name, keeping the
        // first-seen casing and its sets/reps. Each entry may be a bare name
        // string or an object `{ name, sets?, reps? }`.
        const exerciseItems: NormExercise[] = []
        const seen = new Set<string>()
        if (Array.isArray(item.exercises)) {
            for (const ex of item.exercises) {
                let exName = ''
                let sets: number | undefined
                let reps: string | undefined
                if (typeof ex === 'string') {
                    exName = ex.trim()
                } else if (ex && typeof ex === 'object') {
                    const o = ex as Record<string, unknown>
                    if (typeof o.name === 'string') exName = o.name.trim()
                    sets = toSets(o.sets)
                    reps = toReps(o.reps)
                }
                if (!exName) continue
                const key = normKey(exName)
                if (seen.has(key)) continue
                seen.add(key)
                exerciseItems.push({ name: exName, sets, reps })
            }
        }
        items.push({
            name,
            description: typeof item.description === 'string' ? item.description.trim() : '',
            showInPlanner: item.showInPlanner === true,
            exerciseItems,
        })
    })

    return { items, errors }
}

/** Every distinct exercise name across all workouts, in first-seen order. */
function distinctExerciseNames(items: NormWorkout[]): { key: string; name: string }[] {
    const seen = new Map<string, string>() // key → first-seen display name
    for (const it of items) {
        for (const ex of it.exerciseItems) {
            const key = normKey(ex.name)
            if (!seen.has(key)) seen.set(key, ex.name.trim())
        }
    }
    return [...seen.entries()].map(([key, name]) => ({ key, name }))
}

// ─── Import: fuzzy suggestions ──────────────────────────────────────────────────

/** Classic Levenshtein edit distance between two short strings. */
function levenshtein(a: string, b: string): number {
    if (a === b) return 0
    if (!a.length) return b.length
    if (!b.length) return a.length
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    for (let i = 1; i <= a.length; i++) {
        const curr = [i]
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
        }
        prev = curr
    }
    return prev[b.length]
}

interface ExRef {
    id: string
    name: string
    key: string
}

/**
 * Up to three existing exercises that plausibly mean the same thing as `key`,
 * for names with no exact match. Substring containment ranks first (e.g. "bench
 * press" ⊂ "barbell bench press"), then a modest edit distance scaled to length.
 */
function suggestExercises(key: string, existing: ExRef[]): { id: string; name: string }[] {
    const scored: { id: string; name: string; score: number }[] = []
    for (const e of existing) {
        if (e.key === key) continue // exact matches aren't suggestions
        const contains = e.key.includes(key) || key.includes(e.key)
        const dist = levenshtein(key, e.key)
        const threshold = Math.max(2, Math.floor(Math.max(key.length, e.key.length) * 0.34))
        if (contains) {
            scored.push({ id: e.id, name: e.name, score: -1000 + Math.abs(e.key.length - key.length) })
        } else if (dist <= threshold) {
            scored.push({ id: e.id, name: e.name, score: dist })
        }
    }
    return scored
        .sort((a, b) => a.score - b.score)
        .slice(0, 3)
        .map(({ id, name }) => ({ id, name }))
}

async function loadExerciseRefs(userId: unknown): Promise<ExRef[]> {
    const existing = await Exercise.find({ user: userId }).select('_id name').sort({ name: 1 })
    return existing.map((e) => ({ id: String(e._id), name: e.name, key: normKey(e.name) }))
}

// ─── Import: preview (dry run) ──────────────────────────────────────────────────

/**
 * POST /api/workouts/import/preview — classify a pasted workout import without
 * writing anything. For every distinct exercise name it reports whether the name
 * already matches a library exercise, has close-but-not-exact suggestions, or is
 * brand new. The client uses this to let the user reconcile before committing.
 */
export async function previewImportWorkouts(req: AuthRequest, res: Response) {
    const rawList = toWorkoutList(req.body)
    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of workouts, or an object with a "workouts" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No workouts found to import.' })
        return
    }

    const { items, errors } = normaliseWorkouts(rawList)
    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const existing = await loadExerciseRefs(req.userId)
    const byKey = new Map(existing.map((e) => [e.key, e]))

    const exercises = distinctExerciseNames(items).map(({ key, name }) => {
        const match = byKey.get(key)
        if (match) {
            return { key, name, status: 'matched' as const, match: { id: match.id, name: match.name } }
        }
        const suggestions = suggestExercises(key, existing)
        return {
            key,
            name,
            status: suggestions.length ? ('ambiguous' as const) : ('new' as const),
            suggestions,
        }
    })

    res.json({
        message: 'OK',
        data: {
            workouts: items.map((it) => ({ name: it.name, exerciseCount: it.exerciseItems.length })),
            exercises,
            // The full library so the client can offer "link to any exercise" dropdowns.
            existing: existing.map(({ id, name }) => ({ id, name })),
        },
    })
}

// ─── Import: commit ─────────────────────────────────────────────────────────────

/**
 * Read a client-supplied resolution map from the request body. Keys are
 * normalised exercise names; values are exercise ids the user chose to link that
 * name to. Malformed entries are ignored (they fall back to match-or-create).
 */
function readLinks(body: unknown): Map<string, string> {
    const map = new Map<string, string>()
    if (body && typeof body === 'object') {
        const raw = (body as Record<string, unknown>).links
        if (raw && typeof raw === 'object') {
            for (const [key, id] of Object.entries(raw as Record<string, unknown>)) {
                if (typeof id === 'string' && Types.ObjectId.isValid(id)) map.set(normKey(key), id)
            }
        }
    }
    return map
}

/**
 * POST /api/workouts/import — bulk-create workouts from a pasted JSON document.
 *
 * Accepts either a bare array of workout objects or an object with a `workouts`
 * array (and, in the object form, an optional `links` map). Each workout's
 * `exercises` is a list of exercise *names*, resolved to library exercises in
 * this order: an explicit user link (from `links`) wins; otherwise an exact
 * name match; otherwise the exercise is created. Validation is all-or-nothing.
 */
export async function importWorkouts(req: AuthRequest, res: Response) {
    const rawList = toWorkoutList(req.body)
    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of workouts, or an object with a "workouts" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No workouts found to import.' })
        return
    }

    const { items, errors } = normaliseWorkouts(rawList)
    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    // Only keep links that point at an exercise the user actually owns.
    const links = readLinks(req.body)
    let ownedLinks = new Map<string, string>()
    if (links.size > 0) {
        const linkedIds = [...new Set(links.values())]
        const owned = await Exercise.find({ _id: { $in: linkedIds }, user: req.userId }).select('_id')
        const ownedSet = new Set(owned.map((e) => String(e._id)))
        ownedLinks = new Map([...links].filter(([, id]) => ownedSet.has(id)))
    }

    // Resolve each distinct name to an exercise id: explicit link → exact match →
    // (deferred) create. Collect the names that still need creating.
    const existing = await loadExerciseRefs(req.userId)
    const byKey = new Map(existing.map((e) => [e.key, e]))
    const resolved = new Map<string, Types.ObjectId>()
    const toCreate = new Map<string, string>() // key → display name

    for (const { key, name } of distinctExerciseNames(items)) {
        const linked = ownedLinks.get(key)
        if (linked) {
            resolved.set(key, new Types.ObjectId(linked))
            continue
        }
        const match = byKey.get(key)
        if (match) {
            resolved.set(key, new Types.ObjectId(match.id))
            continue
        }
        if (!toCreate.has(key)) toCreate.set(key, name)
    }

    if (toCreate.size > 0) {
        const lastEx = await Exercise.findOne({ user: req.userId }).sort({ order: -1 })
        let exOrder = lastEx ? lastEx.order + 1 : 0
        const entries = [...toCreate.entries()]
        const exDocs = entries.map(([, nm]) => ({
            user: req.userId,
            name: nm,
            description: '',
            order: exOrder++,
        }))
        const createdEx = await Exercise.insertMany(exDocs)
        createdEx.forEach((e, i) => resolved.set(entries[i][0], e._id as Types.ObjectId))
    }

    const lastWk = await Workout.findOne({ user: req.userId }).sort({ order: -1 })
    let order = lastWk ? lastWk.order + 1 : 0
    // Stamp only the workouts with the batch id — undo removes the imported
    // workouts but leaves any exercises they auto-created in the library.
    const importBatch = newBatchId()
    const overwrite = extractOverwrite(req.body)

    /** The exercise lines for one workout, resolved to library exercise ids. */
    const lines = (it: (typeof items)[number]) =>
        it.exerciseItems
            .map((ex) => {
                const id = resolved.get(normKey(ex.name))
                if (!id) return null
                return {
                    exercise: id,
                    ...(ex.sets !== undefined ? { sets: ex.sets } : {}),
                    ...(ex.reps !== undefined ? { reps: ex.reps } : {}),
                }
            })
            .filter((e): e is IWorkoutExercise => e !== null)

    // Overwrite chosen name-clashes in place (keeps _id, so the planner reflects
    // the change wherever the workout is scheduled); insert the rest as a batch.
    const toInsert: Record<string, unknown>[] = []
    let updated = 0
    for (const it of items) {
        const content = {
            name: it.name,
            description: it.description,
            showInPlanner: it.showInPlanner,
            exercises: lines(it),
        }
        const targetId = overwrite.get(nameKey(it.name))
        if (targetId) {
            const r = await Workout.updateOne({ _id: targetId, user: req.userId }, { $set: content })
            if (r.matchedCount) {
                updated++
                continue
            }
        }
        toInsert.push({ user: req.userId, ...content, order: order++, importBatch })
    }

    const created = await Workout.insertMany(toInsert)
    res.status(201).json({
        message: `Imported ${created.length} workout(s), updated ${updated}`,
        data: created,
        updated,
    })
}

/** DELETE /api/workouts/:id — remove a workout. */
export async function deleteWorkout(req: AuthRequest, res: Response) {
    const workout = await Workout.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!workout) {
        res.status(404).json({ message: 'Workout not found' })
        return
    }
    res.json({ message: 'Deleted', data: workout })
}
