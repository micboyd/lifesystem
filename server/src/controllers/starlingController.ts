import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import BudgetSpend from '../models/BudgetSpend'
import FinanceRow from '../models/FinanceRow'
import StarlingExclusion, { IStarlingExclusion } from '../models/StarlingExclusion'
import {
    StarlingError,
    StarlingFeedItem,
    getFeedBetween,
    getSpaceBalance,
    listSpaces,
    minorToMajor,
    starlingConfigured,
} from '../lib/starling'

const MONTH_RE = /^\d{4}-\d{2}$/

// The calendar we bucket transactions into — should match what you see in the
// Starling app (and the rest of the app's dates).
const LOCAL_TZ = 'Europe/London'

// Card auths that never actually left the account — ignore so they don't inflate a budget.
const NON_SPENDING_STATUSES = new Set(['DECLINED', 'REFUSED', 'REVERSED'])

// Moving money between a space and your main balance shows on the feed but is not
// spending — exclude it so top-ups/withdrawals don't count against the budget.
const NON_SPENDING_SOURCES = new Set(['INTERNAL_TRANSFER'])

/**
 * UTC window to fetch, widened a day either side of the target month. We over-fetch
 * and then bucket by LOCAL date, so a transaction near a month boundary lands in the
 * right month regardless of the UTC/BST offset.
 */
function monthFetchWindow(month: string): { min: string; max: string } {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1))
    start.setUTCDate(start.getUTCDate() - 1)
    const end = new Date(Date.UTC(y, m, 1))
    end.setUTCDate(end.getUTCDate() + 1)
    return { min: start.toISOString(), max: end.toISOString() }
}

/** The local (Europe/London) calendar date "YYYY-MM-DD" an instant falls on. */
function localDate(iso: string): string {
    // en-CA renders as YYYY-MM-DD; the timeZone shifts it to the local calendar day.
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: LOCAL_TZ })
}

function isNonSpending(it: StarlingFeedItem): boolean {
    return NON_SPENDING_STATUSES.has(it.status) || NON_SPENDING_SOURCES.has(it.source ?? '')
}

/** Feed items for a Space, scoped to the local calendar month, split into
 *  genuine spend (what the budget imports) vs everything else (what explains
 *  a balance/budget mismatch — transfers, refunds, declined card auths). */
function classifyMonth(
    items: StarlingFeedItem[],
    month: string
): { spends: StarlingFeedItem[]; movements: StarlingFeedItem[] } {
    const inMonth = items.filter((it) => localDate(it.transactionTime).slice(0, 7) === month)
    const spends = inMonth.filter((it) => it.direction === 'OUT' && !isNonSpending(it))
    const movements = inMonth.filter((it) => !(it.direction === 'OUT' && !isNonSpending(it)))
    return { spends, movements }
}

type MovementReason = 'transfer_in' | 'transfer_out' | 'refund' | 'declined' | 'reversed'

function movementReason(it: StarlingFeedItem): MovementReason {
    if (NON_SPENDING_SOURCES.has(it.source ?? '')) return it.direction === 'IN' ? 'transfer_in' : 'transfer_out'
    if (it.status === 'DECLINED' || it.status === 'REFUSED') return 'declined'
    if (it.status === 'REVERSED') return 'reversed'
    return 'refund' // direction IN, a real refund/payment received — not counted as negative spend
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

    const { min, max } = monthFetchWindow(month)
    let items: StarlingFeedItem[]
    try {
        items = await getFeedBetween(row.starlingCategoryUid, min, max)
    } catch (err) {
        if (handleStarlingError(res, err)) return
        throw err
    }

    const { spends: candidateSpends } = classifyMonth(items, month)

    // Transactions the user has deliberately deleted or moved elsewhere stay gone,
    // even though Starling itself still shows them under this Space.
    const excludedUids = new Set(
        (await StarlingExclusion.find({ user: req.userId }).select('feedItemUid').lean()).map(
            (e) => e.feedItemUid
        )
    )
    const spends = candidateSpends.filter((it) => !excludedUids.has(it.feedItemUid))
    const skipped = candidateSpends.length - spends.length

    let imported = 0
    let updated = 0
    const seenUids: string[] = []
    for (const it of spends) {
        const date = localDate(it.transactionTime)
        const amount = minorToMajor(it.amount.minorUnits)
        const note = (it.counterPartyName || it.reference || '').trim().slice(0, 200)

        const set: Record<string, unknown> = { row: row._id, date, amount }
        if (note) set.note = note

        const result = await BudgetSpend.updateOne(
            { user: req.userId, starlingFeedItemUid: it.feedItemUid },
            { $set: set },
            { upsert: true }
        )
        seenUids.push(it.feedItemUid)
        if (result.upsertedCount) imported++
        else if (result.modifiedCount) updated++
    }

    // Reconcile: drop transactions we imported for this budget/month before that no
    // longer qualify (e.g. a transfer moved back, or a payment later reversed). Only
    // ever touches Starling-imported spends — manual ones have no feedItemUid.
    const removal = await BudgetSpend.deleteMany({
        user: req.userId,
        row: row._id,
        date: { $regex: `^${month}` },
        starlingFeedItemUid: { $exists: true, $nin: seenUids },
    })
    const removed = removal.deletedCount ?? 0

    // Current balance too, so the client can refresh its mismatch check without a
    // second round trip.
    let balance: number | null = null
    try {
        balance = await getSpaceBalance(row.starlingCategoryUid)
    } catch {
        // Non-fatal — the sync itself succeeded, just skip the balance refresh.
    }

    res.json({
        message: 'Synced',
        data: { imported, updated, removed, skipped, total: spends.length, balance },
    })
}

