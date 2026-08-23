import { Schema, model, Document, Types } from 'mongoose'

export const FITNESS_PLAN_KINDS = ['workout', 'conditioning', 'recovery', 'mobility'] as const
export type FitnessPlanKind = (typeof FITNESS_PLAN_KINDS)[number]

/** Which slot of the day a planned item sits in. */
export const FITNESS_PLAN_PARTS = ['morning', 'afternoon', 'evening'] as const
export type FitnessPlanPart = (typeof FITNESS_PLAN_PARTS)[number]

/**
 * A single training item placed on one day of the weekly planner — a strength
 * workout, a conditioning session or a recovery item. Only the ref matching
 * `kind` is set; the others stay null. Details (exercises, duration…) are read
 * from the referenced document at display time, so library edits flow through
 * to the plan. `part` places the item in the morning/afternoon/evening slot.
 */
export interface IFitnessPlanEntry extends Document {
    user: Types.ObjectId
    /** The day this sits on, "YYYY-MM-DD". */
    date: string
    /** Which slot of the day it sits in. */
    part: FitnessPlanPart
    /** Which library the planned item comes from. */
    kind: FitnessPlanKind
    workout: Types.ObjectId | null
    session: Types.ObjectId | null
    recovery: Types.ObjectId | null
    mobility: Types.ObjectId | null
    /**
     * The training plan that placed this entry, when it came from applying one.
     * Lets a plan be un-applied without touching hand-placed entries.
     */
    plan: Types.ObjectId | null
    /** Position within the day+part (lower = sooner). */
    order: number
    /**
     * When true the planner's clash warning is suppressed for this entry — the
     * calendar collision has been seen and accepted, so it stops being flagged.
     * Set per entry rather than per event: the same event may be a real problem
     * for one session and beside the point for another.
     */
    ignoreClash: boolean
    /**
     * When true the planner's overload warning is suppressed for this entry — the
     * doubled-up slot has been seen and accepted. Set on every hard session in the
     * slot, so a session moved in later brings the warning back with it.
     */
    ignoreOverload: boolean
    createdAt: Date
    updatedAt: Date
}

const fitnessPlanEntrySchema = new Schema<IFitnessPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        part: { type: String, enum: FITNESS_PLAN_PARTS, default: 'morning' },
        kind: { type: String, enum: FITNESS_PLAN_KINDS, required: true },
        workout: { type: Schema.Types.ObjectId, ref: 'Workout', default: null },
        session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession', default: null },
        recovery: { type: Schema.Types.ObjectId, ref: 'Recovery', default: null },
        mobility: { type: Schema.Types.ObjectId, ref: 'Mobility', default: null },
        plan: { type: Schema.Types.ObjectId, ref: 'TrainingPlan', default: null },
        order: { type: Number, default: 0 },
        ignoreClash: { type: Boolean, default: false },
        ignoreOverload: { type: Boolean, default: false },
    },
    { timestamps: true }
)

fitnessPlanEntrySchema.index({ user: 1, date: 1 })
fitnessPlanEntrySchema.index({ user: 1, plan: 1 })

export default model<IFitnessPlanEntry>('FitnessPlanEntry', fitnessPlanEntrySchema)
