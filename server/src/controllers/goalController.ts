import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Goal, { GOAL_STATUSES, GoalStatus } from '../models/Goal'

function isStatus(v: unknown): v is GoalStatus {
    return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v)
}

export async function listGoals(req: AuthRequest, res: Response) {
    const goals = await Goal.find({ user: req.userId }).sort({ createdAt: -1 })
    res.json({ message: 'OK', data: goals })
}

export async function createGoal(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    if (!title) { res.status(400).json({ message: 'title is required' }); return }
    const goal = await Goal.create({
        user: req.userId,
        title,
        description: typeof req.body.description === 'string' ? req.body.description.trim() : undefined,
        targetDate: typeof req.body.targetDate === 'string' ? req.body.targetDate : undefined,
        progress: typeof req.body.progress === 'number' ? Math.min(100, Math.max(0, req.body.progress)) : 0,
        status: isStatus(req.body.status) ? req.body.status : 'active',
    })
    res.status(201).json({ message: 'Created', data: goal })
}

export async function updateGoal(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.title === 'string' && req.body.title.trim()) fields.title = req.body.title.trim()
    if (typeof req.body.description === 'string') fields.description = req.body.description.trim() || undefined
    if (req.body.description === null) fields.description = undefined
    if (typeof req.body.targetDate === 'string') fields.targetDate = req.body.targetDate || undefined
    if (req.body.targetDate === null) fields.targetDate = undefined
    if (typeof req.body.progress === 'number') fields.progress = Math.min(100, Math.max(0, req.body.progress))
    if (isStatus(req.body.status)) fields.status = req.body.status

    const goal = await Goal.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    res.json({ message: 'Saved', data: goal })
}

export async function deleteGoal(req: AuthRequest, res: Response) {
    const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    res.json({ message: 'Deleted', data: null })
}

// ── Milestones ────────────────────────────────────────────────────────────────

export async function addMilestone(req: AuthRequest, res: Response) {
    const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
    if (!title) { res.status(400).json({ message: 'title is required' }); return }
    const goal = await Goal.findOne({ _id: req.params.id, user: req.userId })
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    const order = goal.milestones.length
    goal.milestones.push({ title, completed: false, order } as never)
    await goal.save()
    res.status(201).json({ message: 'Created', data: goal })
}

export async function updateMilestone(req: AuthRequest, res: Response) {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.userId })
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    const ms = goal.milestones.find((m) => m._id.toString() === req.params.milestoneId)
    if (!ms) { res.status(404).json({ message: 'Milestone not found' }); return }
    if (typeof req.body.title === 'string' && req.body.title.trim()) ms.title = req.body.title.trim()
    if (typeof req.body.completed === 'boolean') ms.completed = req.body.completed
    // If all milestones are now complete, snap progress to 100.
    if (goal.milestones.length > 0 && goal.milestones.every((m) => m.completed)) {
        goal.progress = 100
    }
    await goal.save()
    res.json({ message: 'Saved', data: goal })
}

export async function deleteMilestone(req: AuthRequest, res: Response) {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.userId })
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    goal.milestones = goal.milestones.filter(
        (m) => m._id.toString() !== req.params.milestoneId
    ) as never
    await goal.save()
    res.json({ message: 'Deleted', data: goal })
}
