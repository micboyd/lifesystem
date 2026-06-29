import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FinanceSubItem from '../models/FinanceSubItem'
import FinanceRow from '../models/FinanceRow'

const MONTH_RE = /^\d{4}-\d{2}$/

export async function listSubItems(req: AuthRequest, res: Response) {
    const { row, month } = req.query
    if (typeof row !== 'string') {
        res.status(400).json({ message: 'row (id) is required' })
        return
    }
    const query: Record<string, unknown> = { user: req.userId, row }
    // If month provided filter by it (recurring rows); otherwise return month-less items
    if (typeof month === 'string' && MONTH_RE.test(month)) {
        query.month = month
    } else {
        query.month = { $exists: false }
    }
    const items = await FinanceSubItem.find(query).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: items })
}

export async function createSubItem(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const rowId = typeof req.body.row === 'string' ? req.body.row.trim() : ''
    const amount = typeof req.body.amount === 'number' ? req.body.amount : NaN
    const month =
        typeof req.body.month === 'string' && MONTH_RE.test(req.body.month)
            ? req.body.month
            : undefined

    if (!name || !rowId || Number.isNaN(amount)) {
        res.status(400).json({ message: 'name, row and amount are required' })
        return
    }

    const row = await FinanceRow.findOne({ _id: rowId, user: req.userId })
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }

    const query: Record<string, unknown> = { user: req.userId, row: rowId }
    if (month) query.month = month
    else query.month = { $exists: false }
    const last = await FinanceSubItem.findOne(query).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const item = await FinanceSubItem.create({
        user: req.userId,
        row: rowId,
        ...(month && { month }),
        name,
        amount,
        order,
    })
    res.status(201).json({ message: 'Created', data: item })
}

export async function updateSubItem(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim())
        fields.name = req.body.name.trim()
    if (typeof req.body.amount === 'number') fields.amount = req.body.amount
    if (typeof req.body.order === 'number') fields.order = req.body.order
    if (typeof req.body.paid === 'boolean') fields.paid = req.body.paid

    const item = await FinanceSubItem.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!item) {
        res.status(404).json({ message: 'Item not found' })
        return
    }
    res.json({ message: 'Saved', data: item })
}

export async function deleteSubItem(req: AuthRequest, res: Response) {
    const item = await FinanceSubItem.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Item not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
