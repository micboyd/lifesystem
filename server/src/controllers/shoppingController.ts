import { Response } from 'express'
import { randomUUID } from 'crypto'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import ShoppingList, { IShoppingGroup, IShoppingList } from '../models/ShoppingList'
import Meal from '../models/Meal'

/**
 * The nutrition shopping list — one per user. What's been added (meals with a
 * serving count, typed-in things) sits at the top; the client merges it into
 * one line per ingredient name, so two meals that both need chicken make one
 * chicken line. Ticks are kept by line name. (Older lists may still hold
 * "box" and "food" groups; they keep the ingredients they were added with.)
 */

type List = IShoppingList

async function listFor(userId: string): Promise<List> {
    return (await ShoppingList.findOne({ user: userId })) ?? (await ShoppingList.create({ user: userId, groups: [] }))
}

/** One word, singular — mirrors the client's lib/shopping.ts lineKey, so ticks match its lines. */
function singular(word: string): string {
    if (word.length <= 3) return word
    if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
    if (/(o|ch|sh|x)es$/.test(word)) return word.slice(0, -2)
    if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1)
    return word
}

/** A line's key: lower case, spaces tidied, last word singular ("Red onions" → "red onion"). */
function keyOf(name: string): string {
    const words = name.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (words.length === 0) return ''
    words[words.length - 1] = singular(words[words.length - 1])
    return words.join(' ')
}

/** The line names a group puts on the list: a box's or meal's ingredients, else itself. */
function linesOf(g: IShoppingGroup): string[] {
    return (g.kind === 'box' || g.kind === 'meal') && g.ingredients.length > 0
        ? g.ingredients.map((i) => keyOf(i.name))
        : [keyOf(g.name)]
}

/** It needs more now, so its lines come out of the basket. */
function untick(list: List, g: IShoppingGroup) {
    const names = new Set(linesOf(g))
    list.ticked = list.ticked.filter((t) => !names.has(t))
}

/** Meals take their ingredients as they are now (a deleted one keeps what it had). */
async function refreshMeals(userId: string, list: List) {
    const mealIds = list.groups.filter((g) => g.kind === 'meal' && g.ref).map((g) => g.ref)
    if (mealIds.length === 0) return
    const meals = await Meal.find({ user: userId, _id: { $in: mealIds } })
    for (const g of list.groups) {
        const source = g.kind === 'meal' ? meals.find((m) => String(m._id) === String(g.ref)) : undefined
        if (!source) continue
        g.name = source.name
        g.ingredients = (source.ingredients ?? []).map((i) => ({ name: i.name, grams: i.grams, items: i.items }))
        g.batchOf = source.batchOf ?? null
    }
}

