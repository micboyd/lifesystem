import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface ITask extends Document {
    user: Types.ObjectId
    date: string
    title: string
    completed: boolean
    order: number
    /** Estimated duration in minutes. */
    duration?: number
    createdAt: Date
    updatedAt: Date
}

const taskSchema = new Schema<ITask>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        title: { type: String, required: true, trim: true },
        completed: { type: Boolean, default: false },
        order: { type: Number, default: 0 },
        duration: { type: Number, min: 1, max: 1440 },
    },
    { timestamps: true }
)

taskSchema.index({ user: 1, date: 1, order: 1 })

export default model<ITask>('Task', taskSchema)
