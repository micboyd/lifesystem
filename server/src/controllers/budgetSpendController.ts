import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import BudgetSpend from '../models/BudgetSpend'
import FinanceRow from '../models/FinanceRow'

const MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function listBudgetSpends(req: AuthRequest, res: Response) {
    const { month, date } = req.query
    const query: Record<string, unknown> = { user: req.userId }

    if (typeof month === 'string' && MONTH_RE.test(month)) {
        query.date = { $regex: `^${month}` }
    } else if (typeof date === 'string' && DATE_RE.test(date)) {
        query.date = date
    } else {
        res.status(400).json({ message: 'month (YYYY-MM) or date (YYYY-MM-DD) required' })
        return
    }

    const spends = await BudgetSpend.find(query)
    res.json({ message: 'OK', data: spends })
}

function parseAmount(raw: unknown): number | null {
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return Number.isNaN(num) || num < 0 ? null : num
}

function parseNote(raw: unknown): string | undefined {
    return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, 200) : undefined
}

/** POST /budget-spends — log a single transaction against a row on a date. */
export async function createBudgetSpend(req: AuthRequest, res: Response) {
    const { row: rowId, date } = req.body
    if (typeof date !== 'string' || !DATE_RE.test(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const row = await FinanceRow.findOne({ _id: rowId, user: req.userId })
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }

    const amount = parseAmount(req.body.amount)
    if (amount === null) {
        res.status(400).json({ message: 'amount must be a number ≥ 0' })
        return
    }

    const spend = await BudgetSpend.create({
        user: req.userId,
        row: rowId,
        date,
        amount,
        note: parseNote(req.body.note),
    })
    res.status(201).json({ message: 'Created', data: spend })
}

/** PUT /budget-spends/:id — edit a transaction's amount and/or note. */
export async function updateBudgetSpend(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}

    if (req.body.amount !== undefined) {
        const amount = parseAmount(req.body.amount)
        if (amount === null) {
            res.status(400).json({ message: 'amount must be a number ≥ 0' })
            return
        }
        fields.amount = amount
    }
    if (req.body.note !== undefined) {
        fields.note = parseNote(req.body.note) ?? null
    }

    const spend = await BudgetSpend.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!spend) {
        res.status(404).json({ message: 'Transaction not found' })
        return
    }
    res.json({ message: 'Saved', data: spend })
}

/** DELETE /budget-spends/:id — remove a transaction. */
export async function deleteBudgetSpend(req: AuthRequest, res: Response) {
    const spend = await BudgetSpend.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!spend) {
        res.status(404).json({ message: 'Transaction not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}
