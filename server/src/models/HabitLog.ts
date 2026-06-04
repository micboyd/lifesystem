import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface IHabitLog extends Document {
    user: Types.ObjectId
    habit: Types.ObjectId
    date: string
    completed: boolean
    createdAt: Date
    updatedAt: Date
}

const habitLogSchema = new Schema<IHabitLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        habit: { type: Schema.Types.ObjectId, ref: 'HabitDef', required: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        completed: { type: Boolean, default: true },
    },
    { timestamps: true }
)

habitLogSchema.index({ user: 1, date: 1 })
habitLogSchema.index({ user: 1, habit: 1, date: 1 }, { unique: true })

export default model<IHabitLog>('HabitLog', habitLogSchema)
