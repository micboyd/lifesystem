import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Note from '../models/Note'
import NoteCategory, { NOTE_CATEGORY_COLORS, NoteCategoryColor } from '../models/NoteCategory'

function isColor(v: unknown): v is NoteCategoryColor {
    return typeof v === 'string' && (NOTE_CATEGORY_COLORS as readonly string[]).includes(v)
}

// ── Categories ──────────────────────────────────────────────────────────────

export async function listCategories(req: AuthRequest, res: Response) {
    const categories = await NoteCategory.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: categories })
}

export async function createCategory(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) { res.status(400).json({ message: 'name is required' }); return }
    const order = await NoteCategory.countDocuments({ user: req.userId })
    const category = await NoteCategory.create({
        user: req.userId,
        name,
        color: isColor(req.body.color) ? req.body.color : 'neutral',
        order,
    })
    res.status(201).json({ message: 'Created', data: category })
}

export async function updateCategory(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    if (isColor(req.body.color)) fields.color = req.body.color
    if (typeof req.body.order === 'number') fields.order = req.body.order

    const category = await NoteCategory.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!category) { res.status(404).json({ message: 'Category not found' }); return }
    res.json({ message: 'Saved', data: category })
}

export async function deleteCategory(req: AuthRequest, res: Response) {
    const category = await NoteCategory.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!category) { res.status(404).json({ message: 'Category not found' }); return }
    // Notes in this category become uncategorised rather than being deleted with it.
    await Note.updateMany(
        { user: req.userId, category: category._id },
        { $set: { category: null } }
    )
    res.json({ message: 'Deleted', data: null })
}

// ── Notes ───────────────────────────────────────────────────────────────────

export async function listNotes(req: AuthRequest, res: Response) {
    const filter: Record<string, unknown> = { user: req.userId }
    const category = req.query.category
    if (category === 'none') filter.category = null
    else if (typeof category === 'string' && category) filter.category = category

    const notes = await Note.find(filter).sort({ updatedAt: -1 })
    res.json({ message: 'OK', data: notes })
}

/** Resolve a category value from the body to a valid owned id, or null. */
async function resolveCategory(userId: unknown, value: unknown): Promise<string | null> {
    if (typeof value !== 'string' || value === '') return null
    const exists = await NoteCategory.exists({ _id: value, user: userId })
    return exists ? value : null
}

export async function createNote(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    if (!title) { res.status(400).json({ message: 'title is required' }); return }
    const note = await Note.create({
        user: req.userId,
        title,
        body: typeof req.body.body === 'string' ? req.body.body : '',
        category: await resolveCategory(req.userId, req.body.category),
    })
    res.status(201).json({ message: 'Created', data: note })
}

export async function updateNote(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.title === 'string' && req.body.title.trim()) fields.title = req.body.title.trim()
    if (typeof req.body.body === 'string') fields.body = req.body.body
    // category: null or '' clears it; a valid owned id sets it; anything else is ignored.
    if (req.body.category === null || req.body.category === '') {
        fields.category = null
    } else if (typeof req.body.category === 'string') {
        fields.category = await resolveCategory(req.userId, req.body.category)
    }

    const note = await Note.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    res.json({ message: 'Saved', data: note })
}

export async function deleteNote(req: AuthRequest, res: Response) {
    const note = await Note.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    res.json({ message: 'Deleted', data: null })
}
