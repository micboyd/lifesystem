import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import BudgetSpend from '../models/BudgetSpend'
import FinanceRow from '../models/FinanceRow'
import StarlingExclusion from '../models/StarlingExclusion'

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

interface TombstonePayload {
    userId: string
    feedItemUid: string
    reason: 'deleted' | 'moved'
    originalRowId: string
    originalRowName: string
    movedToRowName?: string
    spendId?: string
    date: string
    amount: number
    note?: string
}

/**
 * Permanently mark a Starling feed item as "don't auto-import this again", with a
 * snapshot of the transaction so it can be restored later from the "removed
 * transactions" drawer. Used whenever a Starling-linked transaction is deleted or
 * moved away from its originating budget, since Starling's own feed still shows it
 * under the source Space and a later sync would otherwise treat it as new.
 */
async function tombstoneFeedItem(payload: TombstonePayload): Promise<void> {
    const { userId, feedItemUid, originalRowId, ...rest } = payload
    await StarlingExclusion.updateOne(
        { user: userId, feedItemUid },
        { $setOnInsert: { user: userId, feedItemUid, originalRow: originalRowId, ...rest } },
        { upsert: true }
    )
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

/**
 * PUT /budget-spends/:id/move — reassign a transaction to a different budget row.
 *
 * If the transaction was imported from Starling, this also detaches it from that
 * link (clears starlingFeedItemUid) and tombstones the feed item: the underlying
 * transaction is still attributed to the original Space in Starling's own feed, so
 * without the tombstone, a future sync of the original budget would see it as new
 * and re-import a duplicate there.
 *
 * The move itself happens first, before any tombstone bookkeeping — that way a
 * failure writing the tombstone (e.g. a duplicate-key clash from a retried request)
 * can never abort or half-apply the move the user actually asked for. Worst case if
 * tombstoning fails, a later sync could re-import this one Starling transaction —
 * annoying but recoverable (delete or move it again) — instead of losing the move.
 */
export async function moveBudgetSpend(req: AuthRequest, res: Response) {
    const rowId = typeof req.body.row === 'string' ? req.body.row : ''
    if (!rowId) {
        res.status(400).json({ message: 'row is required' })
        return
    }

    const targetRow = await FinanceRow.findOne({ _id: rowId, user: req.userId, budgeted: true })
    if (!targetRow) {
        res.status(404).json({ message: 'Target budget not found' })
        return
    }

    const existing = await BudgetSpend.findOne({ _id: req.params.id, user: req.userId })
    if (!existing) {
        res.status(404).json({ message: 'Transaction not found' })
        return
    }

    const previousRowId = existing.row
    const previousFeedItemUid = existing.starlingFeedItemUid

    const spend = await BudgetSpend.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: { row: rowId }, $unset: { starlingFeedItemUid: '' } },
        { new: true }
    )

    if (previousFeedItemUid) {
        try {
            const originalRow = await FinanceRow.findById(previousRowId)
            await tombstoneFeedItem({
                userId: req.userId!,
                feedItemUid: previousFeedItemUid,
                reason: 'moved',
                originalRowId: String(previousRowId),
                originalRowName: originalRow?.name ?? 'Unknown budget',
                movedToRowName: targetRow.name,
                spendId: String(existing._id),
                date: existing.date,
                amount: existing.amount,
                note: existing.note,
            })
        } catch (err) {
            console.error('moveBudgetSpend: tombstone write failed after a successful move', err)
        }
    }

    res.json({ message: 'Moved', data: spend })
}

/**
 * DELETE /budget-spends/:id — remove a transaction. If it came from Starling, also
 * tombstone its feed item so a future sync won't silently re-import it. Tombstone
 * failures are logged, not thrown — the delete has already happened by that point
 * and shouldn't be reported as failed over a secondary bookkeeping step.
 */
export async function deleteBudgetSpend(req: AuthRequest, res: Response) {
    const spend = await BudgetSpend.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!spend) {
        res.status(404).json({ message: 'Transaction not found' })
        return
    }
    if (spend.starlingFeedItemUid) {
        try {
            const originalRow = await FinanceRow.findById(spend.row)
            await tombstoneFeedItem({
                userId: req.userId!,
                feedItemUid: spend.starlingFeedItemUid,
                reason: 'deleted',
                originalRowId: String(spend.row),
                originalRowName: originalRow?.name ?? 'Unknown budget',
                date: spend.date,
                amount: spend.amount,
                note: spend.note,
            })
        } catch (err) {
            console.error('deleteBudgetSpend: tombstone write failed after a successful delete', err)
        }
    }
    res.json({ message: 'Deleted', data: null })
}
