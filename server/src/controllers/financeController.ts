import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FinanceGroup from '../models/FinanceGroup'
import FinanceRow from '../models/FinanceRow'
import FinanceEntry, { MONTH_PATTERN } from '../models/FinanceEntry'

function isValidMonth(v: unknown): v is string {
    return typeof v === 'string' && MONTH_PATTERN.test(v)
}

// ── Groups ────────────────────────────────────────────────────────────────────

export async function listGroups(req: AuthRequest, res: Response) {
    const groups = await FinanceGroup.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: groups })
}

export async function createGroup(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const validTypes = ['income', 'expense', 'savings']
    const type = validTypes.includes(req.body.type) ? req.body.type : null
    if (!name || !type) {
        res.status(400).json({ message: 'name and type (income|expense|savings) are required' })
        return
    }
    const last = await FinanceGroup.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0
    const group = await FinanceGroup.create({ user: req.userId, name, type, order })

    // Savings groups get exactly one auto-created row
    if (type === 'savings') {
        await FinanceRow.create({ user: req.userId, group: group._id, name: 'Savings', order: 0 })
    }

    res.status(201).json({ message: 'Created', data: group })
}

export async function updateGroup(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    if (['income', 'expense', 'savings'].includes(req.body.type)) fields.type = req.body.type
    if (typeof req.body.order === 'number') fields.order = req.body.order
    if (typeof req.body.currentBalance === 'number') fields.currentBalance = req.body.currentBalance
    if (req.body.currentBalance === null) fields.currentBalance = 0
    if (typeof req.body.annualInterestRate === 'number') fields.annualInterestRate = req.body.annualInterestRate
    if (req.body.annualInterestRate === null) fields.annualInterestRate = 0

    const group = await FinanceGroup.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    res.json({ message: 'Saved', data: group })
}

export async function deleteGroup(req: AuthRequest, res: Response) {
    const group = await FinanceGroup.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    const rows = await FinanceRow.find({ user: req.userId, group: req.params.id })
    const rowIds = rows.map((r) => r._id)
    await FinanceEntry.deleteMany({ user: req.userId, row: { $in: rowIds } })
    await FinanceRow.deleteMany({ user: req.userId, group: req.params.id })
    res.json({ message: 'Deleted' })
}

// ── Rows ──────────────────────────────────────────────────────────────────────

export async function listRows(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    if (req.query.group) query.group = req.query.group
    const rows = await FinanceRow.find(query).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: rows })
}

export async function createRow(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    const groupId = typeof req.body.group === 'string' ? req.body.group.trim() : ''
    if (!name || !groupId) {
        res.status(400).json({ message: 'name and group are required' })
        return
    }
    const group = await FinanceGroup.findOne({ _id: groupId, user: req.userId })
    if (!group) { res.status(404).json({ message: 'Group not found' }); return }
    if (group.type === 'savings') {
        res.status(400).json({ message: 'Savings groups have a fixed single row' })
        return
    }

    const last = await FinanceRow.findOne({ user: req.userId, group: groupId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0
    const recurringAmount = typeof req.body.recurringAmount === 'number' ? req.body.recurringAmount : undefined
    const recurring = req.body.recurring === false ? false : true
    // Non-recurring rows are scoped to a specific month
    const month = !recurring && isValidMonth(req.body.month) ? req.body.month : null
    const row = await FinanceRow.create({ user: req.userId, group: groupId, name, recurringAmount, recurring, month, order })
    res.status(201).json({ message: 'Created', data: row })
}

export async function updateRow(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    if (typeof req.body.order === 'number') fields.order = req.body.order
    if (typeof req.body.recurringAmount === 'number') fields.recurringAmount = req.body.recurringAmount
    if (req.body.recurringAmount === null) fields.recurringAmount = undefined
    if (typeof req.body.recurring === 'boolean') fields.recurring = req.body.recurring
    if (typeof req.body.budgeted === 'boolean') fields.budgeted = req.body.budgeted
    if (req.body.budgetType === 'daily') fields.budgetType = 'daily'
    if (req.body.budgetType === null) fields.budgetType = null

    const row = await FinanceRow.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!row) { res.status(404).json({ message: 'Row not found' }); return }
    res.json({ message: 'Saved', data: row })
}

export async function deleteRow(req: AuthRequest, res: Response) {
    const row = await FinanceRow.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!row) { res.status(404).json({ message: 'Row not found' }); return }
    await FinanceEntry.deleteMany({ user: req.userId, row: req.params.id })
    res.json({ message: 'Deleted' })
}

// ── Entries ───────────────────────────────────────────────────────────────────

export async function listEntries(req: AuthRequest, res: Response) {
    const { month } = req.query
    if (!isValidMonth(month)) {
        res.status(400).json({ message: 'month must be YYYY-MM' })
        return
    }
    const entries = await FinanceEntry.find({ user: req.userId, month })
    res.json({ message: 'OK', data: entries })
}

export async function setEntry(req: AuthRequest, res: Response) {
    const { rowId, month } = req.params
    if (!isValidMonth(month)) {
        res.status(400).json({ message: 'month must be YYYY-MM' })
        return
    }

    const row = await FinanceRow.findOne({ _id: rowId, user: req.userId })
    if (!row) { res.status(404).json({ message: 'Row not found' }); return }

    const raw = req.body.amount
    const num = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN

    if (raw === null || raw === undefined || raw === '' || Number.isNaN(num)) {
        await FinanceEntry.deleteOne({ user: req.userId, row: rowId, month })
        res.json({ message: 'Cleared', data: null })
        return
    }

    const entry = await FinanceEntry.findOneAndUpdate(
        { user: req.userId, row: rowId, month },
        { $set: { amount: num } },
        { upsert: true, new: true }
    )
    res.json({ message: 'Saved', data: entry })
}
