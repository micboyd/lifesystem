import { Schema, model, Document, Types } from 'mongoose'

export interface IHabitDef extends Document {
    user: Types.ObjectId
    name: string
    description?: string
    order: number
    active: boolean
    createdAt: Date
    updatedAt: Date
}

const habitDefSchema = new Schema<IHabitDef>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        order: { type: Number, default: 0 },
        active: { type: Boolean, default: true },
    },
    { timestamps: true }
)

habitDefSchema.index({ user: 1, order: 1 })

export default model<IHabitDef>('HabitDef', habitDefSchema)
