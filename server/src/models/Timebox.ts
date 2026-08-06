import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const TIMEBOX_CATEGORIES = ['work', 'personal', 'health', 'learning', 'social'] as const
export type TimeboxCategory = (typeof TIMEBOX_CATEGORIES)[number]

export const RECURRENCE_FREQS = ['daily', 'weekly', 'weekdays', 'custom'] as const
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number]

export interface ITimebox extends Document {
    user: Types.ObjectId
    date: string
    title: string
    notes?: string
    category?: TimeboxCategory
    startTime: string
    endTime: string
    recurrence?: { freq: RecurrenceFreq; days?: number[]; until?: string }
    exceptions: string[]
    createdAt: Date
    updatedAt: Date
}

const timeboxSchema = new Schema<ITimebox>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        title: { type: String, required: true, trim: true },
        notes: { type: String, trim: true, maxlength: 2000 },
        category: { type: String, enum: TIMEBOX_CATEGORIES },
        startTime: { type: String, required: true, match: TIME_PATTERN },
        endTime: { type: String, required: true, match: TIME_PATTERN },
        recurrence: {
            type: new Schema(
                {
                    freq: { type: String, enum: RECURRENCE_FREQS, required: true },
                    days: { type: [Number], default: undefined },
                    until: { type: String, match: DATE_PATTERN, default: undefined },
                },
                { _id: false }
            ),
            default: undefined,
        },
        exceptions: { type: [String], default: [] },
    },
    { timestamps: true }
)

timeboxSchema.index({ user: 1, date: 1, startTime: 1 })

export default model<ITimebox>('Timebox', timeboxSchema)
