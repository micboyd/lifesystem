import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import NutritionPhase, {
    ADJUSTMENT_SOURCES,
    NUTRITION_PHASE_KINDS,
    TARGET_STRATEGIES,
    type AdjustmentSource,
    type IPhaseAdjustment,
    type IPhaseGoal,
    type IPhaseTargets,
    type ITargetStrategy,
    type NutritionPhaseKind,
    type TargetStrategyType,
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

/** Any finite number, or undefined. Used where negatives are meaningful (rates). */
function readNumber(v: unknown): number | undefined {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
    return v
}

/** A non-negative finite number, or undefined. */
function readPositive(v: unknown): number | undefined {
    const n = readNumber(v)
    return n !== undefined && n >= 0 ? n : undefined
}

/**
 * A { min, max } pair, normalised so min ≤ max. Rates arrive signed, and a band
 * written the way it reads aloud — "0.15 to 0.30 kg/week off" — comes through as
 * { min: -0.15, max: -0.30 }; swapping is friendlier than rejecting it.
 */
function readRange(v: unknown): { min: number; max: number } | undefined {
    if (!isObjectBody(v)) return undefined
    const min = readNumber(v.min)
    const max = readNumber(v.max)
    if (min === undefined || max === undefined) return undefined
    return min <= max ? { min, max } : { min: max, max: min }
}

/**
 * The goal block, or undefined when nothing usable was sent. Every field is
 * optional, so an object of all-undefined is treated as absent rather than
 * stored as an empty husk that would make `phase.goal` truthy for no reason.
 */
function readGoal(v: unknown): IPhaseGoal | undefined {
    if (!isObjectBody(v)) return undefined
    const style = v.style === 'recomp' || v.style === 'standard' ? v.style : undefined
    const goal: IPhaseGoal = {
        style,
        startWeightKg: readPositive(v.startWeightKg),
        targetDate: isValidDate(v.targetDate) ? v.targetDate : undefined,
        targetWeightKg: readPositive(v.targetWeightKg),
        targetWeightRangeKg: readRange(v.targetWeightRangeKg),
        targetBodyFatPct: readPositive(v.targetBodyFatPct),
        targetBodyFatRangePct: readRange(v.targetBodyFatRangePct),
        targetWeeklyRateKg: readNumber(v.targetWeeklyRateKg),
        acceptableWeeklyRateKg: readRange(v.acceptableWeeklyRateKg),
        proteinFloorG: readPositive(v.proteinFloorG),
        adaptive: typeof v.adaptive === 'boolean' ? v.adaptive : undefined,
    }
    const set = Object.values(goal).some((x) => x !== undefined)
    return set ? goal : undefined
}

/** The cycling strategy, or undefined. 'flat' with no modifiers is stored as sent. */
function readStrategy(v: unknown): ITargetStrategy | undefined {
    if (!isObjectBody(v)) return undefined
    if (!(TARGET_STRATEGIES as readonly string[]).includes(v.type as string)) return undefined
    return {
        type: v.type as TargetStrategyType,
        hardKcal: readPositive(v.hardKcal),
        restKcal: readPositive(v.restKcal),
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
          goal: IPhaseGoal | undefined
          strategy: ITargetStrategy | undefined
          notes: string | undefined
      } {
    if (!isObjectBody(body)) return { error: 'a JSON object body is required' }
    const { name, startDate, endDate, kind, targets, weeklyRate, goal, strategy, notes } = body
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
        goal: readGoal(goal),
        strategy: readStrategy(strategy),
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
    }
}

/** Whether two target sets say the same thing, treating unset and absent alike. */
function sameTargets(a: IPhaseTargets, b: IPhaseTargets): boolean {
    return (
        a.calories === b.calories &&
        a.protein === b.protein &&
        a.carbs === b.carbs &&
        a.fat === b.fat
    )
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

/**
 * PUT /api/nutrition-phases/:id — update a phase.
 *
 * On a phase that tracks its own history — one with a goal, or one that has
 * already been adjusted — changing the calorie targets appends a dated 'manual'
 * revision rather than rewriting `targets`, so the target a past day was judged
 * against stays recoverable. A plain phase keeps the original behaviour: the
 * targets are simply the targets, and editing them edits them.
 */
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

    const existing = await NutritionPhase.findOne({ _id: req.params.id, user: req.userId })
    if (!existing) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }

    const { weeklyRate, notes, goal, strategy, targets, ...rest } = parsed

    // Cleared optional fields are removed outright rather than stored as null.
    const unset: Record<string, ''> = {}
    if (weeklyRate === undefined) unset.weeklyRate = ''
    if (notes === undefined) unset.notes = ''
    if (goal === undefined) unset.goal = ''
    if (strategy === undefined) unset.strategy = ''

    const set: Record<string, unknown> = {
        ...rest,
        ...(weeklyRate !== undefined ? { weeklyRate } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(goal !== undefined ? { goal } : {}),
        ...(strategy !== undefined ? { strategy } : {}),
    }

    const tracksHistory = Boolean(existing.goal) || (existing.adjustments?.length ?? 0) > 0
    const current = effectiveBaseline(existing)

    if (tracksHistory && !sameTargets(current, targets)) {
        // Keep `targets` as the opening prescription and date the change instead.
        const revision: IPhaseAdjustment = {
            effectiveFrom: todayIso(),
            targets,
            previous: current,
            reason: 'Edited by hand',
            source: 'manual',
            createdAt: new Date(),
        }
        existing.adjustments = appendAdjustment(existing.adjustments, revision)
        set.adjustments = existing.adjustments
    } else if (!tracksHistory) {
        set.targets = targets
    }

    const update: Record<string, unknown> = { $set: set }
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

/**
 * POST /api/nutrition-phases/:id/adjustments — record a target change.
 *
 * The adaptive review proposes; this is what accepting it does. Separate from
 * the update route because it is an append to a history rather than an edit of
 * a field, and because the client should never have to send the whole phase
 * back to change one number.
 */
export async function addNutritionPhaseAdjustment(req: AuthRequest, res: Response) {
    if (!isId(req.params.id)) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }
    if (!isObjectBody(req.body)) {
        res.status(400).json({ message: 'a JSON object body is required' })
        return
    }
    const { effectiveFrom, targets, reason, source } = req.body
    if (!isValidDate(effectiveFrom)) {
        res.status(400).json({ message: 'effectiveFrom must be YYYY-MM-DD' })
        return
    }
    const next = readTargets(targets)
    if (next.calories === undefined) {
        res.status(400).json({ message: 'targets.calories is required' })
        return
    }
    if (source !== undefined && !(ADJUSTMENT_SOURCES as readonly string[]).includes(source as string)) {
        res.status(400).json({ message: `source must be one of: ${ADJUSTMENT_SOURCES.join(', ')}` })
        return
    }

    const phase = await NutritionPhase.findOne({ _id: req.params.id, user: req.userId })
    if (!phase) {
        res.status(404).json({ message: 'Phase not found' })
        return
    }

    phase.adjustments = appendAdjustment(phase.adjustments, {
        effectiveFrom,
        targets: next,
        previous: baselineOn(phase, effectiveFrom),
        reason: typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 400) : undefined,
        source: (source as AdjustmentSource) ?? 'adaptive',
        createdAt: new Date(),
    })
    await phase.save()

    res.status(201).json({ message: 'Saved', data: phase })
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

/**
 * Append a revision, keeping the list in date order and letting a second change
 * on the same day replace the first — same reasoning as the weigh-in upsert: two
 * decisions about one day's target is a correction, not two targets.
 */
function appendAdjustment(
    existing: IPhaseAdjustment[] | undefined,
    next: IPhaseAdjustment
): IPhaseAdjustment[] {
    const kept = (existing ?? []).filter((a) => a.effectiveFrom !== next.effectiveFrom)
    return [...kept, next].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
}

/** The targets in force on `date`: the latest revision on or before it, else the opening set. */
function baselineOn(
    phase: { targets: IPhaseTargets; adjustments?: IPhaseAdjustment[] },
    date: string
): IPhaseTargets {
    let best: IPhaseAdjustment | undefined
    for (const a of phase.adjustments ?? []) {
        if (a.effectiveFrom > date) continue
        if (!best || a.effectiveFrom > best.effectiveFrom) best = a
    }
    return best ? best.targets : phase.targets
}

/** The targets currently in force — the last revision, or the opening set. */
function effectiveBaseline(phase: {
    targets: IPhaseTargets
    adjustments?: IPhaseAdjustment[]
}): IPhaseTargets {
    const list = phase.adjustments ?? []
    return list.length > 0 ? list[list.length - 1].targets : phase.targets
}

/** Today in UTC as YYYY-MM-DD. */
function todayIso(): string {
    return new Date().toISOString().slice(0, 10)
}
