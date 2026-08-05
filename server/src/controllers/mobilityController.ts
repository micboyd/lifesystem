import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import Mobility, { IMobilityPart } from '../models/Mobility'
import { newBatchId, makeLastImportHandler, makeUndoImportHandler } from '../lib/importBatch'
import { nameKey, extractList, extractOverwrite } from '../lib/importReconcile'

/** GET /api/mobility/import/last — summarise the most recent import batch. */
export const lastImport = makeLastImportHandler(Mobility)
/** DELETE /api/mobility/import/last — revert the most recent import batch. */
export const undoImport = makeUndoImportHandler(Mobility)

/** Coerce a request value to a non-negative number, or a fallback if invalid. */
function toAmount(raw: unknown, fallback = 0): number {
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Normalise the parts array, dropping entries without a name. */
function toParts(raw: unknown): IMobilityPart[] {
    if (!Array.isArray(raw)) return []
    const out: IMobilityPart[] = []
    for (const raw_item of raw) {
        if (!raw_item || typeof raw_item !== 'object') continue
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) continue
        const detail = typeof item.detail === 'string' ? item.detail.trim() || undefined : undefined
        out.push({ name, detail })
    }
    return out
}

/** GET /api/mobility — list the user's mobility routines in library order. */
export async function listMobility(req: AuthRequest, res: Response) {
    const items = await Mobility.find({ user: req.userId }).sort({ order: 1, createdAt: 1 })
    res.json({ message: 'OK', data: items })
}

/** POST /api/mobility — create a routine, appended to the end of the library. */
export async function createMobility(req: AuthRequest, res: Response) {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
    if (!name) {
        res.status(400).json({ message: 'name is required' })
        return
    }

    const last = await Mobility.findOne({ user: req.userId }).sort({ order: -1 })
    const order = last ? last.order + 1 : 0

    const item = await Mobility.create({
        user: req.userId,
        name,
        duration: toAmount(req.body.duration),
        purpose: typeof req.body.purpose === 'string' ? req.body.purpose.trim() || undefined : undefined,
        parts: toParts(req.body.parts),
        howToUse: typeof req.body.howToUse === 'string' ? req.body.howToUse.trim() || undefined : undefined,
        order,
    })
    res.status(201).json({ message: 'Created', data: item })
}

/** PUT /api/mobility/:id — update fields and/or reorder. */
export async function updateMobility(req: AuthRequest, res: Response) {
    const b = req.body
    const fields: Record<string, unknown> = {}
    if (typeof b.name === 'string' && b.name.trim()) fields.name = b.name.trim()
    if (b.duration !== undefined) fields.duration = toAmount(b.duration)
    if (typeof b.purpose === 'string') fields.purpose = b.purpose.trim() || undefined
    if (Array.isArray(b.parts)) fields.parts = toParts(b.parts)
    if (typeof b.howToUse === 'string') fields.howToUse = b.howToUse.trim() || undefined
    if (typeof b.order === 'number') fields.order = b.order

    const item = await Mobility.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        { $set: fields },
        { new: true }
    )
    if (!item) {
        res.status(404).json({ message: 'Mobility routine not found' })
        return
    }
    res.json({ message: 'Saved', data: item })
}

/**
 * POST /api/mobility/import — bulk-create routines from a pasted JSON document.
 *
 * Accepts either a bare array of routine objects or an object with a `mobility`
 * array. Validation is all-or-nothing: if any item is malformed the whole import
 * is rejected with a per-item reason.
 */
export async function importMobility(req: AuthRequest, res: Response) {
    const body = req.body as unknown
    const rawList = extractList(body, 'mobility')
    const overwrite = extractOverwrite(body)

    if (!rawList) {
        res.status(400).json({
            message: 'Expected a JSON array of mobility routines, or an object with a "mobility" array.',
        })
        return
    }
    if (rawList.length === 0) {
        res.status(400).json({ message: 'No mobility routines found to import.' })
        return
    }

    const errors: string[] = []
    const normalised = rawList.map((raw_item, i) => {
        if (!raw_item || typeof raw_item !== 'object') {
            errors.push(`Mobility ${i + 1}: must be an object`)
            return null
        }
        const item = raw_item as Record<string, unknown>
        const name = typeof item.name === 'string' ? item.name.trim() : ''
        if (!name) {
            errors.push(`Mobility ${i + 1}: "name" is required`)
            return null
        }
        return {
            user: req.userId,
            name,
            duration: toAmount(item.duration),
            purpose: typeof item.purpose === 'string' ? item.purpose.trim() || undefined : undefined,
            parts: toParts(item.parts),
            howToUse: typeof item.howToUse === 'string' ? item.howToUse.trim() || undefined : undefined,
        }
    })

    if (errors.length) {
        res.status(400).json({ message: `Import failed. ${errors.join('; ')}` })
        return
    }

    const last = await Mobility.findOne({ user: req.userId }).sort({ order: -1 })
    let order = last ? last.order + 1 : 0
    const importBatch = newBatchId()

    // Overwrite chosen name-clashes in place; insert the rest as one batch.
    const toInsert: Record<string, unknown>[] = []
    let updated = 0
    for (const d of normalised) {
        const targetId = overwrite.get(nameKey(d!.name))
        if (targetId) {
            const r = await Mobility.updateOne({ _id: targetId, user: req.userId }, { $set: d! })
            if (r.matchedCount) {
                updated++
                continue
            }
        }
        toInsert.push({ ...d!, order: order++, importBatch })
    }

    const created = await Mobility.insertMany(toInsert)
    res.status(201).json({
        message: `Imported ${created.length} mobility routine(s), updated ${updated}`,
        data: created,
        updated,
    })
}

/** DELETE /api/mobility/:id — remove a mobility routine. */
export async function deleteMobility(req: AuthRequest, res: Response) {
    const item = await Mobility.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!item) {
        res.status(404).json({ message: 'Mobility routine not found' })
        return
    }
    // Any plan entries pointing at this routine are dropped at read time (the ref
    // no longer resolves), so there's nothing to clean up here.
    res.json({ message: 'Deleted', data: item })
}
