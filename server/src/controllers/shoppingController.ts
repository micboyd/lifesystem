import { Response } from 'express'
import { randomUUID } from 'crypto'
import { AuthRequest } from '../middleware/auth'
import ShoppingList, { IShoppingGroup, IShoppingList } from '../models/ShoppingList'
import Meal from '../models/Meal'
import PlateFood from '../models/PlateFood'

/**
 * The nutrition shopping list — one per user. What's been added (boxes with a
 * batch count, meals, foods, typed-in things) sits at the top; the client
 * merges it into one line per ingredient name, so two boxes that both need
 * chicken make one chicken line. Ticks are kept by line name.
 */

type List = IShoppingList

async function listFor(userId: string): Promise<List> {
    return (await ShoppingList.findOne({ user: userId })) ?? (await ShoppingList.create({ user: userId, groups: [] }))
}

const keyOf = (name: string) => name.trim().toLowerCase()

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

/**
 * Boxes and meals take their ingredients as they are now (a deleted one keeps
 * what it had).
 */
async function refreshBoxes(userId: string, list: List) {
    const ids = (kind: IShoppingGroup['kind']) => list.groups.filter((g) => g.kind === kind && g.ref).map((g) => g.ref)
    const boxIds = ids('box')
    const mealIds = ids('meal')
    const [foods, meals] = await Promise.all([
        boxIds.length ? PlateFood.find({ user: userId, _id: { $in: boxIds } }) : [],
        mealIds.length ? Meal.find({ user: userId, _id: { $in: mealIds } }) : [],
    ])
    for (const g of list.groups) {
        const source =
            g.kind === 'box'
                ? foods.find((f) => String(f._id) === String(g.ref))
                : g.kind === 'meal'
                  ? meals.find((m) => String(m._id) === String(g.ref))
                  : undefined
        if (!source) continue
        g.name = source.name
        g.ingredients = (source.ingredients ?? []).map((i) => ({ name: i.name, grams: i.grams, items: i.items }))
    }
}

/** Save, dropping ticks for lines no longer on the list, and answer with it. */
async function send(userId: string, res: Response, list: List) {
    await refreshBoxes(userId, list)
    const present = new Set(list.groups.flatMap(linesOf))
    list.ticked = [...new Set(list.ticked)].filter((t) => present.has(t))
    list.markModified('groups')
    await list.save()
    res.json({ message: 'OK', data: { groups: list.groups, ticked: list.ticked } })
}

/** GET /api/shopping — what's been added, and which lines are ticked. */
export async function getShopping(req: AuthRequest, res: Response) {
    await send(req.userId!, res, await listFor(req.userId!))
}

/**
 * POST /api/shopping/add { kind: 'meal' | 'food', id } — adds it, or one more
 * of it if it's already on the list (a batch more, for a box).
 */
export async function addToShopping(req: AuthRequest, res: Response) {
    const { kind, id } = req.body ?? {}
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
        }
    } else if (kind === 'food') {
        const food = await PlateFood.findOne({ _id: id, user: req.userId })
        if (!food) {
            res.status(404).json({ message: 'Food not found' })
            return
        }
        entry = {
            kind: food.kind === 'box' ? 'box' : 'food',
            ref: food._id as IShoppingGroup['ref'],
            name: food.name,
            ingredients: food.kind === 'box' ? food.ingredients.map((i) => ({ name: i.name, grams: i.grams, items: i.items })) : [],
        }
    } else {
        res.status(400).json({ message: "kind must be 'meal' or 'food'" })
        return
    }
    let group = list.groups.find((g) => g.kind === entry.kind && String(g.ref) === String(entry.ref))
    if (group) group.count += 1
    else {
        group = { id: randomUUID(), ...entry, count: 1 }
        list.groups.push(group)
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
        await refreshBoxes(req.userId!, list)
        const ticked = new Set(list.ticked)
        list.groups = list.groups.filter((g) => !linesOf(g).every((l) => ticked.has(l)))
    } else {
        list.groups = []
        list.ticked = []
    }
    await send(req.userId!, res, list)
}
