import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import FinanceGroup from '../models/FinanceGroup'
import FinanceRow from '../models/FinanceRow'
import FinancePot from '../models/FinancePot'
import FinanceEntry from '../models/FinanceEntry'
import { planFinanceImport, MONTH_RE, type GroupRef, type PotRef } from '../lib/financeImport'

/**
 * POST /api/finances/import — apply a finance plan document.
 * `?dryRun=1` returns the summary without writing anything (the preview).
 * The document is checked in full first; if anything is wrong nothing is written.
 */
export async function importFinancePlan(req: AuthRequest, res: Response) {
    const userId = req.userId!
    const dryRun = req.query.dryRun === '1'
    const month = typeof req.body?.month === 'string' ? req.body.month.trim() : ''

    const [groups, rows, pots, entries] = await Promise.all([
        FinanceGroup.find({ user: userId }).sort({ order: 1, createdAt: 1 }).lean(),
        FinanceRow.find({ user: userId }).sort({ order: 1, createdAt: 1 }).lean(),
        FinancePot.find({ user: userId }).lean(),
        MONTH_RE.test(month) ? FinanceEntry.find({ user: userId, month }).lean() : Promise.resolve([]),
    ])

    const id = (v: unknown) => String(v)
    const plan = planFinanceImport(req.body, {
        groups: groups.map((g) => ({ ...g, _id: id(g._id) })),
        rows: rows.map((r) => ({ ...r, _id: id(r._id), group: id(r.group), pot: r.pot ? id(r.pot) : null })),
        pots: pots.map((p) => ({ _id: id(p._id), group: id(p.group), name: p.name })),
        entries: entries.map((e) => ({ row: id(e.row), month: e.month, amount: e.amount })),
    })

    if (plan.errors.length) {
        res.status(400).json({ message: `Import failed. ${plan.errors.join(' ')}`, errors: plan.errors })
        return
    }
    if (dryRun) {
        res.json({ message: 'Preview', data: plan.summary })
        return
    }

    const newGroupIds: Types.ObjectId[] = []
    const newPotIds: Types.ObjectId[] = []
    const groupId = (ref: GroupRef) => ('id' in ref ? ref.id : newGroupIds[ref.newIndex])
    const potId = (ref: PotRef) => (ref === null ? null : 'id' in ref ? ref.id : newPotIds[ref.newIndex])

    for (const op of plan.ops) {
        switch (op.kind) {
            case 'createGroup': {
                const g = await FinanceGroup.create({
                    user: userId,
                    name: op.name,
                    type: op.type,
                    order: op.order,
                    startMonth: op.startMonth,
                    endMonth: null,
                })
                newGroupIds[op.index] = g._id as Types.ObjectId
                break
            }
            case 'updateGroup':
                await FinanceGroup.updateOne({ _id: op.id, user: userId }, { $set: op.set })
                break
            case 'createPot': {
                const p = await FinancePot.create({ user: userId, group: groupId(op.group), name: op.name, order: op.order })
                newPotIds[op.index] = p._id as Types.ObjectId
                break
            }
            case 'createRow':
                await FinanceRow.create({
                    user: userId,
                    group: groupId(op.group),
                    pot: potId(op.pot),
                    name: op.name,
                    order: op.order,
                    recurring: op.recurring,
                    month: op.month,
                    startMonth: op.startMonth,
                    recurringAmount: op.recurringAmount,
                    budgeted: op.budgeted,
                    budgetType: op.budgetType,
                    weeklyAmount: op.weeklyAmount,
                })
                break
            case 'updateRow': {
                const set = { ...op.set }
                if (set.pot && typeof set.pot === 'object') set.pot = potId(set.pot as PotRef)
                await FinanceRow.updateOne({ _id: op.id, user: userId }, { $set: set })
                break
            }
            case 'clearEntry':
                await FinanceEntry.deleteOne({ user: userId, row: op.row, month: op.month })
                break
        }
    }

    res.json({ message: 'Imported', data: plan.summary })
}
