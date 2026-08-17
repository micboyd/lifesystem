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
    targets: IPhaseTargets
    /**
     * Intended bodyweight change per week in kg, signed: negative for a cut,
     * positive for a gain. Mirrors the user's global BodyGoals.weeklyRate so the
     * weigh-in trend can read either.
     */
    weeklyRate?: number
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

const nutritionPhaseSchema = new Schema<INutritionPhase>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        startDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        endDate: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        kind: { type: String, enum: NUTRITION_PHASE_KINDS, required: true, default: 'maintain' },
        targets: { type: targetsSchema, default: () => ({}) },
        weeklyRate: { type: Number },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

nutritionPhaseSchema.index({ user: 1, startDate: 1 })

export default model<INutritionPhase>('NutritionPhase', nutritionPhaseSchema)
