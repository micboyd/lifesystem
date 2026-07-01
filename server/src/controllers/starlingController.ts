import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import BudgetSpend from '../models/BudgetSpend'
import FinanceRow from '../models/FinanceRow'
import {
    StarlingError,
    getFeedBetween,
    listSpaces,
    minorToMajor,
    starlingConfigured,
} from '../lib/starling'

const MONTH_RE = /^\d{4}-\d{2}$/

// Card auths that never actually left the account — ignore so they don't inflate a budget.
const NON_SPENDING_STATUSES = new Set(['DECLINED', 'REFUSED', 'REVERSED'])

/** Turn "YYYY-MM" into the [start, endExclusive) ISO instants covering that month. */
function monthBounds(month: string): { min: string; max: string } {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end = new Date(Date.UTC(y, m, 1))
    return { min: start.toISOString(), max: end.toISOString() }
}

function handleStarlingError(res: Response, err: unknown): boolean {
    if (err instanceof StarlingError) {
        res.status(err.status).json({ message: err.message })
        return true
    }
    return false
}

/** GET /finances/starling/spaces — list linkable Spaces (spending + savings). */
export async function listStarlingSpaces(req: AuthRequest, res: Response) {
    if (!starlingConfigured()) {
        res.status(501).json({ message: 'Starling is not configured on the server' })
        return
    }
    try {
        const spaces = await listSpaces()
        res.json({ message: 'OK', data: spaces })
    } catch (err) {
        if (handleStarlingError(res, err)) return
        throw err
    }
}

/**
 * POST /finances/starling/sync — body { rowId, month }.
 * Pulls the linked Space's feed for the month and upserts money-out items as
 * budget transactions (keyed on the Starling feed item id, so re-syncing is safe).
 */
export async function syncStarlingRow(req: AuthRequest, res: Response) {
    if (!starlingConfigured()) {
        res.status(501).json({ message: 'Starling is not configured on the server' })
        return
    }

    const { rowId, month } = req.body
    if (typeof month !== 'string' || !MONTH_RE.test(month)) {
        res.status(400).json({ message: 'month must be YYYY-MM' })
        return
    }

    const row = await FinanceRow.findOne({ _id: rowId, user: req.userId })
    if (!row) {
        res.status(404).json({ message: 'Row not found' })
        return
    }
    if (!row.starlingCategoryUid) {
        res.status(400).json({ message: 'This budget is not linked to a Starling Space' })
        return
    }

    const { min, max } = monthBounds(month)
    let items
    try {
        items = await getFeedBetween(row.starlingCategoryUid, min, max)
    } catch (err) {
        if (handleStarlingError(res, err)) return
        throw err
    }

    const outgoings = items.filter(
        (it) => it.direction === 'OUT' && !NON_SPENDING_STATUSES.has(it.status)
    )

    let imported = 0
    let updated = 0
    for (const it of outgoings) {
        const date = it.transactionTime.slice(0, 10)
        const amount = minorToMajor(it.amount.minorUnits)
        const note = (it.counterPartyName || it.reference || '').trim().slice(0, 200)

        const set: Record<string, unknown> = { row: row._id, date, amount }
        if (note) set.note = note

        const result = await BudgetSpend.updateOne(
            { user: req.userId, starlingFeedItemUid: it.feedItemUid },
            { $set: set },
            { upsert: true }
        )
        if (result.upsertedCount) imported++
        else if (result.modifiedCount) updated++
    }

    res.json({
        message: 'Synced',
        data: { imported, updated, total: outgoings.length },
    })
}
