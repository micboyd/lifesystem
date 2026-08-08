import { Schema, model, Document, Types } from 'mongoose'

/**
 * A record that a mobility routine was completed. The name is snapshotted from
 * the library routine at log time, so the record survives the library routine
 * being edited or deleted. Deliberately lightweight — a completion record, not a
 * per-part breakdown.
 */
export interface IMobilityLog extends Document {
    user: Types.ObjectId
    /** Library routine this came from, if any. Null once that routine is deleted. */
    mobility: Types.ObjectId | null
    name: string
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Actual minutes spent, if recorded. */
    duration: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const mobilityLogSchema = new Schema<IMobilityLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        mobility: { type: Schema.Types.ObjectId, ref: 'Mobility', default: null },
        name: { type: String, required: true, trim: true },
        date: { type: String, required: true },
        duration: { type: Number, default: 0, min: 0 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

mobilityLogSchema.index({ user: 1, date: -1 })

export default model<IMobilityLog>('MobilityLog', mobilityLogSchema)
