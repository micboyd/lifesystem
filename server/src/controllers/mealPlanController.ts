import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { ClientSession, FilterQuery, Types } from 'mongoose'
import MealPlanEntry, {
    ENTRY_STATUSES,
    EntryStatus,
    IAdhocMeal,
    IMealPlanEntry,
} from '../models/MealPlanEntry'
import Meal, { MEAL_TYPES, MealType, IMacros } from '../models/Meal'
import {
    HttpError,
    asPlannedComponents,
    consumptionsOf,
    consumptionsOfComponents,
    inTransaction,
    isDuplicateKey,
    moveStock,
    resolveComponents,
    sendError,
} from '../lib/buffetStock'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_RE.test(v)
}

function isSlot(v: unknown): v is MealType {
    return typeof v === 'string' && MEAL_TYPES.includes(v as MealType)
}

function isStatus(v: unknown): v is EntryStatus {
    return typeof v === 'string' && ENTRY_STATUSES.includes(v as EntryStatus)
}

/** Coerce a macro figure to a non-negative number, defaulting to 0. */
function toMacro(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Coerce a servings figure. Anything missing, unparseable or non-positive falls
 * back to a single serving — a zero-serving entry is a skip written the
 * confusing way, and the status field already says that properly.
 */
function toServings(raw: unknown): number {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : 1
}

/**
 * Validate an off-plan meal body: a name plus whatever macros are known. Macros
 * are all optional and default to zero — a rough calorie figure logged now beats
 * a precise one logged never.
 */
function parseAdhoc(raw: unknown): IAdhocMeal | null {
    if (!raw || typeof raw !== 'object') return null
    const { name, macros } = raw as { name?: unknown; macros?: unknown }
    if (typeof name !== 'string' || !name.trim()) return null
    const m = (macros ?? {}) as Record<string, unknown>
    const parsed: IMacros = {
        calories: toMacro(m.calories),
        protein: toMacro(m.protein),
        carbs: toMacro(m.carbs),
        fat: toMacro(m.fat),
    }
    return { name: name.trim(), macros: parsed }
}

/**
 * GET /api/meal-plan?start=YYYY-MM-DD&end=YYYY-MM-DD
 * List a user's planned meals in a date range, with each library meal populated
 * so the client can tally macros. Entries whose library meal has since been
 * deleted are dropped; ad-hoc entries carry their own macros and always survive.
 */
export async function listEntries(req: AuthRequest, res: Response) {
    const { start, end } = req.query
    if (!isDate(start) || !isDate(end)) {
        res.status(400).json({ message: 'start and end (YYYY-MM-DD) are required' })
        return
    }

    const entries = await MealPlanEntry.find({
        user: req.userId,
        date: { $gte: start, $lte: end },
    })
        .sort({ date: 1, order: 1, createdAt: 1 })
        .populate('meal')

    // A meal deleted from the library leaves a dangling entry — skip those.
    res.json({ message: 'OK', data: entries.filter((e) => e.meal || e.adhoc || e.buffet) })
}

/**
 * POST /api/meal-plan — put food into a day+slot, appended to that slot.
 *
 * Body carries either `meal` (a library meal id) or `adhoc` ({ name, macros })
 * for something eaten off-plan. An optional `status` lets the off-plan path log
 * straight to 'eaten' in one call, since that food is by definition already gone.
 * An optional `servings` sets the portion; left out, it's a single serving.
 */
export async function createEntry(req: AuthRequest, res: Response) {
    const { date, slot, meal: mealId, adhoc: adhocRaw, status, servings } = req.body
    if (!isDate(date) || !isSlot(slot)) {
        res.status(400).json({ message: 'date and slot are required' })
        return
    }

    if (req.body.buffet !== undefined) {
        try {
            await createBuffetEntry(req, res, date, slot)
        } catch (err) {
            sendError(res, err)
        }
        return
    }

    const adhoc = parseAdhoc(adhocRaw)
    if (!adhoc && typeof mealId !== 'string') {
        res.status(400).json({ message: 'either meal or adhoc (with a name) is required' })
        return
    }

    // A library meal must exist and belong to the requesting user.
    let meal = null
    if (!adhoc) {
        meal = await Meal.findOne({ _id: mealId, user: req.userId })
        if (!meal) {
            res.status(404).json({ message: 'Meal not found' })
            return
        }
    }

    const last = await MealPlanEntry.findOne({ user: req.userId, date, slot }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const entry = await MealPlanEntry.create({
        user: req.userId,
        date,
        slot,
        ...(adhoc ? { adhoc } : { meal: meal!._id }),
        ...(isStatus(status) ? { status } : {}),
        ...(servings === undefined ? {} : { servings: toServings(servings) }),
        order,
    })
    if (entry.meal) await entry.populate('meal')
    res.status(201).json({ message: 'Created', data: entry })
}

/**
 * PATCH /api/meal-plan/:id — mark an entry eaten, skipped, or back to planned,
 * and/or change its portion. The two mutable fields: everything else about a
 * placed meal is edited by removing it and adding another. Either may be sent
 * alone, so bumping a portion doesn't disturb the logged status and vice versa.
 */
export async function updateEntryStatus(req: AuthRequest, res: Response) {
    const { status, servings } = req.body

    const update: { status?: EntryStatus; servings?: number } = {}
    if (status !== undefined) {
        if (!isStatus(status)) {
            res.status(400).json({ message: `status must be one of: ${ENTRY_STATUSES.join(', ')}` })
            return
        }
        update.status = status
    }
    if (servings !== undefined) update.servings = toServings(servings)

    if (Object.keys(update).length === 0) {
        res.status(400).json({ message: 'status or servings is required' })
        return
    }

    // A buffet plate is eaten by logging its grams, which moves stock; a bare
    // status flip in or out of 'eaten' would skip that, so it goes via /log and
    // /unlog instead. Planned ↔ skipped moves nothing and stays allowed.
    const current = await MealPlanEntry.findOne({ _id: req.params.id, user: req.userId })
    if (current?.buffet && (update.status === 'eaten' || (update.status && current.status === 'eaten'))) {
        res.status(400).json({
            message: 'Buffet meals are logged with their weights — open the meal to log or unlog it',
            code: 'USE_LOG',
        })
        return
    }

    const entry = await MealPlanEntry.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: update },
        { new: true }
    ).populate('meal')

    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Saved', data: entry })
}

