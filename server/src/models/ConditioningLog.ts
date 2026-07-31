import { Schema, model, Document, Types } from 'mongoose'
import { CONDITIONING_CATEGORIES, ConditioningCategory } from './ConditioningSession'

/**
 * A record that a conditioning session was completed. Name and category are
 * snapshotted from the library session at log time, so the record survives the
 * library session being edited or deleted.
 */
export interface IConditioningLog extends Document {
    user: Types.ObjectId
    /** Library session this came from, if any. Null once that session is deleted. */
    session: Types.ObjectId | null
    name: string
    category: ConditioningCategory
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Actual minutes spent. */
    duration: number
    /** Rate of perceived exertion, 1 (easy) – 10 (max). */
    rpe?: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const conditioningLogSchema = new Schema<IConditioningLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        session: { type: Schema.Types.ObjectId, ref: 'ConditioningSession', default: null },
        name: { type: String, required: true, trim: true },
        category: { type: String, enum: CONDITIONING_CATEGORIES, default: 'HIIT' },
        date: { type: String, required: true },
        duration: { type: Number, default: 0, min: 0 },
        rpe: { type: Number, min: 1, max: 10 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

conditioningLogSchema.index({ user: 1, date: -1 })

export default model<IConditioningLog>('ConditioningLog', conditioningLogSchema)
