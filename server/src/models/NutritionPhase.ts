import { Schema, model, Document, Types } from 'mongoose'

/**
 * Which direction the phase pushes bodyweight. It drives how the phase reads on
 * the timeline and how its weigh-in trend is judged: a cut missing its rate is
 * behind, a maintain drifting either way is off.
 */
export const NUTRITION_PHASE_KINDS = ['cut', 'maintain', 'gain'] as const
export type NutritionPhaseKind = (typeof NUTRITION_PHASE_KINDS)[number]

/** Daily macro targets for the phase. Any field unset means "no target". */
export interface IPhaseTargets {
    calories?: number
    protein?: number
    carbs?: number
    fat?: number
}

/**
 * What the phase is *for*, beyond a direction and a set of numbers.
 *
 * `kind` says which way the scale should move; this says where it is going, how
 * fast, and what counts as arriving. Every field is optional and a phase without
 * it behaves exactly as phases always have — the adaptive machinery simply has
 * nothing to steer towards and stays quiet.
 *
 * Rates are signed the same way `weeklyRate` is — negative for loss — so a
 * recomp's acceptable band runs { min: -0.3, max: -0.15 }: min is the faster
 * end, because it is the smaller number.
 */
export interface IPhaseGoal {
    /**
     * 'recomp' means the point is body composition rather than scale weight:
     * hold protein, lose slowly, and read lean mass alongside the total. A cut
     * whose goal is simply to weigh less doesn't need it.
     */
    style?: 'recomp' | 'standard'
    /** Bodyweight in kg when the phase began — the baseline progress is measured from. */
    startWeightKg?: number
    /** YYYY-MM-DD the goal is aimed at. Usually, but not necessarily, `endDate`. */
    targetDate?: string
    targetWeightKg?: number
    /** The band around `targetWeightKg` that counts as arriving. */
    targetWeightRangeKg?: { min: number; max: number }
    targetBodyFatPct?: number
    targetBodyFatRangePct?: { min: number; max: number }
    /** Intended kg/week, signed. The centre of the band below. */
    targetWeeklyRateKg?: number
    /** The range of weekly rates that needs no correction, signed and min ≤ max. */
    acceptableWeeklyRateKg?: { min: number; max: number }
    /** Protein floor in grams, held flat when calories move. */
    proteinFloorG?: number
    /** Whether the review engine may propose calorie changes for this phase. */
    adaptive?: boolean
}

/** Whether a target change was proposed by the review or typed in by hand. */
export const ADJUSTMENT_SOURCES = ['manual', 'adaptive'] as const
export type AdjustmentSource = (typeof ADJUSTMENT_SOURCES)[number]

/**
 * A dated change of target within a phase.
 *
 * A nine-month phase is not one prescription; it's a starting prescription plus
 * whatever the data made of it. Overwriting `targets` in place would answer
 * "what am I eating now" and destroy "what was I eating in January", which is
 * the question every adherence figure older than the last change depends on. So
 * `targets` stays the phase's opening prescription and each revision is appended
 * here with the date it took effect. Resolution is latest `effectiveFrom` on or
 * before the day being asked about.
 */
export interface IPhaseAdjustment {
    /** YYYY-MM-DD from which these targets apply, inclusive. */
    effectiveFrom: string
    /** The full target set in force from that date — not a delta. */
    targets: IPhaseTargets
    /** What it replaced, so the change is readable without replaying the chain. */
    previous?: IPhaseTargets
    /** Why, in a sentence. Carries the review's reasoning when accepted from one. */
    reason?: string
    source: AdjustmentSource
    createdAt?: Date
}

/** How a day's target is derived from the phase's baseline. */
export const TARGET_STRATEGIES = ['flat', 'activity'] as const
export type TargetStrategyType = (typeof TARGET_STRATEGIES)[number]

/**
 * Optional calorie cycling. 'flat' — the default and what every existing phase
 * gets — means every day carries the same target. 'activity' shifts the target
 * by the day's training demand, with the modifiers held so the *week* still
 * averages the baseline; carbohydrate absorbs the difference.
 */
