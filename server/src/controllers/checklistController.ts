import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Checklist, { CHECKLIST_COLORS, ChecklistColor } from '../models/Checklist'

function isColor(v: unknown): v is ChecklistColor {
    return typeof v === 'string' && (CHECKLIST_COLORS as readonly string[]).includes(v)
}

// ── Checklists ────────────────────────────────────────────────────────────────

export async function listChecklists(req: AuthRequest, res: Response) {
    const checklists = await Checklist.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: checklists })
}

export async function createChecklist(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    if (!title) { res.status(400).json({ message: 'title is required' }); return }
    const order = await Checklist.countDocuments({ user: req.userId })
    const checklist = await Checklist.create({
        user: req.userId,
        title,
        description: typeof req.body.description === 'string' ? req.body.description.trim() : undefined,
        color: isColor(req.body.color) ? req.body.color : 'neutral',
        // Seed one unnamed group so items can be added straight away.
        groups: [{ name: '', items: [], order: 0 }],
        order,
    })
    res.status(201).json({ message: 'Created', data: checklist })
}

export async function updateChecklist(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.title === 'string' && req.body.title.trim()) fields.title = req.body.title.trim()
    if (typeof req.body.description === 'string') fields.description = req.body.description.trim() || undefined
    if (req.body.description === null) fields.description = undefined
    if (isColor(req.body.color)) fields.color = req.body.color
    if (typeof req.body.order === 'number') fields.order = req.body.order

    const checklist = await Checklist.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    res.json({ message: 'Saved', data: checklist })
}

export async function deleteChecklist(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    res.json({ message: 'Deleted', data: null })
}

/** Uncheck every item across every group. */
export async function resetChecklist(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    for (const group of checklist.groups) {
        for (const item of group.items) item.done = false
    }
    await checklist.save()
    res.json({ message: 'Saved', data: checklist })
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function addGroup(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const order = checklist.groups.length
    checklist.groups.push({ name, items: [], order } as never)
    await checklist.save()
    res.status(201).json({ message: 'Created', data: checklist })
}

export async function updateGroup(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    const group = checklist.groups.find((g) => g._id.toString() === req.params.groupId)
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    if (typeof req.body.name === 'string') group.name = req.body.name.trim()
    if (typeof req.body.order === 'number') group.order = req.body.order
    await checklist.save()
    res.json({ message: 'Saved', data: checklist })
}

export async function deleteGroup(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    checklist.groups = checklist.groups.filter(
        (g) => g._id.toString() !== req.params.groupId
    ) as never
    await checklist.save()
    res.json({ message: 'Deleted', data: checklist })
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function addItem(req: AuthRequest, res: Response) {
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : ''
    if (!text) { res.status(400).json({ message: 'text is required' }); return }
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    const group = checklist.groups.find((g) => g._id.toString() === req.params.groupId)
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    const order = group.items.length
    group.items.push({ text, done: false, order } as never)
    await checklist.save()
    res.status(201).json({ message: 'Created', data: checklist })
}

export async function updateItem(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    const group = checklist.groups.find((g) => g._id.toString() === req.params.groupId)
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    const item = group.items.find((i) => i._id.toString() === req.params.itemId)
    if (!item) { res.status(404).json({ message: 'Item not found' }); return }
    if (typeof req.body.text === 'string' && req.body.text.trim()) item.text = req.body.text.trim()
    if (typeof req.body.done === 'boolean') item.done = req.body.done
    if (typeof req.body.order === 'number') item.order = req.body.order
    await checklist.save()
    res.json({ message: 'Saved', data: checklist })
}

export async function deleteItem(req: AuthRequest, res: Response) {
    const checklist = await Checklist.findOne({ _id: req.params.id, user: req.userId })
    if (!checklist) { res.status(404).json({ message: 'Checklist not found' }); return }
    const group = checklist.groups.find((g) => g._id.toString() === req.params.groupId)
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    group.items = group.items.filter((i) => i._id.toString() !== req.params.itemId) as never
    await checklist.save()
    res.json({ message: 'Deleted', data: checklist })
}
