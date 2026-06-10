import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import BudgetExclusion from '../models/BudgetExclusion'

const MONTH_RE = /^\d{4}-\d{2}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function listBudgetExclusions(req: AuthRequest, res: Response) {
    const { month } = req.query
    if (typeof month !== 'string' || !MONTH_RE.test(month)) {
        res.status(400).json({ message: 'month (YYYY-MM) required' })
        return
    }
    const exclusions = await BudgetExclusion.find({
        user: req.userId,
        date: { $regex: `^${month}` },
    })
    res.json({ message: 'OK', data: exclusions })
}

export async function setBudgetExclusion(req: AuthRequest, res: Response) {
    const { date } = req.params
    if (!DATE_RE.test(date)) {
        res.status(400).json({ message: 'date must be YYYY-MM-DD' })
        return
    }

    const excluded: boolean = req.body.excluded === true

    if (excluded) {
        const record = await BudgetExclusion.findOneAndUpdate(
            { user: req.userId, date },
            { $setOnInsert: { user: req.userId, date } },
            { upsert: true, new: true }
        )
        res.json({ message: 'Excluded', data: record })
    } else {
        await BudgetExclusion.deleteOne({ user: req.userId, date })
        res.json({ message: 'Included', data: null })
    }
}
