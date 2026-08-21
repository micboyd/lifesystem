import { Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import NutritionPhase, {
    ADJUSTMENT_SOURCES,
    GOAL_MODES,
    MACRO_ROLES,
    NUTRITION_PHASE_KINDS,
    TARGET_STRATEGIES,
    type AdjustmentSource,
    type GoalMode,
    type IAdaptiveSettings,
    type IMacroPolicy,
    type IPhaseAdjustment,
    type IPhaseGoal,
    type IPhaseTargets,
    type ITargetStrategy,
    type MacroRole,
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

/** A percentage in [0, 100], or undefined. */
function readPercent(v: unknown): number | undefined {
    const n = readPositive(v)
    return n !== undefined && n <= 100 ? n : undefined
}

/** A whole number of at least `min`, or undefined. */
function readCount(v: unknown, min = 1): number | undefined {
    const n = readNumber(v)
    if (n === undefined || n < min) return undefined
    return Math.round(n)
}

/**
 * The adaptive settings, or undefined when nothing usable was sent.
 *
 * Deliberately not defaulted here: an absent field means "use the application
 * default", and writing the default into the record would freeze today's
 * judgement into every phase ever saved.
 */
function readAdaptive(v: unknown): IAdaptiveSettings | undefined {
    if (!isObjectBody(v)) return undefined
    const settings: IAdaptiveSettings = {
        enabled: typeof v.enabled === 'boolean' ? v.enabled : undefined,
        reviewWindowDays: readCount(v.reviewWindowDays),
        minimumDataDays: readCount(v.minimumDataDays),
        preferredDataDays: readCount(v.preferredDataDays),
        maxAdjustmentKcal: readPositive(v.maxAdjustmentKcal),
        minAdjustmentKcal: readPositive(v.minAdjustmentKcal),
        calorieAdherenceToleranceKcal: readPositive(v.calorieAdherenceToleranceKcal),
        minCoverage:
            readPositive(v.minCoverage) !== undefined && (v.minCoverage as number) <= 1
                ? (v.minCoverage as number)
                : undefined,
    }
    return Object.values(settings).some((x) => x !== undefined) ? settings : undefined
}

/** The macro adjustment policy, or undefined. */
function readMacroPolicy(v: unknown): IMacroPolicy | undefined {
    if (!isObjectBody(v)) return undefined
    const role = (raw: unknown): MacroRole | undefined =>
        (MACRO_ROLES as readonly string[]).includes(raw as string) ? (raw as MacroRole) : undefined
    const policy: IMacroPolicy = {
        protein: role(v.protein),
        fat: role(v.fat),
        carbs: role(v.carbs),
    }
    return Object.values(policy).some((x) => x !== undefined) ? policy : undefined
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
        startBodyFatPct: readPercent(v.startBodyFatPct),
        targetDate: isValidDate(v.targetDate) ? v.targetDate : undefined,
        targetWeightKg: readPositive(v.targetWeightKg),
        targetWeightRangeKg: readRange(v.targetWeightRangeKg),
        targetBodyFatPct: readPercent(v.targetBodyFatPct),
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
          goalMode: GoalMode | undefined
          adaptive: IAdaptiveSettings | undefined
          macroPolicy: IMacroPolicy | undefined
          strategy: ITargetStrategy | undefined
          notes: string | undefined
      } {
    if (!isObjectBody(body)) return { error: 'a JSON object body is required' }
    const { name, startDate, endDate, kind, targets, weeklyRate, goal, goalMode, adaptive, macroPolicy, strategy, notes } =
        body
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
    if (goalMode !== undefined && !(GOAL_MODES as readonly string[]).includes(goalMode as string))
        return { error: `goalMode must be one of: ${GOAL_MODES.join(', ')}` }

    const adaptiveSettings = readAdaptive(adaptive)
    // A window shorter than the data it needs can never produce a review, which
    // would look like a broken feature rather than a setting typed the wrong way.
    if (
        adaptiveSettings?.reviewWindowDays !== undefined &&
        adaptiveSettings.minimumDataDays !== undefined &&
        adaptiveSettings.minimumDataDays > adaptiveSettings.reviewWindowDays
    )
        return { error: 'minimumDataDays cannot exceed reviewWindowDays' }
    if (
        adaptiveSettings?.reviewWindowDays !== undefined &&
        adaptiveSettings.preferredDataDays !== undefined &&
        adaptiveSettings.preferredDataDays > adaptiveSettings.reviewWindowDays
    )
        return { error: 'preferredDataDays cannot exceed reviewWindowDays' }
    return {
        name: name.trim().slice(0, 80),
        startDate,
        endDate,
        kind: (kind as NutritionPhaseKind) ?? 'maintain',
        targets: readTargets(targets),
        weeklyRate: typeof weeklyRate === 'number' ? weeklyRate : undefined,
        goal: readGoal(goal),
        goalMode: goalMode as GoalMode | undefined,
        adaptive: adaptiveSettings,
        macroPolicy: readMacroPolicy(macroPolicy),
        strategy: readStrategy(strategy),
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
    }
}

/** What a hand-made revision changed, for the audit trail. */
function revisionReason(targetsChanged: boolean, goalChanged: boolean): string {
    if (targetsChanged && goalChanged) return 'Targets and goal edited by hand'
    return goalChanged ? 'Goal edited by hand' : 'Targets edited by hand'
}

/** Whether two goals say the same thing. Compared by value, field by field. */
function sameGoals(a: IPhaseGoal | undefined | null, b: IPhaseGoal | undefined): boolean {
    if (!a && !b) return true
    if (!a || !b) return false
    return JSON.stringify(normaliseGoal(a)) === JSON.stringify(normaliseGoal(b))
}

/** A goal reduced to plain sorted data, so a Mongoose document compares by value. */
function normaliseGoal(goal: IPhaseGoal): Record<string, unknown> {
    const plain = JSON.parse(JSON.stringify(goal)) as Record<string, unknown>
    delete plain._id
    return Object.fromEntries(
        Object.entries(plain)
            .filter(([, v]) => v !== undefined && v !== null)
            .sort(([a], [b]) => a.localeCompare(b))
    )
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

    const { weeklyRate, notes, goal, goalMode, adaptive, macroPolicy, strategy, targets, ...rest } =
        parsed

    // Cleared optional fields are removed outright rather than stored as null.
    const unset: Record<string, ''> = {}
    if (weeklyRate === undefined) unset.weeklyRate = ''
    if (notes === undefined) unset.notes = ''
    if (goal === undefined) unset.goal = ''
    if (goalMode === undefined) unset.goalMode = ''
    if (adaptive === undefined) unset.adaptive = ''
    if (macroPolicy === undefined) unset.macroPolicy = ''
    if (strategy === undefined) unset.strategy = ''

    const set: Record<string, unknown> = {
        ...rest,
        ...(weeklyRate !== undefined ? { weeklyRate } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(goal !== undefined ? { goal } : {}),
        ...(goalMode !== undefined ? { goalMode } : {}),
        ...(adaptive !== undefined ? { adaptive } : {}),
        ...(macroPolicy !== undefined ? { macroPolicy } : {}),
        ...(strategy !== undefined ? { strategy } : {}),
    }

    /*
     * A phase that hasn't started yet has no history to protect.
     *
     * Nobody has eaten a day under its targets, so an edit is a correction to
     * the plan rather than a change of prescription — and dating a revision to
     * today would put it *before* the phase begins, leaving the opening targets
     * permanently shadowed and the audit trail claiming a change nobody ever
     * followed. Once the phase is live, every edit is dated.
     */
    const started = existing.startDate <= todayIso()
    const tracksHistory =
        started && (Boolean(existing.goal) || (existing.adjustments?.length ?? 0) > 0)
    const current = effectiveBaseline(existing)
    const targetsChanged = !sameTargets(current, targets)
    const goalChanged = tracksHistory && !sameGoals(existing.goal, goal)

    if (tracksHistory && (targetsChanged || goalChanged)) {
        /*
         * Date the change rather than overwriting.
         *
         * Two different things can change here and they are recorded together
         * because they happened together. A new prescription has to be dated or
         * every adherence figure older than it is silently re-judged against a
         * target that did not exist yet. A new *goal* doesn't affect historical
         * adherence — it only redirects the projection — but "what was I aiming
         * at in October" is still a fair question, so the old goal is snapshotted
         * beside it.
         */
        const revision: IPhaseAdjustment = {
            effectiveFrom: todayIso(),
            ...(targetsChanged ? { targets, previous: current } : {}),
            ...(goalChanged ? { previousGoal: existing.goal ?? undefined } : {}),
            reason: revisionReason(targetsChanged, goalChanged),
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
        // Revisions that changed only the goal carry no targets and must not
        // shadow the prescription that was actually in force.
        if (!a.targets || a.effectiveFrom > date) continue
        if (!best || a.effectiveFrom > best.effectiveFrom) best = a
    }
    return best?.targets ?? phase.targets
}

/** The targets currently in force — the last revision, or the opening set. */
function effectiveBaseline(phase: {
    targets: IPhaseTargets
    adjustments?: IPhaseAdjustment[]
}): IPhaseTargets {
    const withTargets = (phase.adjustments ?? []).filter((a) => a.targets)
    return withTargets.length > 0 ? withTargets[withTargets.length - 1].targets! : phase.targets
}

/** Today in UTC as YYYY-MM-DD. */
function todayIso(): string {
    return new Date().toISOString().slice(0, 10)
}
