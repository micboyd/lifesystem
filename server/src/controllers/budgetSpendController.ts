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

export async function setBudgetSpend(req: AuthRequest, res: Response) {
    const { rowId, date } = req.params
    if (!DATE_RE.test(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const row = await FinanceRow.findOne({ _id: rowId, user: req.userId })
    if (!row) { res.status(404).json({ message: 'Row not found' }); return }

    const raw = req.body.amount
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN

    if (raw === null || raw === undefined || raw === '' || Number.isNaN(num)) {
        await BudgetSpend.deleteOne({ user: req.userId, row: rowId, date })
        res.json({ message: 'Cleared', data: null })
        return
    }

    const spend = await BudgetSpend.findOneAndUpdate(
        { user: req.userId, row: rowId, date },
        { $set: { amount: num } },
        { upsert: true, new: true }
    )
    res.json({ message: 'Saved', data: spend })
}
