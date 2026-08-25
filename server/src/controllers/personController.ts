import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Person, { RELATIONSHIPS, type Relationship } from '../models/Person'
import WorkTask from '../models/WorkTask'

/** Trim a string body field; undefined when absent, '' when explicitly cleared. */
function str(v: unknown): string | undefined {
    return typeof v === 'string' ? v.trim() : undefined
}

function relationship(v: unknown): Relationship | undefined {
    return typeof v === 'string' && (RELATIONSHIPS as readonly string[]).includes(v)
        ? (v as Relationship)
        : undefined
}

/** GET /api/work/people?includeArchived=1 */
export async function listPeople(req: AuthRequest, res: Response) {
    const query: Record<string, unknown> = { user: req.userId }
    if (req.query.includeArchived !== '1') query.archived = false

    const people = await Person.find(query).sort({ name: 1 })
    res.json({ message: 'OK', data: people })
}

/** POST /api/work/people */
export async function createPerson(req: AuthRequest, res: Response) {
    const name = str(req.body.name)
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    // Names are the handle you actually use in the picker, so a duplicate is
    // almost always a mis-type rather than a second Sarah. Hand back the
    // existing record instead of creating a shadow of it.
    const existing = await Person.findOne({
        user: req.userId,
        name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    })
    if (existing) {
        if (existing.archived) {
            existing.archived = false
            await existing.save()
        }
        res.status(200).json({ message: 'Exists', data: existing })
        return
    }

    const person = await Person.create({
        user: req.userId,
        name,
        role: str(req.body.role) || undefined,
        team: str(req.body.team) || undefined,
        relationship: relationship(req.body.relationship) ?? 'peer',
        notes: str(req.body.notes) || undefined,
    })
    res.status(201).json({ message: 'Created', data: person })
}

/** PUT /api/work/people/:id */
export async function updatePerson(req: AuthRequest, res: Response) {
    const person = await Person.findOne({ _id: req.params.id, user: req.userId })
    if (!person) {
        res.status(404).json({ message: 'Person not found' })
        return
    }

    const name = str(req.body.name)
    if (name !== undefined) {
        if (!name) {
            res.status(400).json({ message: 'name cannot be empty' })
            return
        }
        person.name = name
    }

    const role = str(req.body.role)
    if (role !== undefined) person.role = role || undefined
    const team = str(req.body.team)
    if (team !== undefined) person.team = team || undefined
    const notes = str(req.body.notes)
    if (notes !== undefined) person.notes = notes || undefined
    const rel = relationship(req.body.relationship)
    if (rel) person.relationship = rel
    if (typeof req.body.archived === 'boolean') person.archived = req.body.archived

    await person.save()
    res.json({ message: 'Updated', data: person })
}

/**
 * DELETE /api/work/people/:id
 *
 * Refused while open items are still waiting on them: deleting would leave
 * those tasks blocked on nobody, and the honest fix — archive, which keeps the
 * history and clears the picker — is one click away in the client.
 */
export async function deletePerson(req: AuthRequest, res: Response) {
    const person = await Person.findOne({ _id: req.params.id, user: req.userId })
    if (!person) {
        res.status(404).json({ message: 'Person not found' })
        return
    }

    const blocking = await WorkTask.countDocuments({
        user: req.userId,
        waitingOn: person._id,
        status: 'waiting',
    })
    if (blocking > 0) {
        res.status(409).json({
            message: `${blocking} item${blocking === 1 ? ' is' : 's are'} still waiting on ${person.name}`,
            data: { blocking },
        })
        return
    }

    // Historic (completed or unblocked) tasks keep their text but lose the ref.
    await WorkTask.updateMany(
        { user: req.userId, waitingOn: person._id },
        { $set: { waitingOn: null } }
    )
    await person.deleteOne()
    res.json({ message: 'Deleted' })
}
