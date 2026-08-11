import { Schema, model, Document, Types } from 'mongoose'
import { CALENDAR_COLORS, type CalendarColor } from './Calendar'

/** YYYY-MM — a month note is pinned to whole months, never to a day. */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * A label hung on one or more months — "No booze", "Cutting", "Wedding season".
 * It spans a contiguous month range so a single flag can cover a whole quarter
 * without being duplicated per month.
 */
export interface IMonthNote extends Document {
    user: Types.ObjectId
    startMonth: string
    endMonth: string
    label: string
    note?: string
    color: CalendarColor
    createdAt: Date
    updatedAt: Date
}

const monthNoteSchema = new Schema<IMonthNote>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        startMonth: { type: String, required: true, match: MONTH_PATTERN },
        endMonth: { type: String, required: true, match: MONTH_PATTERN },
        label: { type: String, required: true, trim: true, maxlength: 60 },
        note: { type: String, trim: true },
        color: { type: String, required: true, enum: CALENDAR_COLORS, default: 'neutral' },
    },
    { timestamps: true }
)

monthNoteSchema.index({ user: 1, startMonth: 1, endMonth: 1 })

export default model<IMonthNote>('MonthNote', monthNoteSchema)
