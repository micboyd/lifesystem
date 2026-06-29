import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface IReminder extends Document {
    user: Types.ObjectId
    date: string
    text: string
    order: number
    createdAt: Date
    updatedAt: Date
}

const reminderSchema = new Schema<IReminder>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        text: { type: String, required: true, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

reminderSchema.index({ user: 1, date: 1, order: 1 })

export default model<IReminder>('Reminder', reminderSchema)
