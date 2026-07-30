import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import Goal, { GOAL_STATUSES, GoalStatus, PROGRESS_MODES, ProgressMode, IGoal } from '../models/Goal'
import HabitLog from '../models/HabitLog'
import { daysBetween } from '../lib/dates'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isStatus(v: unknown): v is GoalStatus {
    return typeof v === 'string' && (GOAL_STATUSES as readonly string[]).includes(v)
}

function isMode(v: unknown): v is ProgressMode {
    return typeof v === 'string' && (PROGRESS_MODES as readonly string[]).includes(v)
}

function isDateKey(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

/** Today as a UTC "YYYY-MM-DD" key, consistent with daysBetween's UTC math. */
function todayKey(): string {
    return new Date().toISOString().slice(0, 10)
}

/** Parse a stringified list of habit ids into unique, valid ObjectIds. */
function parseHabitIds(v: unknown): Types.ObjectId[] {
    if (!Array.isArray(v)) return []
    const seen = new Set<string>()
    const out: Types.ObjectId[] = []
    for (const raw of v) {
        const id = typeof raw === 'string' ? raw : ''
        if (Types.ObjectId.isValid(id) && !seen.has(id)) {
            seen.add(id)
            out.push(new Types.ObjectId(id))
        }
    }
    return out
}

export interface DerivedProgress {
    windowDays: number
    elapsedDays: number
    habits: { habit: string; completedDays: number; rate: number }[]
}

/**
 * For an 'auto' goal, computes progress as the mean per-habit consistency rate:
 * completed days ÷ total days in the goal window. The window runs from
 * `startDate` (or the creation date) to `targetDate` (or today if open-ended).
 * Completions are only counted up to today, so future days count against the
 * denominator but can't yet be filled.
 */
async function computeDerived(goal: IGoal, userId: string): Promise<DerivedProgress | null> {
    if (goal.progressMode !== 'auto' || goal.linkedHabits.length === 0) return null

    const today = todayKey()
    const start = goal.startDate ?? goal.createdAt.toISOString().slice(0, 10)
    const end = goal.targetDate && goal.targetDate >= start ? goal.targetDate : today
    // Inclusive day counts.
    const windowDays = Math.max(1, daysBetween(start, end) + 1)
    const elapsedDays = Math.max(0, Math.min(daysBetween(start, today), daysBetween(start, end)) + 1)
    const countTo = end < today ? end : today

    const logs = await HabitLog.find({
        user: userId,
        habit: { $in: goal.linkedHabits },
        completed: true,
        date: { $gte: start, $lte: countTo },
    }).select('habit date')

    const counts = new Map<string, number>()
    for (const log of logs) {
        const key = log.habit.toString()
        counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const habits = goal.linkedHabits.map((h) => {
        const id = h.toString()
        const completedDays = counts.get(id) ?? 0
        return { habit: id, completedDays, rate: Math.min(1, completedDays / windowDays) }
    })

    return { windowDays, elapsedDays, habits }
}

/** Serialises a goal, overriding `progress` with the derived value for 'auto' goals. */
async function serialize(goal: IGoal, userId: string) {
    const derived = await computeDerived(goal, userId)
    const base = goal.toObject()
    if (derived) {
        const mean = derived.habits.reduce((s, h) => s + h.rate, 0) / derived.habits.length
        return { ...base, progress: Math.round(mean * 100), derived }
    }
    return base
}

export async function listGoals(req: AuthRequest, res: Response) {
    const goals = await Goal.find({ user: req.userId }).sort({ createdAt: -1 })
    const data = await Promise.all(goals.map((g) => serialize(g, req.userId!)))
    res.json({ message: 'OK', data })
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
        progressMode: isMode(req.body.progressMode) ? req.body.progressMode : 'manual',
        linkedHabits: parseHabitIds(req.body.linkedHabits),
        startDate: isDateKey(req.body.startDate) ? req.body.startDate : undefined,
    })
    res.status(201).json({ message: 'Created', data: await serialize(goal, req.userId!) })
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
    if (isMode(req.body.progressMode)) fields.progressMode = req.body.progressMode
    if (Array.isArray(req.body.linkedHabits)) fields.linkedHabits = parseHabitIds(req.body.linkedHabits)
    if (isDateKey(req.body.startDate)) fields.startDate = req.body.startDate
    if (req.body.startDate === null || req.body.startDate === '') fields.startDate = undefined

    const goal = await Goal.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    res.json({ message: 'Saved', data: await serialize(goal, req.userId!) })
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
    res.status(201).json({ message: 'Created', data: await serialize(goal, req.userId!) })
}

export async function updateMilestone(req: AuthRequest, res: Response) {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.userId })
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    const ms = goal.milestones.find((m) => m._id.toString() === req.params.milestoneId)
    if (!ms) { res.status(404).json({ message: 'Milestone not found' }); return }
    if (typeof req.body.title === 'string' && req.body.title.trim()) ms.title = req.body.title.trim()
    if (typeof req.body.completed === 'boolean') ms.completed = req.body.completed
    // If all milestones are now complete, snap manual progress to 100.
    // ('auto' goals derive progress from habits, so leave it alone.)
    if (goal.progressMode === 'manual' && goal.milestones.length > 0 && goal.milestones.every((m) => m.completed)) {
        goal.progress = 100
    }
    await goal.save()
    res.json({ message: 'Saved', data: await serialize(goal, req.userId!) })
}

export async function deleteMilestone(req: AuthRequest, res: Response) {
    const goal = await Goal.findOne({ _id: req.params.id, user: req.userId })
    if (!goal) { res.status(404).json({ message: 'Goal not found' }); return }
    goal.milestones = goal.milestones.filter(
        (m) => m._id.toString() !== req.params.milestoneId
    ) as never
    await goal.save()
    res.json({ message: 'Deleted', data: await serialize(goal, req.userId!) })
}
