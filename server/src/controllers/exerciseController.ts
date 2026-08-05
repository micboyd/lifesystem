import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Exercise from '../models/Exercise'
import Workout from '../models/Workout'
import { newBatchId, makeLastImportHandler, makeUndoImportHandler } from '../lib/importBatch'
import { nameKey, extractList, extractOverwrite } from '../lib/importReconcile'

/** GET /api/exercises/import/last — summarise the most recent import batch. */
export const lastImport = makeLastImportHandler(Exercise)
/** DELETE /api/exercises/import/last — revert the most recent import batch. */
export const undoImport = makeUndoImportHandler(Exercise)

/** GET /api/exercises — list the user's exercises in library order. */
export async function listExercises(req: AuthRequest, res: Response) {
    const exercises = await Exercise.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: exercises })
}

/** POST /api/exercises — create an exercise, appended to the end of the library. */
export async function createExercise(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const last = await Exercise.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const exercise = await Exercise.create({
        user: req.userId,
        name,
        description: typeof req.body.description === 'string' ? req.body.description.trim() : '',
        order,
    })
    res.status(201).json({ message: 'Created', data: exercise })
}

/** PUT /api/exercises/:id — update fields and/or reorder. */
export async function updateExercise(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (typeof b.description === 'string') fields.description = b.description.trim()
    if (typeof b.order === 'number') fields.order = b.order

    const exercise = await Exercise.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!exercise) {
        res.status(404).json({ message: 'Exercise not found' })
        return
    }
    res.json({ message: 'Saved', data: exercise })
}

/**
 * POST /api/exercises/import — bulk-create exercises from a pasted JSON document.
 *
 * Accepts either a bare array of exercise objects or an object with an
 * `exercises` array. Validation is all-or-nothing.
 */
export async function importExercises(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const rawList = extractList(body, 'exercises')
    const overwrite = extractOverwrite(body)

    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of exercises, or an object with an "exercises" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No exercises found to import.' })
        return
    }

    const errors: string[] = []
    const normalised = rawList.map((raw_item, i) => {
        if (!raw_item || typeof raw_item !== 'object') {
            errors.push(`Exercise ${i + 1}: must be an object`)
            return null
        }
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) {
            errors.push(`Exercise ${i + 1}: "name" is required`)
            return null
        }
        return {
            user: req.userId,
            name,
            description: typeof item.description === 'string' ? item.description.trim() : '',
        }
    })

    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const last = await Exercise.findOne({ user: req.userId }).sort({ order: -1 })
    let order = last ? last.order + 1 : 0
    const importBatch = newBatchId()

    // Overwrite chosen name-clashes in place; insert the rest as one batch.
    const toInsert: Record<string, unknown>[] = []
    let updated = 0
    for (const d of normalised) {
        const targetId = overwrite.get(nameKey(d!.name))
        if (targetId) {
            const r = await Exercise.updateOne({ _id: targetId, user: req.userId }, { $set: d! })
            if (r.matchedCount) {
                updated++
                continue
            }
        }
        toInsert.push({ ...d!, order: order++, importBatch })
    }

    const created = await Exercise.insertMany(toInsert)
    res.status(201).json({
        message: `Imported ${created.length} exercise(s), updated ${updated}`,
        data: created,
        updated,
    })
}

/** DELETE /api/exercises/:id — remove an exercise and pull it from any workouts. */
export async function deleteExercise(req: AuthRequest, res: Response) {
    const exercise = await Exercise.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!exercise) {
        res.status(404).json({ message: 'Exercise not found' })
        return
    }
    // Keep workouts consistent — drop the deleted exercise from any that referenced it.
    await Workout.updateMany(
        { user: req.userId, exercises: exercise._id },
        { $pull: { exercises: exercise._id } }
    )
    res.json({ message: 'Deleted', data: exercise })
}
