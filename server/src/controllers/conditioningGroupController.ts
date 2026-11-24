import { Response } from 'express'
import { Types } from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import ConditioningGroup, {
    CONDITIONING_GROUP_COLORS,
    ConditioningGroupColor,
    MAX_CONDITIONING_GROUPS,
} from '../models/ConditioningGroup'
import ConditioningSession from '../models/ConditioningSession'

function toColor(raw: unknown): ConditioningGroupColor | null {
    return CONDITIONING_GROUP_COLORS.includes(raw as ConditioningGroupColor)
        ? (raw as ConditioningGroupColor)
        : null
}

/**
 * The group a request names, checked to be the user's: an id, or null to clear.
 * Returns undefined when the request didn't say, or named something unknown.
 */
export async function readGroup(
    userId: string | undefined,
    raw: unknown
): Promise<Types.ObjectId | null | undefined> {
    if (raw === null || raw === '') return null
    if (typeof raw !== 'string' || !Types.ObjectId.isValid(raw)) return undefined
    const found = await ConditioningGroup.exists({ _id: raw, user: userId })
    return found ? new Types.ObjectId(raw) : undefined
}

/** GET /api/conditioning/groups */
export async function listGroups(req: AuthRequest, res: Response) {
    const groups = await ConditioningGroup.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: groups })
}

/** POST /api/conditioning/groups — at most five per user. */
export async function createGroup(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }
    const count = await ConditioningGroup.countDocuments({ user: req.userId })
    if (count >= MAX_CONDITIONING_GROUPS) {
        res.status(400).json({ message: `You can have up to ${MAX_CONDITIONING_GROUPS} categories.` })
        return
    }
    const group = await ConditioningGroup.create({
        user: req.userId,
        name,
        color: toColor(req.body.color) ?? CONDITIONING_GROUP_COLORS[count % CONDITIONING_GROUP_COLORS.length],
        order: count,
    })
    res.status(201).json({ message: 'Created', data: group })
}

/** PUT /api/conditioning/groups/:id — rename, recolour or reorder. */
export async function updateGroup(req: AuthRequest, res: Response) {
    const fields: Record<string, unknown> = {}
    if (typeof req.body.name === 'string' && req.body.name.trim()) fields.name = req.body.name.trim()
    const color = toColor(req.body.color)
    if (color) fields.color = color
    if (typeof req.body.order === 'number') fields.order = req.body.order
    const group = await ConditioningGroup.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!group) {
        res.status(404).json({ message: 'Category not found' })
        return
    }
    res.json({ message: 'Saved', data: group })
}

/** DELETE /api/conditioning/groups/:id — sessions in it are left without one. */
export async function deleteGroup(req: AuthRequest, res: Response) {
    const group = await ConditioningGroup.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!group) {
        res.status(404).json({ message: 'Category not found' })
        return
    }
    await ConditioningSession.updateMany(
        { user: req.userId, group: group._id },
        { $set: { group: null } }
    )
    res.json({ message: 'Deleted', data: group })
}