/**
 * POST /api/meal-plan/copy
 * Copy planned meals from one set of days onto another. `from` and `to` are
 * parallel arrays of dates: every entry on `from[i]` is recreated on `to[i]`.
 * This powers "copy a day to the next day" (one date each) and "paste a week"
 * (the seven source days mapped onto seven target days).
 *
 * Target days are overwritten — their existing entries are removed first — so
 * pasting is idempotent and never piles up duplicates.
 */
export async function copyEntries(req: AuthRequest, res: Response) {
    const { from, to } = req.body
    if (
        !Array.isArray(from) ||
        !Array.isArray(to) ||
        from.length === 0 ||
        from.length !== to.length ||
        !from.every(isDate) ||
        !to.every(isDate)
    ) {
        res.status(400).json({ message: 'from and to must be equal-length arrays of dates' })
        return
    }

    // Map each source day to its target day. A day mapped onto itself is a no-op.
    const dateMap = new Map<string, string>()
    from.forEach((d: string, i: number) => dateMap.set(d, to[i]))

    const sources = await MealPlanEntry.find({ user: req.userId, date: { $in: from } }).sort({
        order: 1,
        createdAt: 1,
    })

    // Copies land as 'planned' regardless of the source's status — repeating last
    // week's plan is an intention for the days ahead, not a claim you ate them.
    // A buffet plate is copied at the grams actually eaten, as a plan.
    const docs = sources
        .filter((e) => dateMap.get(e.date) !== e.date)
        .map((e) => ({
            user: req.userId,
            date: dateMap.get(e.date),
            slot: e.slot,
            ...(e.buffet
                ? {
                      buffet: {
                          name: e.buffet.name,
                          components: asPlannedComponents(e.buffet.components).map((c) => ({
                              ...c,
                              _id: new Types.ObjectId(),
                          })),
                          rev: 0,
                      },
                  }
                : e.adhoc
                  ? { adhoc: e.adhoc }
                  : { meal: e.meal }),
            servings: e.servings,
            status: 'planned',
            order: e.order,
        }))

    // Clear the target days (restoring any logged buffet stock), then recreate
    // the source entries on them — one transaction, so a failed paste leaves the
    // target days as they were.
    const targetDates = [...new Set(to as string[])]
    const created = await inTransaction(async (session) => {
        await deleteRestoringStock(req.userId, { user: req.userId, date: { $in: targetDates } }, session)
        return docs.length ? await MealPlanEntry.insertMany(docs, { session }) : []
    })
    await MealPlanEntry.populate(created, { path: 'meal' })

    // Drop any entry whose meal has since been deleted, mirroring listEntries.
    res.status(201).json({ message: 'Copied', data: created.filter((e) => e.meal || e.adhoc || e.buffet) })
}

