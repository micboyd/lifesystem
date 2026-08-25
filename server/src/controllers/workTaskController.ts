import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import WorkTask, {
    DATE_PATTERN,
    WORK_TASK_PRIORITIES,
    WORK_TASK_STATUSES,
    type IWorkTask,
    type WorkTaskPriority,
    type WorkTaskStatus,
} from '../models/WorkTask'

/** How far back completed work stays in the default list. */
const DONE_WINDOW_DAYS = 30

function str(v: unknown): string | undefined {
    return typeof v === 'string' ? v.trim() : undefined
}

function taskStatus(v: unknown): WorkTaskStatus | undefined {
    return typeof v === 'string' && (WORK_TASK_STATUSES as readonly string[]).includes(v)
        ? (v as WorkTaskStatus)
        : undefined
}

function priority(v: unknown): WorkTaskPriority | undefined {
    return typeof v === 'string' && (WORK_TASK_PRIORITIES as readonly string[]).includes(v)
        ? (v as WorkTaskPriority)
        : undefined
}

function dateOrUndefined(v: unknown): string | undefined {
    return typeof v === 'string' && DATE_PATTERN.test(v) ? v : undefined
}

/** An ObjectId, or null for "no link" — anything else means "leave it alone". */
function refField(v: unknown): Types.ObjectId | null | undefined {
    if (v === null || v === '') return null
    if (typeof v === 'string' && Types.ObjectId.isValid(v)) return new Types.ObjectId(v)
    return undefined
}

function today(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The bookkeeping that hangs off a status change, kept in one place so every
 * route agrees on it.
 *
 * The clocks the UI reads — how long something has been blocked, when it was
 * finished — are stamped here rather than sent by the client, so they can't be
 * skewed by a stale tab or a client-side clock.
 */
function applyStatus(task: IWorkTask, next: WorkTaskStatus) {
    const previous = task.status
    if (previous === next) return
    task.status = next

    if (next === 'waiting') {
        // Re-blocking an item starts a fresh clock: the useful number is how
        // long it's been stuck *this* time.
        task.waitingSince = today()
        task.nudgedAt = undefined
    } else if (previous === 'waiting') {
        task.waitingSince = undefined
        task.nudgedAt = undefined
        // `waitingOn` survives, so re-blocking remembers who owes it.
    }

    if (next === 'done') {
        task.completedAt = new Date()
    } else if (previous === 'done') {
        task.completedAt = null
    }
}

/**
 * GET /api/work/tasks?scope=open|recent|all
 *
 * `recent` (the default) is open work plus anything finished in the last month:
 * enough for the list to show what you just ticked off and for a project card
 * to count its completed work, without dragging a year of history into memory.
 */
export async function listTasks(req: AuthRequest, res: Response) {
    const scope = req.query.scope
    const query: Record<string, unknown> = { user: req.userId }

    if (scope === 'open') {
        query.status = { $ne: 'done' }
    } else if (scope !== 'all') {
        const cutoff = new Date(Date.now() - DONE_WINDOW_DAYS * 86_400_000)
        query.$or = [{ status: { $ne: 'done' } }, { completedAt: { $gte: cutoff } }]
    }

    const tasks = await WorkTask.find(query).sort({ order: 1, createdAt: -1 })
    res.json({ message: 'OK', data: tasks })
}

/** POST /api/work/tasks */
export async function createTask(req: AuthRequest, res: Response) {
    const title = str(req.body.title)
    if (!title) {
        res.status(400).json({ message: 'title is required' })
        return
    }

    const status = taskStatus(req.body.status) ?? 'todo'
    const waitingOn = refField(req.body.waitingOn) ?? null

    // Captured work goes to the top of the list — you just wrote it down, it's
    // what you're thinking about.
    const first = await WorkTask.findOne({ user: req.userId }).sort({ order: 1 })

    const task = await WorkTask.create({
        user: req.userId,
        title,
        notes: str(req.body.notes) || undefined,
        status,
        priority: priority(req.body.priority) ?? 'normal',
        project: refField(req.body.project) ?? null,
        dueDate: dateOrUndefined(req.body.dueDate),
        source: str(req.body.source) || undefined,
        waitingOn,
        waitingFor: str(req.body.waitingFor) || undefined,
        waitingSince: status === 'waiting' ? today() : undefined,
        completedAt: status === 'done' ? new Date() : null,
        order: first ? first.order - 1 : 0,
    })

    res.status(201).json({ message: 'Created', data: task })
}

/** PUT /api/work/tasks/:id */
export async function updateTask(req: AuthRequest, res: Response) {
    const task = await WorkTask.findOne({ _id: req.params.id, user: req.userId })
    if (!task) {
        res.status(404).json({ message: 'Task not found' })
        return
    }

    const title = str(req.body.title)
    if (title !== undefined) {
        if (!title) {
            res.status(400).json({ message: 'title cannot be empty' })
            return
        }
        task.title = title
    }

    const notes = str(req.body.notes)
    if (notes !== undefined) task.notes = notes || undefined
    const source = str(req.body.source)
    if (source !== undefined) task.source = source || undefined
    const waitingFor = str(req.body.waitingFor)
    if (waitingFor !== undefined) task.waitingFor = waitingFor || undefined

    const nextPriority = priority(req.body.priority)
    if (nextPriority) task.priority = nextPriority

    const project = refField(req.body.project)
    if (project !== undefined) task.project = project

    const waitingOn = refField(req.body.waitingOn)
    if (waitingOn !== undefined) task.waitingOn = waitingOn

    if (req.body.dueDate === null || req.body.dueDate === '') {
        task.dueDate = undefined
    } else {
        const due = dateOrUndefined(req.body.dueDate)
        if (due) task.dueDate = due
    }

    if (typeof req.body.order === 'number') task.order = req.body.order

    // Last, so the status bookkeeping sees the final shape of the task.
    const nextStatus = taskStatus(req.body.status)
    if (nextStatus) applyStatus(task, nextStatus)

    await task.save()
    res.json({ message: 'Updated', data: task })
}

/**
 * POST /api/work/tasks/:id/nudge — record that you chased it today.
 *
 * Separate from the generic update because it is one tap from the Waiting On
 * list, and because "when did I last chase this" is the question that list
 * exists to answer.
 */
export async function nudgeTask(req: AuthRequest, res: Response) {
    const task = await WorkTask.findOne({ _id: req.params.id, user: req.userId })
    if (!task) {
        res.status(404).json({ message: 'Task not found' })
        return
    }
    task.nudgedAt = today()
    await task.save()
    res.json({ message: 'Nudged', data: task })
}

/** DELETE /api/work/tasks/:id */
export async function deleteTask(req: AuthRequest, res: Response) {
    const task = await WorkTask.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!task) {
        res.status(404).json({ message: 'Task not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
