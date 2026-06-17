import { Schema, model, Document, Types } from 'mongoose'

export interface ICourse extends Document {
    user: Types.ObjectId
    name: string
    /** Total study hours the course requires to finish. */
    requiredHours: number
    /** Hours already completed; subtracted from requiredHours when projecting. */
    completedHours: number
    /** Priority position in the sequential study queue (lower = sooner). */
    order: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const courseSchema = new Schema<ICourse>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        requiredHours: { type: Number, required: true, min: 0 },
        completedHours: { type: Number, default: 0, min: 0 },
        order: { type: Number, default: 0 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

courseSchema.index({ user: 1, order: 1 })

export default model<ICourse>('Course', courseSchema)
