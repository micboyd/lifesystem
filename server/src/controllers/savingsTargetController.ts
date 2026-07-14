import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import SavingsTarget from '../models/SavingsTarget'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

function num(v: unknown): number | undefined {
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function month(v: unknown): string | undefined {
    return typeof v === 'string' && MONTH_RE.test(v) ? v : undefined
}

export async function listSavingsTargets(req: AuthRequest, res: Response) {
    // Manual order first; ties (legacy plans and fresh saves all default to 0)
    // fall back to newest-first, matching the old behaviour.
    const targets = await SavingsTarget.find({ user: req.userId }).sort({ order: 1, createdAt: -1 })
    res.json({ message: 'OK', data: targets })
}

export async function createSavingsTarget(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) { res.status(400).json({ message: 'name is required' }); return }

    const targetAmount = num(req.body.targetAmount)
    const startMonth = month(req.body.startMonth)
    const targetMonth = month(req.body.targetMonth)
    const savedMonth = month(req.body.savedMonth)
    if (targetAmount === undefined || !startMonth || !targetMonth || !savedMonth) {
        res.status(400).json({ message: 'targetAmount, startMonth, targetMonth and savedMonth are required' })
        return
    }

    const target = await SavingsTarget.create({
        user: req.userId,
        name,
        notes: typeof req.body.notes === 'string' ? req.body.notes.trim() || undefined : undefined,
        mode: req.body.mode === 'contribution' ? 'contribution' : 'target',
        targetAmount,
        startingBalance: num(req.body.startingBalance) ?? 0,
        annualInterestRate: num(req.body.annualInterestRate) ?? 0,
        startMonth,
        targetMonth,
        savedMonth,
        onTrack: req.body.onTrack === true,
        requiredMonthly: num(req.body.requiredMonthly) ?? 0,
        contributionMonths: num(req.body.contributionMonths) ?? 0,
        totalContributions: num(req.body.totalContributions) ?? 0,
        interestEarned: num(req.body.interestEarned) ?? 0,
        growthOnly: num(req.body.growthOnly) ?? 0,
    })
    res.status(201).json({ message: 'Created', data: target })
}

export async function updateSavingsTarget(req: AuthRequest, res: Response) {
    // A snapshot is immutable apart from its name, notes, display order and
    // priority flag — the computed plan itself never changes.
    const set: Record<string, unknown> = {}
    const unset: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) set.name = req.body.name.trim()
    if (typeof req.body.notes === 'string') {
        const notes = req.body.notes.trim()
        if (notes) set.notes = notes
        else unset.notes = 1
    }
    if (req.body.notes === null) unset.notes = 1
    if (num(req.body.order) !== undefined) set.order = num(req.body.order)
    if (typeof req.body.priority === 'boolean') set.priority = req.body.priority
    if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
        res.status(400).json({ message: 'nothing to update' })
        return
    }

    const target = await SavingsTarget.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        {
            ...(Object.keys(set).length > 0 && { $set: set }),
            ...(Object.keys(unset).length > 0 && { $unset: unset }),
        },
        { new: true }
    )
    if (!target) { res.status(404).json({ message: 'Savings target not found' }); return }
    res.json({ message: 'Saved', data: target })
}

export async function deleteSavingsTarget(req: AuthRequest, res: Response) {
    const target = await SavingsTarget.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!target) { res.status(404).json({ message: 'Savings target not found' }); return }
    res.json({ message: 'Deleted', data: null })
}
