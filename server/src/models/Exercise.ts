import { Schema, model, Document, Types } from 'mongoose'

export interface IExercise extends Document {
    user: Types.ObjectId
    name: string
    description: string
    /** Priority position in the library (lower = sooner). */
    order: number
    /** Import batch id if this record came from a bulk import (for undo). */
    importBatch?: string | null
    createdAt: Date
    updatedAt: Date
}

const exerciseSchema = new Schema<IExercise>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        order: { type: Number, default: 0 },
        importBatch: { type: String, default: null },
    },
    { timestamps: true }
)

exerciseSchema.index({ user: 1, order: 1 })
exerciseSchema.index({ user: 1, importBatch: 1 })

export default model<IExercise>('Exercise', exerciseSchema)
