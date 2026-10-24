import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import List, { LIST_KINDS, type IListItem, type ListKind } from '../models/List'

const MAX_ITEMS = 1000

function isKind(v: unknown): v is ListKind {
    return typeof v === 'string' && (LIST_KINDS as readonly string[]).includes(v)
}

/** Keeps only well-formed items; returns null when the payload isn't an array. */
function cleanItems(v: unknown): IListItem[] | null {
    if (!Array.isArray(v)) return null
    return v
        .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
        .filter((i) => typeof i.id === 'string' && i.id.length > 0)
        .slice(0, MAX_ITEMS)
        .map((i) => ({
            id: String(i.id),
            text: typeof i.text === 'string' ? i.text : '',
            done: i.done === true,
        }))
}

export async function listLists(req: AuthRequest, res: Response) {
    const lists = await List.find({ user: req.userId }).sort({ pinned: -1, updatedAt: -1 })
    res.json({ message: 'OK', data: lists })
}

export async function createList(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    if (!title) {
        res.status(400).json({ message: 'title is required' })
        return
    }
    const list = await List.create({
        user: req.userId,
        title,
        kind: isKind(req.body.kind) ? req.body.kind : 'checklist',
        items: cleanItems(req.body.items) ?? [],
    })
    res.status(201).json({ message: 'Created', data: list })
}

export async function updateList(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.title === 'string' && req.body.title.trim()) fields.title = req.body.title.trim()
    if (isKind(req.body.kind)) fields.kind = req.body.kind
    if (typeof req.body.pinned === 'boolean') fields.pinned = req.body.pinned
    const items = cleanItems(req.body.items)
    if (items) fields.items = items

    const list = await List.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!list) {
        res.status(404).json({ message: 'List not found' })
        return
    }
    res.json({ message: 'Saved', data: list })
}

export async function deleteList(req: AuthRequest, res: Response) {
    const list = await List.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!list) {
        res.status(404).json({ message: 'List not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}
