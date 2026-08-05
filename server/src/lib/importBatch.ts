import { Types, Model, FilterQuery } from 'mongoose'
import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'

/**
 * Bulk imports stamp every record they create with a shared `importBatch` id so
 * the whole batch can be reverted later. The id is an ObjectId string, which is
 * time-sortable — the greatest one per user is always the most recent import.
 */
interface Batchable {
    importBatch?: string | null
}

/** A fresh, time-sortable batch id for one import run. */
export function newBatchId(): string {
    return new Types.ObjectId().toString()
}

export interface ImportSummary {
    batch: string
    count: number
    /** When the batch was imported (derived from the batch id's timestamp). */
    importedAt: string
}

/** Describe the user's most recent import batch for a collection, or null. */
async function summarise<T extends Batchable>(
    model: Model<T>,
    userId?: string
): Promise<ImportSummary | null> {
    const latest = await model
        .findOne({ user: userId, importBatch: { $ne: null } } as FilterQuery<T>)
        .sort({ importBatch: -1 })
        .select('importBatch')
        .lean<Batchable>()
    if (!latest?.importBatch || !Types.ObjectId.isValid(latest.importBatch)) return null
    const batch = latest.importBatch
    const count = await model.countDocuments({ user: userId, importBatch: batch } as FilterQuery<T>)
    return { batch, count, importedAt: new Types.ObjectId(batch).getTimestamp().toISOString() }
}

/** GET handler → the latest import batch summary for this collection (or null). */
export function makeLastImportHandler<T extends Batchable>(model: Model<T>) {
    return async (req: AuthRequest, res: Response) => {
        res.json({ message: 'OK', data: await summarise(model, req.userId) })
    }
}

/** DELETE handler → remove every record from the latest import batch. */
export function makeUndoImportHandler<T extends Batchable>(model: Model<T>) {
    return async (req: AuthRequest, res: Response) => {
        const summary = await summarise(model, req.userId)
        if (!summary) {
            res.status(404).json({ message: 'No import to undo.' })
            return
        }
        await model.deleteMany({ user: req.userId, importBatch: summary.batch } as FilterQuery<T>)
        res.json({ message: `Reverted ${summary.count} item(s).`, data: summary })
    }
}
