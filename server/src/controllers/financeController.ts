import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import FinanceGroup from '../models/FinanceGroup'
import FinanceRow from '../models/FinanceRow'
import FinancePot from '../models/FinancePot'
import FinanceEntry, { MONTH_PATTERN } from '../models/FinanceEntry'

function isValidMonth(v: unknown): v is string {
    return typeof v === 'string' && MONTH_PATTERN.test(v)
}

/** Shift a "YYYY-MM" string by a number of months. */
function addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

type DeleteMode = 'all' | 'onward' | 'month'

function deleteMode(v: unknown): DeleteMode {
    return v === 'onward' || v === 'month' ? v : 'all'
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
    const startMonth = isValidMonth(req.body.startMonth) ? req.body.startMonth : null
    const endMonth = isValidMonth(req.body.endMonth) ? req.body.endMonth : null
    const group = await FinanceGroup.create({
        user: req.userId,
        name,
        type,
        order,
        startMonth,
        endMonth,
    })

    // Savings groups get exactly one auto-created row
    if (type === 'savings') {
        await FinanceRow.create({ user: req.userId, group: group._id, name: 'Savings', order: 0 })
    }

    res.status(201).json({ message: 'Created', data: group })
}

export async function updateGroup(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim())
        fields.name = req.body.name.trim()
    if (['income', 'expense', 'savings'].includes(req.body.type)) fields.type = req.body.type
    if (typeof req.body.order === 'number') fields.order = req.body.order
    if (typeof req.body.currentBalance === 'number') fields.currentBalance = req.body.currentBalance
    if (req.body.currentBalance === null) fields.currentBalance = 0
    if (typeof req.body.annualInterestRate === 'number')
        fields.annualInterestRate = req.body.annualInterestRate
    if (req.body.annualInterestRate === null) fields.annualInterestRate = 0
    if (isValidMonth(req.body.startMonth) || req.body.startMonth === null)
        fields.startMonth = req.body.startMonth ?? null
    if (isValidMonth(req.body.endMonth) || req.body.endMonth === null)
        fields.endMonth = req.body.endMonth ?? null

    const group = await FinanceGroup.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!group) {
        res.status(404).json({ message: 'Group not found' })
        return
    }
    res.json({ message: 'Saved', data: group })
}