/**
 * GET /finances/starling/reconcile?rowId=&month= — read-only. Explains a gap between
 * the linked Space's current balance and the budget's "remaining" figure by listing
 * everything in the month that moved the Space's money without counting as spend:
 * transfers in/out, refunds, and declined/reversed card auths.
 */
export async function getStarlingReconciliation(req: AuthRequest, res: Response) {
    if (!starlingConfigured()) {
        res.status(501).json({ message: 'Starling is not configured on the server' })
        return
    }

    const { rowId, month } = req.query
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

    const { min, max } = monthFetchWindow(month)
    let items: StarlingFeedItem[]
    let balance: number | null
    try {
        ;[items, balance] = await Promise.all([
            getFeedBetween(row.starlingCategoryUid, min, max),
            getSpaceBalance(row.starlingCategoryUid),
        ])
    } catch (err) {
        if (handleStarlingError(res, err)) return
        throw err
    }

    const { movements } = classifyMonth(items, month)
    const data = movements
        .map((it) => ({
            date: localDate(it.transactionTime),
            amount: minorToMajor(it.amount.minorUnits),
            direction: it.direction,
            reason: movementReason(it),
            counterPartyName: it.counterPartyName,
        }))
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    res.json({ message: 'OK', data: { balance, movements: data } })
}

/**
 * GET /finances/starling/exclusions — transactions deleted or moved away from a
 * Starling-linked budget, kept out of future syncs. Feeds the "removed
 * transactions" drawer, which can send any of them back with recoverStarlingExclusion.
 *
 * Only returns tombstones that carry the full snapshot (reason/date/amount/etc).
 * Earlier tombstones — written before those fields existed — still do their job of
 * blocking re-import in syncStarlingRow, but have nothing to display or recover, so
 * they're left out here rather than shown with missing data.
 */
export async function listStarlingExclusions(req: AuthRequest, res: Response) {
    const exclusions = await StarlingExclusion.find({
        user: req.userId,
        reason: { $exists: true },
    }).sort({ createdAt: -1 })
    res.json({ message: 'OK', data: exclusions })
}

/**
 * POST /finances/starling/exclusions/:id/recover — undo a delete or move.
 * - 'deleted': recreate the BudgetSpend from the stored snapshot, reattached to Starling.
 * - 'moved': send the still-live BudgetSpend back to its original budget and reattach it
 *   (falls back to recreating from the snapshot if that copy was itself deleted since).
 * Either way the tombstone is cleared, so normal syncing resumes for this transaction.
 */
export async function recoverStarlingExclusion(req: AuthRequest, res: Response) {
    const exclusion: IStarlingExclusion | null = await StarlingExclusion.findOne({
        _id: req.params.id,
        user: req.userId,
    })
    if (!exclusion) {
        res.status(404).json({ message: 'Nothing to recover' })
        return
    }

    const originalRow = await FinanceRow.findOne({
        _id: exclusion.originalRow,
        user: req.userId,
        budgeted: true,
    })
    if (!originalRow) {
        res.status(400).json({ message: 'The original budget no longer exists' })
        return
    }

    try {
        if (exclusion.reason === 'moved' && exclusion.spendId) {
            const spend = await BudgetSpend.findOneAndUpdate(
                { _id: exclusion.spendId, user: req.userId },
                { $set: { row: exclusion.originalRow, starlingFeedItemUid: exclusion.feedItemUid } },
                { new: true }
            )
            if (spend) {
                await exclusion.deleteOne()
                res.json({ message: 'Recovered', data: spend })
                return
            }
            // The moved copy was itself deleted since — fall through and recreate it.
        }

        const spend = await BudgetSpend.create({
            user: req.userId,
            row: exclusion.originalRow,
            date: exclusion.date,
            amount: exclusion.amount,
            note: exclusion.note,
            starlingFeedItemUid: exclusion.feedItemUid,
        })
        await exclusion.deleteOne()
        res.json({ message: 'Recovered', data: spend })
    } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
            res.status(409).json({ message: 'This transaction is already being tracked' })
            return
        }
        throw err
    }
}