/**
 * POST /api/meal-plan/clear — delete every planned meal whose date falls in
 * [start, end] (inclusive). Clears a single day (start === end) or a whole week.
 * Body: { start: YYYY-MM-DD, end: YYYY-MM-DD }.
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
    // Logged buffet portions go back into their batches as the meals go.
    const cleared = await inTransaction((session) =>
        deleteRestoringStock(req.userId, { user: req.userId, date: { $gte: start, $lte: end } }, session)
    )
    res.json({ message: 'OK', data: { cleared } })
}

/**
 * DELETE /api/meal-plan/:id — remove a planned meal. A logged buffet plate
 * hands its grams back to the batches it came from, in the same transaction.
 */
export async function deleteEntry(req: AuthRequest, res: Response) {
    const entry = await inTransaction(async (session) => {
        const found = await MealPlanEntry.findOne({ _id: req.params.id, user: req.userId }).session(session)
        if (!found) return null
        await deleteRestoringStock(req.userId, { _id: found._id, user: req.userId }, session)
        return found
    })
    if (!entry) {
        res.status(404).json({ message: 'Entry not found' })
        return
    }
    res.json({ message: 'Deleted', data: entry })
}

// ── Buffet meals ─────────────────────────────────────────────────────────────

/**
 * Delete the entries matching `filter`, first returning every logged buffet
 * plate's grams to its batches. Returns how many were deleted.
 */
async function deleteRestoringStock(
    userId: string | undefined,
    filter: FilterQuery<IMealPlanEntry>,
    session: ClientSession
): Promise<number> {
    const logged = await MealPlanEntry.find({ ...filter, status: 'eaten', buffet: { $exists: true } }).session(
        session
    )
    for (const e of logged) {
        await moveStock({
            userId,
            entryId: e._id as Types.ObjectId,
            before: consumptionsOf(e),
            after: [],
            occasionAt: e.buffet!.loggedAt?.getTime() ?? e.createdAt.getTime(),
            date: e.date,
            session,
        })
    }
    const { deletedCount } = await MealPlanEntry.deleteMany(filter, { session })
    return deletedCount ?? 0
}

function parseName(raw: unknown): string | undefined {
    return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 120) : undefined
}

/**
 * POST /api/meal-plan with `buffet: { name?, components, status?, clientKey? }`.
 *
 * Planned by default — recipe components allowed, nothing deducted. With
 * `status: 'eaten'` it is a quick log: every component must be a batch or a
 * food, and stock moves in the same transaction as the insert. `clientKey`
 * makes that retry-safe: a second request with the same key returns the meal
 * the first one created.
 */
async function createBuffetEntry(req: AuthRequest, res: Response, date: string, slot: MealType) {
    const body = (req.body.buffet ?? {}) as Record<string, unknown>
    const eaten = body.status === 'eaten'
    const clientKey = typeof body.clientKey === 'string' && body.clientKey.length <= 64 ? body.clientKey : undefined

    if (clientKey) {
        const existing = await MealPlanEntry.findOne({ user: req.userId, clientKey })
        if (existing) {
            res.status(200).json({ message: 'Already saved', data: existing })
            return
        }
    }

    try {
        const entry = await inTransaction(async (session) => {
            const components = await resolveComponents(body.components, eaten ? 'log' : 'plan', req.userId, session)
            const last = await MealPlanEntry.findOne({ user: req.userId, date, slot })
                .sort({ order: -1 })
                .session(session)
            const now = new Date()
            const [doc] = await MealPlanEntry.create(
                [
                    {
                        user: req.userId,
                        date,
                        slot,
                        buffet: {
                            name: parseName(body.name),
                            components,
                            rev: 0,
                            ...(eaten ? { loggedAt: now } : {}),
                        },
                        status: eaten ? 'eaten' : 'planned',
                        order: last ? last.order + 1 : 0,
                        ...(clientKey ? { clientKey } : {}),
                    },
                ],
                { session }
            )
            if (eaten) {
                await moveStock({
                    userId: req.userId,
                    entryId: doc._id as Types.ObjectId,
                    before: [],
                    after: consumptionsOfComponents(components),
                    occasionAt: now.getTime(),
                    date,
                    session,
                })
            }
            return doc
        })
        res.status(201).json({ message: 'Created', data: entry })
    } catch (err) {
        // Lost a race with an identical retry: hand back the one that won.
        if (clientKey && isDuplicateKey(err)) {
            const existing = await MealPlanEntry.findOne({ user: req.userId, clientKey })
            if (existing) {
                res.status(200).json({ message: 'Already saved', data: existing })
                return
            }
        }
        throw err
    }
}

