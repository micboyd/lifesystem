import { Schema, model, Document, Types } from 'mongoose'

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * One weigh-in. At most one per day per user — the scale is noisy enough that a
 * second reading on the same day is a correction, not a new data point, so the
 * API upserts on { user, date } rather than appending.
 *
 * Waist sits alongside weight because it keeps moving through the week-long
 * water swings that flatten the scale, so the two together tell you whether a
 * stall is real.
 */
export interface IWeightLog extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD — the morning the reading was taken. */
    date: string
    /** Bodyweight in kilograms. */
    weight: number
    /** Optional waist measurement in centimetres. */
    waist?: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const weightLogSchema = new Schema<IWeightLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        weight: { type: Number, required: true, min: 0 },
        waist: { type: Number, min: 0 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

weightLogSchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IWeightLog>('WeightLog', weightLogSchema)
