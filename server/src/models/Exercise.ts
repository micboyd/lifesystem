import { Schema, model, Document, Types } from 'mongoose'

export interface IExercise extends Document {
    user: Types.ObjectId
    name: string
    description: string
    /**
     * Primary muscle group trained, e.g. "Chest". Optional and free-form, but
     * matching values are what let the swap picker offer a like-for-like
     * alternative when a machine is taken. Left blank, it's inferred from the
     * name and description at read time.
     */
    muscleGroup?: string
    /**
     * Kit the movement needs, e.g. "Machine", "Dumbbell". Swaps prefer a
     * *different* value — the whole point is finding something that isn't
     * occupied. Inferred from the name when blank.
     */
    equipment?: string
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
        muscleGroup: { type: String, default: '', trim: true },
        equipment: { type: String, default: '', trim: true },
        order: { type: Number, default: 0 },
        importBatch: { type: String, default: null },
    },
    { timestamps: true }
)

exerciseSchema.index({ user: 1, order: 1 })
exerciseSchema.index({ user: 1, importBatch: 1 })

export default model<IExercise>('Exercise', exerciseSchema)
