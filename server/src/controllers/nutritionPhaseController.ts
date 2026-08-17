import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import NutritionPhase, {
    NUTRITION_PHASE_KINDS,
    type IPhaseTargets,
    type NutritionPhaseKind,
} from '../models/NutritionPhase'

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(v: unknown): v is string {
    return typeof v === 'string' && DATE_PATTERN.test(v)
}

/**
 * A body worth reading. `express.json()` accepts bare `null` and arrays as valid
 * JSON, so destructuring without this check throws and reports a bad request as
 * a 500.
 */
function isObjectBody(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Whether an id can address a document; an unparseable one cast-errors into a 500. */
function isId(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v)
}

/** A macro target: a non-negative number, or undefined for "no target". */
function readTarget(v: unknown): number | undefined {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
    return v
}

function readTargets(v: unknown): IPhaseTargets {
    const t = (v ?? {}) as Record<string, unknown>
    return {
        calories: readTarget(t.calories),
        protein: readTarget(t.protein),
        carbs: readTarget(t.carbs),
        fat: readTarget(t.fat),
    }
}

function readBody(body: unknown):
    | { error: string }
    | {
          name: string
          startDate: string
          endDate: string
          kind: NutritionPhaseKind
          targets: IPhaseTargets
          weeklyRate: number | undefined
          notes: string | undefined
      } {
    if (!isObjectBody(body)) return { error: 'a JSON object body is required' }
    const { name, startDate, endDate, kind, targets, weeklyRate, notes } = body
    if (typeof name !== 'string' || !name.trim()) return { error: 'name is required' }
    if (!isValidDate(startDate) || !isValidDate(endDate))
        return { error: 'startDate and endDate must be YYYY-MM-DD' }
    if (startDate > endDate) return { error: 'startDate cannot be after endDate' }
    if (kind !== undefined && !(NUTRITION_PHASE_KINDS as readonly string[]).includes(kind as string))
        return { error: `kind must be one of: ${NUTRITION_PHASE_KINDS.join(', ')}` }
    if (
        weeklyRate !== undefined &&
        weeklyRate !== null &&
        (typeof weeklyRate !== 'number' || !Number.isFinite(weeklyRate))
    )
        return { error: 'weeklyRate must be a number' }
    if (notes !== undefined && notes !== null && typeof notes !== 'string')
        return { error: 'notes must be a string' }
    return {
        name: name.trim().slice(0, 80),
        startDate,
        endDate,
        kind: (kind as NutritionPhaseKind) ?? 'maintain',
        targets: readTargets(targets),
        weeklyRate: typeof weeklyRate === 'number' ? weeklyRate : undefined,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
    }
}

/**
 * GET /api/nutrition-phases?from=&to= — phases overlapping the range, or all of
 * them when no range is given. Overlap, not containment: a cut spanning the
 * window counts even though it neither starts nor ends inside it.
 */
export async function listNutritionPhases(req: AuthRequest, res: Response) {
    const { from, to } = req.query
    const filter: Record<string, unknown> = { user: req.userId }
    if (isValidDate(from) && isValidDate(to)) {
        filter.startDate = { $lte: to }
        filter.endDate = { $gte: from }
    }
    const phases = await NutritionPhase.find(filter).sort({ startDate: 1 })
    res.json({ message: 'OK', data: phases })
}

/** POST /api/nutrition-phases — add a dated eating phase. */
export async function createNutritionPhase(req: AuthRequest, res: Response) {
    const parsed = readBody(req.body)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    const phase = await NutritionPhase.create({ user: req.userId, ...parsed })
    res.status(201).json({ message: 'Created', data: phase })
}

/** PUT /api/nutrition-phases/:id — update a phase. */
export async function updateNutritionPhase(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }
    const parsed = readBody(req.body)
    if ('error' in parsed) {
        res.status(400).json({ message: parsed.error })
        return
    }
    const { weeklyRate, notes, ...rest } = parsed
    // Cleared optional fields are removed outright rather than stored as null.
    const unset: Record<string, ''> = {}
    if (weeklyRate === undefined) unset.weeklyRate = ''
    if (notes === undefined) unset.notes = ''
    const update: Record<string, unknown> = {
        $set: {
            ...rest,
            ...(weeklyRate !== undefined ? { weeklyRate } : {}),
            ...(notes !== undefined ? { notes } : {}),
        },
    }
    if (Object.keys(unset).length > 0) update.$unset = unset

    const phase = await NutritionPhase.findOneAndUpdate(
        { _id: req.params.id, user: req.userId },
        update,
        { new: true }
    )
    if (!phase) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }
    res.json({ message: 'Saved', data: phase })
}

/** DELETE /api/nutrition-phases/:id — remove a phase. */
export async function deleteNutritionPhase(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }
    const phase = await NutritionPhase.findOneAndDelete({ _id: req.params.id, user: req.userId })
    if (!phase) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }
    res.json({ message: 'Deleted' })
}
