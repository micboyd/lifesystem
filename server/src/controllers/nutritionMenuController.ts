import { eventInMealSlot, eventsBetween } from '../lib/eventSlots'
import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import NutritionPhase, { type IMenuItem, type INutritionPhase } from '../models/NutritionPhase'
import MealPlanEntry from '../models/MealPlanEntry'
import Meal, { MEAL_TYPES, type MealType } from '../models/Meal'

/**
 * A nutrition plan's meal week: seven days of library meals that repeat across
 * the plan's dates, and the two moves that put it on the planner and take it
 * back off.
 *
 * Applying is non-destructive in the same way training plans are: entries it
 * places are stamped with the plan, so re-applying only replaces its own
 * still-planned meals, and any slot already holding something placed by hand
 * (planned, eaten or an away note) is left alone.
 */

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const isId = (v: unknown): v is string => typeof v === 'string' && Types.ObjectId.isValid(v)
const isSlot = (v: unknown): v is MealType => MEAL_TYPES.includes(v as MealType)

/** The most meals a week can hold — four slots, a few things in each, seven days. */
const MAX_MENU = 7 * 4 * 6
/** The most days one apply writes: a year of planner. */
const MAX_DAYS = 366

function todayIso(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 0 = Monday … 6 = Sunday, read from the date itself so time zones can't shift it. */
export function weekdayOf(date: string): number {
    return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** Every YYYY-MM-DD from `from` to `to`, inclusive, capped at `MAX_DAYS`. */
export function datesBetween(from: string, to: string): string[] {
    const out: string[] = []
    const d = new Date(`${from}T00:00:00Z`)
    const end = new Date(`${to}T00:00:00Z`)
    while (d <= end && out.length < MAX_DAYS) {
        out.push(d.toISOString().slice(0, 10))
        d.setUTCDate(d.getUTCDate() + 1)
    }
    return out
}

/** A posted menu, checked item by item. Null when it isn't one. */
function readMenu(value: unknown): { day: number; slot: MealType; meal: string }[] | null {
    if (!Array.isArray(value) || value.length > MAX_MENU) return null
    const out: { day: number; slot: MealType; meal: string }[] = []
    for (const raw of value) {
        const item = raw as Record<string, unknown> | null
        const day = Number(item?.day)
        if (!item || !Number.isInteger(day) || day < 0 || day > 6 || !isSlot(item.slot) || !isId(item.meal)) return null
        out.push({ day, slot: item.slot, meal: item.meal })
    }
    return out
}

async function findPlan(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Plan not found' })
        return null
    }
    const plan = await NutritionPhase.findOne({ _id: req.params.id, user: req.userId })
    if (!plan) res.status(404).json({ message: 'Plan not found' })
    return plan
}

/** How much of the plan sits on the planner from today: still-planned meals and their date span. */
async function appliedSummary(user: string, planId: Types.ObjectId) {
    const filter = { user, plan: planId, date: { $gte: todayIso() }, status: 'planned' as const }
    const [count, first, last] = await Promise.all([
        // Meals only — the plan's away notes for calendar events aren't counted.
        MealPlanEntry.countDocuments({ ...filter, away: { $ne: true } }),
        MealPlanEntry.findOne(filter).sort({ date: 1 }).select('date'),
        MealPlanEntry.findOne(filter).sort({ date: -1 }).select('date'),
    ])
    return { count, from: first?.date ?? null, to: last?.date ?? null }
}

/** GET /api/nutrition-phases/:id/applied — what of this plan is on the planner from today. */
export async function getApplied(req: AuthRequest, res: Response) {
    const plan = await findPlan(req, res)
    if (!plan) return
    res.json({ message: 'OK', data: await appliedSummary(req.userId!, plan._id as Types.ObjectId) })
}

/** PUT /api/nutrition-phases/:id/menu { menu } — replace the plan's meal week. */
export async function saveMenu(req: AuthRequest, res: Response) {
    const menu = readMenu((req.body as Record<string, unknown> | null)?.menu)
    if (!menu) {
        res.status(400).json({ message: 'menu must be a list of { day 0–6, slot, meal }' })
        return
    }
    const plan = await findPlan(req, res)
    if (!plan) return
    // Only meals that are this user's survive, so a stale id can't sneak in.
    const owned = new Set(
        (await Meal.find({ user: req.userId, _id: { $in: [...new Set(menu.map((m) => m.meal))] } }).select('_id')).map(
            (m) => String(m._id)
        )
    )
    plan.menu = menu.filter((m) => owned.has(m.meal)).map((m) => ({ ...m, meal: new Types.ObjectId(m.meal) })) as IMenuItem[]
    await plan.save()
    res.json({ message: 'Saved', data: plan })
}

/**
 * POST /api/nutrition-phases/:id/apply { from?, to? } — copy the meal week onto
 * every day of the plan from `from` (default: today, or the plan's start if
 * later) to `to` (default: its end).
 *
 * The plan's own still-planned meals in that range go first, so applying again
 * after editing the week replaces rather than doubles. A slot that already
 * holds anything else is skipped. Name and macros are copied from the library
 * as an ordinary add does.
 */
export async function applyMenu(req: AuthRequest, res: Response) {
    const body = (req.body ?? {}) as Record<string, unknown>
    const plan = await findPlan(req, res)
    if (!plan) return
    const out = await applyPlanMenu(req.userId!, plan, isDate(body.from) ? body.from : undefined, isDate(body.to) ? body.to : undefined)
    if ('error' in out) {
        res.status(400).json({ message: out.error })
        return
    }
    res.json({ message: 'OK', data: { ...out, applied: await appliedSummary(req.userId!, plan._id as Types.ObjectId) } })
}

/**
 * Copy a plan's meal week onto the planner — the work behind Apply, shared with
 * the importer. `from` defaults to today (or the plan's start, if later), `to`
 * to the plan's end; both are held inside the plan.
 */
export async function applyPlanMenu(
    user: string,
    plan: INutritionPhase,
    fromIn?: string,
    toIn?: string
): Promise<{ added: number; replaced: number; skipped: number; away: number; from: string; to: string } | { error: string }> {
    const menu = plan.menu ?? []
    if (menu.length === 0) return { error: 'This plan has no meals yet' }
    let from = fromIn ?? todayIso()
    if (from < plan.startDate) from = plan.startDate
    let to = toIn ?? plan.endDate
    if (to > plan.endDate) to = plan.endDate
    if (to < from) return { error: 'Nothing left of this plan to fill' }
    const dates = datesBetween(from, to)
    to = dates[dates.length - 1]

    const { deletedCount: replaced } = await MealPlanEntry.deleteMany({
        user,
        plan: plan._id,
        date: { $gte: from, $lte: to },
        status: 'planned',
        extra: false,
    })

    // Slots already taken by something not from this plan, and the next order in each.
    const existing = await MealPlanEntry.find({ user, date: { $gte: from, $lte: to } }).select('date slot extra order')
    const taken = new Set<string>()
    const nextOrder = new Map<string, number>()
    for (const e of existing) {
        const key = `${e.date}|${e.slot}`
        if (!e.extra) taken.add(key)
        nextOrder.set(key, Math.max(nextOrder.get(key) ?? 0, e.order + 1))
    }

    // Slots a calendar event covers get an away note (named after the event) instead of a meal.
    const events = await eventsBetween(user, from, to)

    const meals = await Meal.find({ user, _id: { $in: menu.map((m) => m.meal) } })
    const byId = new Map(meals.map((m) => [String(m._id), m]))

    const docs: Record<string, unknown>[] = []
    let skipped = 0
    let away = 0
    for (const date of dates) {
        const day = weekdayOf(date)
        const skippedSlots = new Set<string>()
        for (const item of menu) {
            if (item.day !== day) continue
            const meal = byId.get(String(item.meal))
            if (!meal) continue
            const key = `${date}|${item.slot}`
            if (taken.has(key)) {
                skippedSlots.add(key)
                continue
            }
            const event = eventInMealSlot(events, date, item.slot)
            if (event) {
                // One note per slot, however many meals the menu puts there.
                taken.add(key)
                away++
                docs.push({
                    user,
                    date,
                    slot: item.slot,
                    away: true,
                    plan: plan._id,
                    name: event.title.slice(0, 120) || 'Out',
                    macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
                    status: 'planned',
                    extra: false,
                    order: nextOrder.get(key) ?? 0,
                })
                continue
            }
            const order = nextOrder.get(key) ?? 0
            nextOrder.set(key, order + 1)
            docs.push({
                user,
                date,
                slot: item.slot,
                meal: meal._id,
                plan: plan._id,
                name: meal.name,
                macros: meal.macros,
                status: 'planned',
                extra: false,
                order,
            })
        }
        skipped += skippedSlots.size
    }
    if (docs.length > 0) await MealPlanEntry.insertMany(docs)
    return { added: docs.length - away, replaced: replaced ?? 0, skipped, away, from, to }
}

/**
 * POST /api/nutrition-phases/:id/unapply { from? } — take the plan's
 * still-planned meals off the planner from `from` (default today). Eaten and
 * skipped days keep theirs: they're history now.
 */
export async function unapplyMenu(req: AuthRequest, res: Response) {
    const body = (req.body ?? {}) as Record<string, unknown>
    const plan = await findPlan(req, res)
    if (!plan) return
    const from = isDate(body.from) ? body.from : todayIso()
    const { deletedCount } = await MealPlanEntry.deleteMany({
        user: req.userId,
        plan: plan._id,
        date: { $gte: from },
        status: 'planned',
        extra: false,
    })
    res.json({ message: 'OK', data: { removed: deletedCount ?? 0 } })
}
