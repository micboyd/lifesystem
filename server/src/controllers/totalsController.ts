import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import TotalRow from '../models/TotalRow'
import TotalValue, { DATE_PATTERN } from '../models/TotalValue'

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

// ── Rows ──────────────────────────────────────────────────────────────────────

/** GET /api/totals — list the user's total-row definitions. */
export async function listRows(req: AuthRequest, res: Response) {
    const rows = await TotalRow.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: rows })
}

/** POST /api/totals — create a named row. */
export async function createRow(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    const last = await TotalRow.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0
    const row = await TotalRow.create({ user: req.userId, name, order })
    res.status(201).json({ message: 'Created', data: row })
}

/** PUT /api/totals/:id — rename or reorder a row. */
export async function updateRow(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    if (typeof req.body.order === 'number') fields.order = req.body.order

    const row = await TotalRow.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }
    res.json({ message: 'Saved', data: row })
}

/** DELETE /api/totals/:id — delete a row and all its values. */
export async function deleteRow(req: AuthRequest, res: Response) {
    const row = await TotalRow.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }
    await TotalValue.deleteMany({ user: req.userId, row: req.params.id })
    res.json({ message: 'Deleted' })
}

// ── Values ────────────────────────────────────────────────────────────────────

/** GET /api/totals/values?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function listValues(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    const query: Record<string, unknown> = { user: req.userId }
    if (from || to) {
        if (!isValidDate(from) || !isValidDate(to)) {
            res.status(400).json({ message: 'from and to must both be YYYY-MM-DD' })
            return
        }
        query.date = { $gte: from, $lte: to }
    }
    const values = await TotalValue.find(query)
    res.json({ message: 'OK', data: values })
}

/** PUT /api/totals/:id/values/:date — upsert (or clear) a row's value for a day. */
export async function setValue(req: AuthRequest, res: Response) {
    const { id, date } = req.params
    if (!isValidDate(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    // Ensure the row belongs to the user.
    const row = await TotalRow.findOne({ _id: id, user: req.userId })
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }

    const raw = req.body.value
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN

    // Empty / invalid → clear the value for that day.
    if (raw === null || raw === undefined || raw === '' || Number.isNaN(num)) {
        await TotalValue.deleteOne({ user: req.userId, row: id, date })
        res.json({ message: 'Cleared', data: null })
        return
    }

    const value = await TotalValue.findOneAndUpdate(
        { user: req.userId, row: id, date },
        { $set: { value: num } },
        { upsert: true, new: true }
    )
    res.json({ message: 'Saved', data: value })
}
