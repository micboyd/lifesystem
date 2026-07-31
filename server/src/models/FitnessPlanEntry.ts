import { Schema, model, Document, Types } from 'mongoose'

export const FITNESS_PLAN_KINDS = ['workout', 'conditioning'] as const
export type FitnessPlanKind = (typeof FITNESS_PLAN_KINDS)[number]

/**
 * A single training item placed on one day of the weekly planner — either a
 * strength workout or a conditioning session. Only the ref matching `kind` is
 * set; the other stays null. Details (exercises, duration…) are read from the
 * referenced document at display time, so library edits flow through to the plan.
 */
export interface IFitnessPlanEntry extends Document {
    user: Types.ObjectId
    /** The day this sits on, "YYYY-MM-DD". */
    date: string
    /** Which library the planned item comes from. */
    kind: FitnessPlanKind
    workout: Types.ObjectId | null
    session: Types.ObjectId | null
    /** Position within the day+kind (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const fitnessPlanEntrySchema = new Schema<IFitnessPlanEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        kind: { type: String, enum: FITNESS_PLAN_KINDS, required: true },
        workout: { type: Schema.Types.ObjectId, ref: 'Workout', default: null },
        session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession', default: null },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

fitnessPlanEntrySchema.index({ user: 1, date: 1 })

export default model<IFitnessPlanEntry>('FitnessPlanEntry', fitnessPlanEntrySchema)