/** Save, dropping ticks for lines no longer on the list, and answer with it. */
async function send(userId: string, res: Response, list: List) {
    await refreshMeals(userId, list)
    const present = new Set(list.groups.flatMap(linesOf))
    list.ticked = [...new Set(list.ticked)].filter((t) => present.has(t))
    list.markModified('groups')
    await list.save()
    res.json({ message: 'OK', data: { groups: list.groups, ticked: list.ticked, prep: list.prep ?? null } })
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const count99 = (v: unknown) => Math.min(99, Math.max(1, Math.round(Number(v) || 0)))

/**
 * PUT /api/shopping/prep { from, to, extras: [{ meal, count }], meals: [{ id, count }] }
 * — what Prep is cooking for. The list's meals become exactly `meals` (the
 * days' meals and the extras, counted by the client); typed-in things stay.
 * A meal that's new or needs more comes out of the basket.
 */
export async function setPrep(req: AuthRequest, res: Response) {
    const b = (req.body ?? {}) as Record<string, unknown>
    if (typeof b.from !== 'string' || typeof b.to !== 'string' || !DATE.test(b.from) || !DATE.test(b.to) || b.to < b.from) {
        res.status(400).json({ message: 'from and to must be YYYY-MM-DD, from first' })
        return
    }
    const read = (v: unknown, key: 'id' | 'meal') =>
        (Array.isArray(v) ? v : [])
            .map((r) => r as Record<string, unknown>)
            .filter((r) => typeof r[key] === 'string' && Types.ObjectId.isValid(r[key] as string) && Number(r.count) >= 1)
            .map((r) => ({ id: r[key] as string, count: count99(r.count) }))
    const want = read(b.meals, 'id')
    const extras = read(b.extras, 'meal')

    const list = await listFor(req.userId!)
    const meals = await Meal.find({ user: req.userId, _id: { $in: want.map((w) => w.id) } })
    const kept: IShoppingGroup[] = list.groups.filter((g) => g.kind === 'item')
    for (const w of want) {
        const meal = meals.find((m) => String(m._id) === w.id)
        if (!meal) continue
        const had = list.groups.find((g) => g.kind === 'meal' && String(g.ref) === w.id)
        const group: IShoppingGroup = had ?? {
            id: randomUUID(),
            kind: 'meal',
            ref: meal._id as IShoppingGroup['ref'],
            name: meal.name,
            ingredients: (meal.ingredients ?? []).map((i) => ({ name: i.name, grams: i.grams, items: i.items })),
            batchOf: meal.batchOf ?? null,
            count: w.count,
        }
        if (!had || w.count > had.count) untick(list, group)
        group.count = w.count
        kept.push(group)
    }
    list.groups = kept
    list.prep = {
        from: b.from,
        to: b.to,
        extras: extras.map((e) => ({ meal: new Types.ObjectId(e.id), count: e.count })),
    }
    list.markModified('prep')
    await send(req.userId!, res, list)
}

/** GET /api/shopping — what's been added, and which lines are ticked. */
export async function getShopping(req: AuthRequest, res: Response) {
    await send(req.userId!, res, await listFor(req.userId!))
}

/**
 * POST /api/shopping/add { kind: 'meal', id, count? } — adds it, or `count`
 * more servings (default 1; a whole tray's worth when shopping by batch) if
 * it's already on the list.
 */
export async function addToShopping(req: AuthRequest, res: Response) {
    const { kind, id } = req.body ?? {}
    const more = Math.min(99, Math.max(1, Math.round(Number(req.body?.count) || 1)))
    const list = await listFor(req.userId!)
    let entry: Omit<IShoppingGroup, 'id' | 'count'>
    if (kind === 'meal') {
        const meal = await Meal.findOne({ _id: id, user: req.userId })
        if (!meal) {
            res.status(404).json({ message: 'Meal not found' })
            return
        }
        entry = {
            kind: 'meal',
            ref: meal._id as IShoppingGroup['ref'],
            name: meal.name,
            ingredients: (meal.ingredients ?? []).map((i) => ({ name: i.name, grams: i.grams, items: i.items })),
            batchOf: meal.batchOf ?? null,
        }
    } else {
        res.status(400).json({ message: "kind must be 'meal'" })
        return
    }
    let group = list.groups.find((g) => g.kind === entry.kind && String(g.ref) === String(entry.ref))
    if (group) group.count += more
    else {
        group = { id: randomUUID(), ...entry, count: more }
        list.groups.push(group)
    }
    // Prep is cooking for some days: this goes on top of them, so it stays when they're recounted.
    if (list.prep) {
        const extra = list.prep.extras.find((e) => String(e.meal) === String(entry.ref))
        if (extra) extra.count = Math.min(99, extra.count + more)
        else list.prep.extras.push({ meal: entry.ref as Types.ObjectId, count: more })
        list.markModified('prep')
    }
    untick(list, group)
    await send(req.userId!, res, list)
}

/** POST /api/shopping/items { name } — something typed in (again: one more of it). */
export async function addShoppingItem(req: AuthRequest, res: Response) {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    const list = await listFor(req.userId!)
    let group = list.groups.find((g) => g.kind === 'item' && keyOf(g.name) === keyOf(name))
    if (group) group.count += 1
    else {
        group = { id: randomUUID(), kind: 'item', name, count: 1, ingredients: [] }
        list.groups.push(group)
    }
    untick(list, group)
    await send(req.userId!, res, list)
}

/** PATCH /api/shopping/groups/:id { count } — how many batches (or meals, or of a food). */
export async function updateShoppingGroup(req: AuthRequest, res: Response) {
    const n = Math.round(Number(req.body?.count))
    if (!Number.isFinite(n) || n < 1 || n > 99) {
        res.status(400).json({ message: 'count must be 1 to 99' })
        return
    }
    const list = await listFor(req.userId!)
    const group = list.groups.find((g) => g.id === req.params.id)
    if (!group) {
        res.status(404).json({ message: 'Not on the list' })
        return
    }
    if (n > group.count) untick(list, group)
    group.count = n
    await send(req.userId!, res, list)
}

/** DELETE /api/shopping/groups/:id */
export async function deleteShoppingGroup(req: AuthRequest, res: Response) {
    const list = await listFor(req.userId!)
    list.groups = list.groups.filter((g) => g.id !== req.params.id)
    await send(req.userId!, res, list)
}

/** POST /api/shopping/tick { name, done } — a line into (or out of) the basket. */
export async function tickShopping(req: AuthRequest, res: Response) {
    const { name, done } = req.body ?? {}
    if (typeof name !== 'string' || typeof done !== 'boolean') {
        res.status(400).json({ message: 'name and done are required' })
        return
    }
    const list = await listFor(req.userId!)
    const key = keyOf(name)
    list.ticked = list.ticked.filter((t) => t !== key)
    if (done) list.ticked.push(key)
    await send(req.userId!, res, list)
}

/**
 * POST /api/shopping/clear { onlyDone } — everything, or just what's been
 * bought: anything whose lines are all ticked comes off.
 */
export async function clearShopping(req: AuthRequest, res: Response) {
    const list = await listFor(req.userId!)
    if (req.body?.onlyDone === true) {
        await refreshMeals(req.userId!, list)
        const ticked = new Set(list.ticked)
        list.groups = list.groups.filter((g) => !linesOf(g).every((l) => ticked.has(l)))
    } else {
        list.groups = []
        list.ticked = []
        list.prep = null
    }
    await send(req.userId!, res, list)
}
