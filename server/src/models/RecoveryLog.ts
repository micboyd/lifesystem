import { Schema, model, Document, Types } from 'mongoose'

/**
 * A record that a recovery item was completed. The name is snapshotted from the
 * library item at log time, so the record survives the library item being edited
 * or deleted. Deliberately lightweight — a completion record with a name,
 * duration and free-text notes.
 */
export interface IRecoveryLog extends Document {
    user: Types.ObjectId
    /** Library recovery item this came from, if any. Null once that item is deleted. */
    recovery: Types.ObjectId | null
    name: string
    /** YYYY-MM-DD — the day it was completed. */
    date: string
    /** Actual minutes spent, if recorded. */
    duration: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const recoveryLogSchema = new Schema<IRecoveryLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        recovery: { type: Schema.Types.ObjectId, ref: 'Recovery', default: null },
        name: { type: String, required: true, trim: true },
        date: { type: String, required: true },
        duration: { type: Number, default: 0, min: 0 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

recoveryLogSchema.index({ user: 1, date: -1 })

export default model<IRecoveryLog>('RecoveryLog', recoveryLogSchema)
