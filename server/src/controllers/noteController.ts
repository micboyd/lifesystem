import { Response } from 'express'
import bcrypt from 'bcryptjs'
import { AuthRequest } from '../middleware/auth'
import Note, { INote } from '../models/Note'
import NoteCategory, { NOTE_CATEGORY_COLORS, NoteCategoryColor } from '../models/NoteCategory'
import User from '../models/User'

function isColor(v: unknown): v is NoteCategoryColor {
    return typeof v === 'string' && (NOTE_CATEGORY_COLORS as readonly string[]).includes(v)
}

/**
 * Shape a note for the client: `passwordHash` is always stripped, and a locked
 * note's body is blanked unless the caller has just proven the password
 * (`includeBody`). Keeps the secret and the protected content off the wire.
 */
function serializeNote(note: INote, includeBody = false) {
    const obj = note.toObject() as Record<string, unknown>
    delete obj.passwordHash
    if (obj.locked && !includeBody) obj.body = ''
    return obj
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
    res.json({ message: 'OK', data: notes.map((n) => serializeNote(n)) })
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
    res.status(201).json({ message: 'Created', data: serializeNote(note, true) })
}

export async function updateNote(req: AuthRequest, res: Response) {
    const existing = await Note.findOne({ _id: req.params.id, user: req.userId })
    if (!existing) { res.status(404).json({ message: 'Note not found' }); return }
    // A locked note can only be edited by someone who proves its password.
    if (existing.locked && !(await verifyNotePassword(existing, req.body.password))) {
        res.status(403).json({ message: 'Incorrect password' }); return
    }

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
    // The caller who edited a locked note already holds its body, so echo it back.
    res.json({ message: 'Saved', data: serializeNote(note, true) })
}

export async function deleteNote(req: AuthRequest, res: Response) {
    const note = await Note.findOne({ _id: req.params.id, user: req.userId })
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    if (note.locked && !(await verifyNotePassword(note, req.body.password))) {
        res.status(403).json({ message: 'Incorrect password' }); return
    }
    await note.deleteOne()
    res.json({ message: 'Deleted', data: null })
}

// ── Locking ───────────────────────────────────────────────────────────────────

/** True when `candidate` matches the note's stored password hash. */
async function verifyNotePassword(note: INote, candidate: unknown): Promise<boolean> {
    if (!note.passwordHash || typeof candidate !== 'string' || !candidate) return false
    return bcrypt.compare(candidate, note.passwordHash)
}

/** Set a password on an unlocked note and hide its body from lists. */
export async function lockNote(req: AuthRequest, res: Response) {
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    if (password.length < 4) {
        res.status(400).json({ message: 'Password must be at least 4 characters' }); return
    }
    const note = await Note.findOne({ _id: req.params.id, user: req.userId })
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    if (note.locked) { res.status(409).json({ message: 'Note is already locked' }); return }

    note.passwordHash = await bcrypt.hash(password, 10)
    note.locked = true
    await note.save()
    res.json({ message: 'Locked', data: serializeNote(note) })
}

/** Verify the password and return the full note without changing its lock state. */
export async function revealNote(req: AuthRequest, res: Response) {
    const note = await Note.findOne({ _id: req.params.id, user: req.userId })
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    if (!note.locked) { res.json({ message: 'OK', data: serializeNote(note, true) }); return }
    if (!(await verifyNotePassword(note, req.body.password))) {
        res.status(403).json({ message: 'Incorrect password' }); return
    }
    res.json({ message: 'OK', data: serializeNote(note, true) })
}

/** Verify the password, then permanently remove the note's protection. */
export async function unlockNote(req: AuthRequest, res: Response) {
    const note = await Note.findOne({ _id: req.params.id, user: req.userId })
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    if (note.locked && !(await verifyNotePassword(note, req.body.password))) {
        res.status(403).json({ message: 'Incorrect password' }); return
    }
    note.locked = false
    note.passwordHash = null
    await note.save()
    res.json({ message: 'Unlocked', data: serializeNote(note, true) })
}

/** Recovery path: confirm the account login password to clear a forgotten lock. */
export async function resetNoteLock(req: AuthRequest, res: Response) {
    const accountPassword = typeof req.body.accountPassword === 'string' ? req.body.accountPassword : ''
    const user = await User.findById(req.userId)
    if (!user || !(await bcrypt.compare(accountPassword, user.password))) {
        res.status(403).json({ message: 'Incorrect account password' }); return
    }
    const note = await Note.findOne({ _id: req.params.id, user: req.userId })
    if (!note) { res.status(404).json({ message: 'Note not found' }); return }
    note.locked = false
    note.passwordHash = null
    await note.save()
    res.json({ message: 'Unlocked', data: serializeNote(note, true) })
}