export interface ITargetStrategy {
    type: TargetStrategyType
    /** kcal added on a hard training day. */
    hardKcal?: number
    /** kcal removed on a rest day. */
    restKcal?: number
}

/**
 * A dated stretch of eating with its own targets — "Autumn cut", "Off-season".
 *
 * The meal planner records what was eaten day by day but nothing said what it
 * was *for*, so adherence had only one global setting to be judged against. A
 * phase is that target with dates on it: day-precise, because a cut rarely
 * starts on the 1st.
 */
export interface INutritionPhase extends Document {
    user: Types.ObjectId
    name: string
    /** Inclusive "YYYY-MM-DD" bounds. */
    startDate: string
    endDate: string
    kind: NutritionPhaseKind
    /** The phase's opening prescription. Revisions live in `adjustments`. */
    targets: IPhaseTargets
    /**
     * Intended bodyweight change per week in kg, signed: negative for a cut,
     * positive for a gain. Mirrors the user's global BodyGoals.weeklyRate so the
     * weigh-in trend can read either.
     */
    weeklyRate?: number
    goal?: IPhaseGoal
    adjustments?: IPhaseAdjustment[]
    strategy?: ITargetStrategy
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const targetsSchema = new Schema<IPhaseTargets>(
    {
        calories: { type: Number, min: 0 },
        protein: { type: Number, min: 0 },
        carbs: { type: Number, min: 0 },
        fat: { type: Number, min: 0 },
    },
    { _id: false }
)

const rangeSchema = new Schema<{ min: number; max: number }>(
    {
        min: { type: Number, required: true },
        max: { type: Number, required: true },
    },
    { _id: false }
)

const goalSchema = new Schema<IPhaseGoal>(
    {
        style: { type: String, enum: ['recomp', 'standard'] },
        startWeightKg: { type: Number, min: 0 },
        targetDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
        targetWeightKg: { type: Number, min: 0 },
        targetWeightRangeKg: { type: rangeSchema, default: undefined },
        targetBodyFatPct: { type: Number, min: 0, max: 100 },
        targetBodyFatRangePct: { type: rangeSchema, default: undefined },
        targetWeeklyRateKg: { type: Number },
        acceptableWeeklyRateKg: { type: rangeSchema, default: undefined },
        proteinFloorG: { type: Number, min: 0 },
        adaptive: { type: Boolean },
    },
    { _id: false }
)

const adjustmentSchema = new Schema<IPhaseAdjustment>(
    {
        effectiveFrom: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        targets: { type: targetsSchema, required: true },
        previous: { type: targetsSchema, default: undefined },
        reason: { type: String, trim: true, maxlength: 400 },
        source: { type: String, enum: ADJUSTMENT_SOURCES, required: true, default: 'manual' },
        createdAt: { type: Date, default: () => new Date() },
    },
    { _id: false }
)

const strategySchema = new Schema<ITargetStrategy>(
    {
        type: { type: String, enum: TARGET_STRATEGIES, required: true, default: 'flat' },
        hardKcal: { type: Number, min: 0 },
        restKcal: { type: Number, min: 0 },
    },
    { _id: false }
)

const nutritionPhaseSchema = new Schema<INutritionPhase>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        kind: { type: String, enum: NUTRITION_PHASE_KINDS, required: true, default: 'maintain' },
        targets: { type: targetsSchema, default: () => ({}) },
        weeklyRate: { type: Number },
        // All three default to undefined rather than an empty object, so a phase
        // that never opted in stores nothing and reads back exactly as before.
        goal: { type: goalSchema, default: undefined },
        adjustments: { type: [adjustmentSchema], default: undefined },
        strategy: { type: strategySchema, default: undefined },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

nutritionPhaseSchema.index({ user: 1, startDate: 1 })

export default model<INutritionPhase>('NutritionPhase', nutritionPhaseSchema)
