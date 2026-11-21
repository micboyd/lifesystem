import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import SpendReview from '../models/SpendReview'
import { MONTH_PATTERN } from '../models/MonthNote'

const MAX_BAD = 2000

function shape(month: string, doc: { bad: string[]; reportAt: Date | null } | null) {
    return { month, bad: doc?.bad ?? [], reportAt: doc?.reportAt ? doc.reportAt.toISOString() : null }
}

/** GET /api/finances/spend-reviews/:month — that month's good/bad review (empty when none). */
export async function getSpendReview(req: AuthRequest, res: Response) {
    const { month } = req.params
    if (!MONTH_PATTERN.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' })
    const doc = await SpendReview.findOne({ user: req.userId, month }).lean()
    res.json({ message: 'OK', data: shape(month, doc) })
}

/** PUT /api/finances/spend-reviews/:month — replace the review; an empty one is deleted. */
export async function putSpendReview(req: AuthRequest, res: Response) {
    const { month } = req.params
    if (!MONTH_PATTERN.test(month)) return res.status(400).json({ message: 'month must be YYYY-MM' })
    const { bad, reportAt } = req.body ?? {}
    if (!Array.isArray(bad) || bad.length > MAX_BAD || !bad.every((x) => typeof x === 'string' && x.length <= 100))
        return res.status(400).json({ message: 'bad must be a list of payment ids' })
    const at = reportAt == null ? null : new Date(reportAt)
    if (at && Number.isNaN(at.getTime())) return res.status(400).json({ message: 'reportAt must be a date' })
    const unique = [...new Set(bad as string[])]

    if (!unique.length && !at) {
        await SpendReview.deleteOne({ user: req.userId, month })
        return res.json({ message: 'OK', data: shape(month, null) })
    }
    const doc = await SpendReview.findOneAndUpdate(
        { user: req.userId, month },
        { $set: { bad: unique, reportAt: at } },
        { upsert: true, new: true, runValidators: true }
    ).lean()
    res.json({ message: 'OK', data: shape(month, doc) })
}
