import { Schema, model, Document, Types } from 'mongoose'

/**
 * A reusable recovery item — e.g. a stretch routine, sauna, foam rolling.
 * Deliberately lightweight: unlike conditioning sessions it has no category or
 * structured parts, just a name, duration and free-text notes.
 */
export interface IRecovery extends Document {
    user: Types.ObjectId
    name: string
    /** Planned duration in minutes. */
    duration: number
    /** What the recovery item is for, e.g. "Ease tight hips". */
    purpose?: string
    /** Free-text guidance on how / when to use it. */
    notes?: string
    /** Priority position in the library (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const recoverySchema = new Schema<IRecovery>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        duration: { type: Number, default: 0, min: 0 },
        purpose: { type: String, trim: true },
        notes: { type: String, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

recoverySchema.index({ user: 1, order: 1 })

export default model<IRecovery>('Recovery', recoverySchema)