/**
 * Load a buffet entry for a write, refusing if it isn't the revision the client
 * edited — the guard that makes a double-submitted log a no-op instead of a
 * second deduction.
 */
async function loadForWrite(req: AuthRequest, session: ClientSession) {
    const entry = await MealPlanEntry.findOne({ _id: req.params.id, user: req.userId }).session(session)
    if (!entry) throw new HttpError(404, 'Entry not found')
    if (!entry.buffet) throw new HttpError(400, 'Not a buffet meal')
    const rev = Number(req.body.rev)
    if (!Number.isInteger(rev) || rev !== entry.buffet.rev) {
        throw new HttpError(409, 'This meal changed since you opened it — it has been reloaded', {
            code: 'STALE',
            data: entry,
        })
    }
    return entry
}

/**
 * PUT /api/meal-plan/:id/buffet — change a plate that hasn't been eaten: its
 * name, components and planned grams. Moves no stock; a logged plate is edited
 * through /log so its stock moves with it.
 */
export async function updateBuffetPlan(req: AuthRequest, res: Response) {
    try {
        const entry = await inTransaction(async (session) => {
            const e = await loadForWrite(req, session)
            if (e.status === 'eaten') {
                throw new HttpError(400, 'This meal is logged — edit its logged weights instead', { code: 'USE_LOG' })
            }
            const components = await resolveComponents(req.body.components, 'plan', req.userId, session)
            e.buffet!.components = components as never
            e.buffet!.name = parseName(req.body.name)
            e.buffet!.rev += 1
            e.markModified('buffet')
            await e.save({ session })
            return e
        })
        res.json({ message: 'Saved', data: entry })
    } catch (err) {
        sendError(res, err)
    }
}

/**
 * POST /api/meal-plan/:id/log — record what was actually eaten.
 *
 * Works for a planned plate (first log) and a logged one (an edit). Either way
 * the stock moves by the difference between what the meal had taken and what
 * it now takes, per batch — a changed batch is restored and the new one
 * deducted, in one transaction with the snapshot. Ordered against the time of
 * the first log, so a stock correction made since is respected.
 */
export async function logBuffet(req: AuthRequest, res: Response) {
    try {
        const entry = await inTransaction(async (session) => {
            const e = await loadForWrite(req, session)
            const components = await resolveComponents(req.body.components, 'log', req.userId, session)
            const before = consumptionsOf(e)
            const loggedAt = e.status === 'eaten' && e.buffet!.loggedAt ? e.buffet!.loggedAt : new Date()
            await moveStock({
                userId: req.userId,
                entryId: e._id as Types.ObjectId,
                before,
                after: consumptionsOfComponents(components),
                occasionAt: loggedAt.getTime(),
                date: e.date,
                session,
            })
            e.buffet!.components = components as never
            if (req.body.name !== undefined) e.buffet!.name = parseName(req.body.name)
            e.buffet!.loggedAt = loggedAt
            e.buffet!.rev += 1
            e.status = 'eaten'
            e.markModified('buffet')
            await e.save({ session })
            return e
        })
        res.json({ message: 'Logged', data: entry })
    } catch (err) {
        sendError(res, err)
    }
}

/**
 * POST /api/meal-plan/:id/unlog — take a logged plate back to planned (or
 * skipped), returning its grams to stock. The eaten weights become the plan.
 */
export async function unlogBuffet(req: AuthRequest, res: Response) {
    const target: EntryStatus = req.body.status === 'skipped' ? 'skipped' : 'planned'
    try {
        const entry = await inTransaction(async (session) => {
            const e = await loadForWrite(req, session)
            if (e.status !== 'eaten') {
                e.status = target
                e.buffet!.rev += 1
                await e.save({ session })
                return e
            }
            await moveStock({
                userId: req.userId,
                entryId: e._id as Types.ObjectId,
                before: consumptionsOf(e),
                after: [],
                occasionAt: e.buffet!.loggedAt?.getTime() ?? e.createdAt.getTime(),
                date: e.date,
                session,
            })
            e.buffet!.components = asPlannedComponents(e.buffet!.components) as never
            e.buffet!.loggedAt = undefined
            e.buffet!.rev += 1
            e.status = target
            e.markModified('buffet')
            await e.save({ session })
            return e
        })
        res.json({ message: 'Saved', data: entry })
    } catch (err) {
        sendError(res, err)
    }
}
