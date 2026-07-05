import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import ExclusionBudget from '../models/ExclusionBudget'
import BudgetExclusion from '../models/BudgetExclusion'
import FinanceRow from '../models/FinanceRow'

const MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseAmount(raw: unknown): number | null {
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
    return Number.isNaN(num) || num <= 0 ? null : num
}

function parseText(raw: unknown, max: number): string | undefined {
    return typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, max) : undefined
}

/** Dedupe, validate and sort a raw dates payload; null when invalid. */
function parseDates(raw: unknown): string[] | null {
    if (!Array.isArray(raw) || raw.length === 0) return null
    const dates = [...new Set(raw)]
    if (!dates.every((d) => typeof d === 'string' && DATE_RE.test(d))) return null
    return (dates as string[]).sort()
}

/** All dates must currently be excluded days. */
async function allExcluded(userId: string | undefined, dates: string[]): Promise<boolean> {
    const count = await BudgetExclusion.countDocuments({ user: userId, date: { $in: dates } })
    return count === dates.length
}

export async function listExclusionBudgets(req: AuthRequest, res: Response) {
    const { month } = req.query
    if (typeof month !== 'string' || !MONTH_RE.test(month)) {
        res.status(400).json({ message: 'month (YYYY-MM) required' })
        return
    }
    // $regex on an array field matches any element, so a pot spanning two
    // months is returned for both — intentional.
    const budgets = await ExclusionBudget.find({ user: req.userId, dates: { $regex: `^${month}` } })
    res.json({ message: 'OK', data: budgets })
}

export async function createExclusionBudget(req: AuthRequest, res: Response) {
    const dates = parseDates(req.body.dates)
    if (!dates) {
        res.status(400).json({ message: 'dates must be a non-empty array of YYYY-MM-DD strings' })
        return
    }
    const amount = parseAmount(req.body.amount)
    if (amount === null) {
        res.status(400).json({ message: 'amount must be a number > 0' })
        return
    }
    if (!(await allExcluded(req.userId, dates))) {
        res.status(400).json({ message: 'all dates must be excluded days' })
        return
    }
    if (await ExclusionBudget.exists({ user: req.userId, dates: { $in: dates } })) {
        res.status(409).json({ message: 'a date already belongs to another exclusion budget' })
        return
    }

    let rowId: string | undefined
    if (req.body.row) {
        const row = await FinanceRow.findOne({ _id: req.body.row, user: req.userId })
        if (!row) {
            res.status(404).json({ message: 'Row not found' })
            return
        }
        rowId = req.body.row
    }

    const budget = await ExclusionBudget.create({
        user: req.userId,
        dates,
        amount,
        row: rowId,
        label: parseText(req.body.label, 100),
        note: parseText(req.body.note, 200),
    })
    res.status(201).json({ message: 'Created', data: budget })
}

export async function updateExclusionBudget(req: AuthRequest, res: Response) {
    const budget = await ExclusionBudget.findOne({ _id: req.params.id, user: req.userId })
    if (!budget) {
        res.status(404).json({ message: 'Exclusion budget not found' })
        return
    }

    if (req.body.dates !== undefined) {
        const dates = parseDates(req.body.dates)
        if (!dates) {
            res.status(400).json({ message: 'dates must be a non-empty array of YYYY-MM-DD strings' })
            return
        }
        if (!(await allExcluded(req.userId, dates))) {
            res.status(400).json({ message: 'all dates must be excluded days' })
            return
        }
        const clash = await ExclusionBudget.exists({
            _id: { $ne: budget._id },
            user: req.userId,
            dates: { $in: dates },
        })
        if (clash) {
            res.status(409).json({ message: 'a date already belongs to another exclusion budget' })
            return
        }
        budget.dates = dates
    }
    if (req.body.amount !== undefined) {
        const amount = parseAmount(req.body.amount)
        if (amount === null) {
            res.status(400).json({ message: 'amount must be a number > 0' })
            return
        }
        budget.amount = amount
    }
    if (req.body.row !== undefined) {
        if (!req.body.row) {
            budget.row = undefined
        } else {
            const row = await FinanceRow.findOne({ _id: req.body.row, user: req.userId })
            if (!row) {
                res.status(404).json({ message: 'Row not found' })
                return
            }
            budget.row = row._id
        }
    }
    if (req.body.label !== undefined) budget.label = parseText(req.body.label, 100)
    if (req.body.note !== undefined) budget.note = parseText(req.body.note, 200)

    await budget.save()
    res.json({ message: 'Saved', data: budget })
}

export async function deleteExclusionBudget(req: AuthRequest, res: Response) {
    const budget = await ExclusionBudget.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!budget) {
        res.status(404).json({ message: 'Exclusion budget not found' })
        return
    }
    res.json({ message: 'Deleted', data: null })
}
