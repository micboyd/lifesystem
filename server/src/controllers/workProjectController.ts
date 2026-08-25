import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import WorkProject, {
    DATE_PATTERN,
    WORK_PROJECT_COLORS,
    WORK_PROJECT_STATUSES,
    type WorkProjectColor,
    type WorkProjectStatus,
} from '../models/WorkProject'
import WorkTask from '../models/WorkTask'

function str(v: unknown): string | undefined {
    return typeof v === 'string' ? v.trim() : undefined
}

function status(v: unknown): WorkProjectStatus | undefined {
    return typeof v === 'string' && (WORK_PROJECT_STATUSES as readonly string[]).includes(v)
        ? (v as WorkProjectStatus)
        : undefined
}

function color(v: unknown): WorkProjectColor | undefined {
    return typeof v === 'string' && (WORK_PROJECT_COLORS as readonly string[]).includes(v)
        ? (v as WorkProjectColor)
        : undefined
}

/** Today in the server's local timezone, as YYYY-MM-DD. */
function today(): string {
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export interface ProjectStats {
    open: number
    done: number
    waiting: number
    overdue: number
    /** Earliest due date among open tasks, or null. */
    nextDue: string | null
}

const EMPTY_STATS: ProjectStats = { open: 0, done: 0, waiting: 0, overdue: 0, nextDue: null }

/**
 * Task counts for every project in one aggregation, rather than a query per
 * card. A project's real status is its task list, so the cards would be close
 * to useless without these.
 */
async function statsByProject(userId: string): Promise<Map<string, ProjectStats>> {
    const rows = await WorkTask.aggregate<{
        _id: Types.ObjectId | null
        open: number
        done: number
        waiting: number
        overdue: number
        nextDue: string | null
    }>([
        { $match: { user: new Types.ObjectId(userId), project: { $ne: null } } },
        {
            $group: {
                _id: '$project',
                open: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 0, 1] } },
                done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
                waiting: { $sum: { $cond: [{ $eq: ['$status', 'waiting'] }, 1, 0] } },
                overdue: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ['$status', 'done'] },
                                    { $ne: ['$dueDate', null] },
                                    { $lt: ['$dueDate', today()] },
                                ],
                            },
                            1,
                            0,
                        ],
                    },
                },
                nextDue: {
                    $min: {
                        $cond: [{ $eq: ['$status', 'done'] }, null, '$dueDate'],
                    },
                },
            },
        },
    ])

    const map = new Map<string, ProjectStats>()
    for (const row of rows) {
        if (!row._id) continue
        map.set(String(row._id), {
            open: row.open,
            done: row.done,
            waiting: row.waiting,
            overdue: row.overdue,
            nextDue: row.nextDue ?? null,
        })
    }
    return map
}

/** GET /api/work/projects — every project, each with its task counts. */
export async function listProjects(req: AuthRequest, res: Response) {
    const [projects, stats] = await Promise.all([
        WorkProject.find({ user: req.userId }).sort({ order: 1, createdAt: 1 }),
        statsByProject(req.userId!),
    ])

    const data = projects.map((p) => ({
        ...p.toObject(),
        stats: stats.get(String(p._id)) ?? EMPTY_STATS,
    }))
    res.json({ message: 'OK', data })
}

/** POST /api/work/projects */
export async function createProject(req: AuthRequest, res: Response) {
    const name = str(req.body.name)
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const first = await WorkProject.findOne({ user: req.userId }).sort({ order: 1 })
    const state = str(req.body.state)

    const project = await WorkProject.create({
        user: req.userId,
        name,
        summary: str(req.body.summary) || undefined,
        state: state || undefined,
        stateUpdatedAt: state ? new Date() : null,
        status: status(req.body.status) ?? 'active',
        color: color(req.body.color) ?? 'slate',
        dueDate: typeof req.body.dueDate === 'string' && DATE_PATTERN.test(req.body.dueDate)
            ? req.body.dueDate
            : undefined,
        // New projects sort to the top — you just created it, it's what's on
        // your mind.
        order: first ? first.order - 1 : 0,
    })

    res.status(201).json({ message: 'Created', data: { ...project.toObject(), stats: EMPTY_STATS } })
}

/** PUT /api/work/projects/:id */
export async function updateProject(req: AuthRequest, res: Response) {
    const project = await WorkProject.findOne({ _id: req.params.id, user: req.userId })
    if (!project) {
        res.status(404).json({ message: 'Project not found' })
        return
    }

    const name = str(req.body.name)
    if (name !== undefined) {
        if (!name) {
            res.status(400).json({ message: 'name cannot be empty' })
            return
        }
        project.name = name
    }

    const summary = str(req.body.summary)
    if (summary !== undefined) project.summary = summary || undefined

    // Only a genuine change restamps the clock — re-saving the same text
    // shouldn't make a stale project look freshly reviewed.
    const state = str(req.body.state)
    if (state !== undefined && state !== (project.state ?? '')) {
        project.state = state || undefined
        project.stateUpdatedAt = state ? new Date() : null
    }

    const nextStatus = status(req.body.status)
    if (nextStatus) project.status = nextStatus
    const nextColor = color(req.body.color)
    if (nextColor) project.color = nextColor

    if (req.body.dueDate === null || req.body.dueDate === '') {
        project.dueDate = undefined
    } else if (typeof req.body.dueDate === 'string' && DATE_PATTERN.test(req.body.dueDate)) {
        project.dueDate = req.body.dueDate
    }

    if (typeof req.body.order === 'number') project.order = req.body.order

    await project.save()

    const stats = await statsByProject(req.userId!)
    res.json({
        message: 'Updated',
        data: { ...project.toObject(), stats: stats.get(String(project._id)) ?? EMPTY_STATS },
    })
}

/**
 * DELETE /api/work/projects/:id
 *
 * The project's tasks survive as unfiled work rather than being deleted with
 * it — losing a fortnight of tasks because a project was tidied away is not a
 * trade anyone would knowingly make.
 */
export async function deleteProject(req: AuthRequest, res: Response) {
    const project = await WorkProject.findOne({ _id: req.params.id, user: req.userId })
    if (!project) {
        res.status(404).json({ message: 'Project not found' })
        return
    }

    const { modifiedCount } = await WorkTask.updateMany(
        { user: req.userId, project: project._id },
        { $set: { project: null } }
    )
    await project.deleteOne()

    res.json({ message: 'Deleted', data: { detachedTasks: modifiedCount } })
}
