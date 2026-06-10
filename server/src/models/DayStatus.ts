import { Schema, model, Document, Types } from 'mongoose'

export const DAY_STATUSES = [
    'annual_leave_pending',
    'annual_leave_approved',
    'bank_holiday',
] as const
export type DayStatusType = (typeof DAY_STATUSES)[number]

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface IDayStatus extends Document {
    user: Types.ObjectId
    startDate: string
    endDate: string
    status: DayStatusType
    createdAt: Date
    updatedAt: Date
}

const dayStatusSchema = new Schema<IDayStatus>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        startDate: { type: String, required: true, match: DATE_PATTERN },
        endDate: { type: String, required: true, match: DATE_PATTERN },
        status: { type: String, required: true, enum: DAY_STATUSES },
    },
    { timestamps: true }
)

dayStatusSchema.index({ user: 1, startDate: 1, endDate: 1 })

export default model<IDayStatus>('DayStatus', dayStatusSchema)