export async function deleteGroup(req: AuthRequest, res: Response) {
    const mode = deleteMode(req.query.mode)
    const month = req.query.month

    // Soft scopes keep the group (and its rows/history); just adjust its visibility window.
    if (mode !== 'all' && isValidMonth(month)) {
        const existing = await FinanceGroup.findOne({ _id: req.params.id, user: req.userId })
        if (!existing) {
            res.status(404).json({ message: 'Group not found' })
            return
        }

        if (mode === 'month') {
            const updated = await FinanceGroup.findByIdAndUpdate(
                existing._id,
                { $addToSet: { skipMonths: month } },
                { new: true }
            )
            res.json({ message: 'Hidden for month', data: updated })
            return
        }

        // mode === 'onward': end the group the month before the viewed one.
        const newEnd = addMonths(month, -1)
        // If that leaves no active months at all, fall through to a hard delete.
        if (!existing.startMonth || existing.startMonth <= newEnd) {
            const updated = await FinanceGroup.findByIdAndUpdate(
                existing._id,
                { $set: { endMonth: newEnd } },
                { new: true }
            )
            res.json({ message: 'Ended', data: updated })
            return
        }
    }

    const group = await FinanceGroup.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!group) {
        res.status(404).json({ message: 'Group not found' })
        return
    }
    const rows = await FinanceRow.find({ user: req.userId, group: req.params.id })
    const rowIds = rows.map((r) => r._id)
    await FinanceEntry.deleteMany({ user: req.userId, row: { $in: rowIds } })
    await FinanceRow.deleteMany({ user: req.userId, group: req.params.id })
    res.json({ message: 'Deleted', data: null })
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
    if (!group) {
        res.status(404).json({ message: 'Group not found' })
        return
    }
    if (group.type === 'savings') {
        res.status(400).json({ message: 'Savings groups have a fixed single row' })
        return
    }

    const last = await FinanceRow.findOne({ user: req.userId, group: groupId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0
    const recurringAmount =
        typeof req.body.recurringAmount === 'number' ? req.body.recurringAmount : undefined
    const recurring = req.body.recurring === false ? false : true
    // Non-recurring rows are scoped to a specific month
    const month = !recurring && isValidMonth(req.body.month) ? req.body.month : null
    // Recurring rows can start from a given month ("all months from here on")
    const startMonth = recurring && isValidMonth(req.body.startMonth) ? req.body.startMonth : null
    const pot = typeof req.body.pot === 'string' ? req.body.pot : null
    const row = await FinanceRow.create({
        user: req.userId,
        group: groupId,
        name,
        recurringAmount,
        recurring,
        month,
        startMonth,
        order,
        pot,
    })
    res.status(201).json({ message: 'Created', data: row })
}

export async function updateRow(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim())
        fields.name = req.body.name.trim()
    if (typeof req.body.order === 'number') fields.order = req.body.order
    if (typeof req.body.recurringAmount === 'number')
        fields.recurringAmount = req.body.recurringAmount
    if (req.body.recurringAmount === null) fields.recurringAmount = undefined
    if (typeof req.body.recurring === 'boolean') fields.recurring = req.body.recurring
    if (typeof req.body.budgeted === 'boolean') fields.budgeted = req.body.budgeted
    if (req.body.budgetType === 'daily') fields.budgetType = 'daily'
    if (req.body.budgetType === null) fields.budgetType = null
    if (typeof req.body.pot === 'string' || req.body.pot === null) fields.pot = req.body.pot ?? null
    if (isValidMonth(req.body.startMonth) || req.body.startMonth === null)
        fields.startMonth = req.body.startMonth ?? null
    if (isValidMonth(req.body.endMonth) || req.body.endMonth === null)
        fields.endMonth = req.body.endMonth ?? null

    const row = await FinanceRow.findOneAndUpdate(
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

export async function deleteRow(req: AuthRequest, res: Response) {
    const mode = deleteMode(req.query.mode)
    const month = req.query.month

    // Soft scopes only apply to recurring rows (one-time rows live in a single month).
    if (mode !== 'all' && isValidMonth(month)) {
        const existing = await FinanceRow.findOne({ _id: req.params.id, user: req.userId })
        if (!existing) {
            res.status(404).json({ message: 'Row not found' })
            return
        }

        if (existing.recurring !== false) {
            if (mode === 'month') {
                const updated = await FinanceRow.findByIdAndUpdate(
                    existing._id,
                    { $addToSet: { skipMonths: month } },
                    { new: true }
                )
                res.json({ message: 'Hidden for month', data: updated })
                return
            }

            // mode === 'onward'
            const newEnd = addMonths(month, -1)
            if (!existing.startMonth || existing.startMonth <= newEnd) {
                const updated = await FinanceRow.findByIdAndUpdate(
                    existing._id,
                    { $set: { endMonth: newEnd } },
                    { new: true }
                )
                res.json({ message: 'Ended', data: updated })
                return
            }
        }
    }

    const row = await FinanceRow.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }
    await FinanceEntry.deleteMany({ user: req.userId, row: req.params.id })
    res.json({ message: 'Deleted', data: null })
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
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }

    const raw = req.body.amount
    const num =
        typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && raw.trim() !== ''
              ? Number(raw)
              : NaN

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

// ── Pots ──────────────────────────────────────────────────────────────────────

/** GET /api/finances/pots — list pots for the user, optionally filtered by group. */
export async function listPots(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    if (typeof req.query.group === 'string') query.group = req.query.group
    const pots = await FinancePot.find(query).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: pots })
}

/** POST /api/finances/pots — create a pot within a group. */
export async function createPot(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) { res.status(400).json({ message: 'name is required' }); return }
    const group = typeof req.body.group === 'string' ? req.body.group : ''
    if (!group) { res.status(400).json({ message: 'group is required' }); return }
    const last = await FinancePot.findOne({ user: req.userId, group }).sort({ order: -1 })
    const pot = await FinancePot.create({ user: req.userId, group, name, order: last ? last.order + 1 : 0 })
    res.status(201).json({ message: 'Created', data: pot })
}

/** PUT /api/finances/pots/:id — rename a pot. */
export async function updatePot(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    const pot = await FinancePot.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!pot) { res.status(404).json({ message: 'Pot not found' }); return }
    res.json({ message: 'Saved', data: pot })
}

/** DELETE /api/finances/pots/:id — delete a pot and unassign its rows. */
export async function deletePot(req: AuthRequest, res: Response) {
    const pot = await FinancePot.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!pot) { res.status(404).json({ message: 'Pot not found' }); return }
    await FinanceRow.updateMany({ user: req.userId, pot: pot._id }, { $set: { pot: null } })
    res.json({ message: 'Deleted', data: pot })
}
