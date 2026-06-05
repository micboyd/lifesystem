import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export interface ITimebox extends Document {
    user: Types.ObjectId
    date: string
    title: string
    startTime: string
    endTime: string
    createdAt: Date
    updatedAt: Date
}

const timeboxSchema = new Schema<ITimebox>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        title: { type: String, required: true, trim: true },
        startTime: { type: String, required: true, match: TIME_PATTERN },
        endTime: { type: String, required: true, match: TIME_PATTERN },
    },
    { timestamps: true }
)

timeboxSchema.index({ user: 1, date: 1, startTime: 1 })

export default model<ITimebox>('Timebox', timeboxSchema)
