import { Schema, model, Document, Types } from 'mongoose'

/** ISO calendar date, "YYYY-MM-DD". */
export const ISO_DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** Accent colours a counter can use — kept in sync with the client. */
export const DAYS_SINCE_COLORS = ['emerald', 'sky', 'violet', 'amber', 'rose', 'teal'] as const
export type DaysSinceColor = (typeof DAYS_SINCE_COLORS)[number]

export interface IDaysSinceItem extends Document {
    user: Types.ObjectId
    label: string
    /** YYYY-MM-DD — the day the count is measured from. */
    startDate: string
    /** Font Awesome class string, e.g. "fa-solid fa-fire". */
    icon: string
    color: DaysSinceColor
    createdAt: Date
    updatedAt: Date
}

const daysSinceSchema = new Schema<IDaysSinceItem>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        label: { type: String, required: true, trim: true },
        startDate: { type: String, required: true, match: ISO_DATE_PATTERN },
        icon: { type: String, default: 'fa-solid fa-fire', trim: true },
        color: { type: String, enum: DAYS_SINCE_COLORS, default: 'emerald' },
    },
    { timestamps: true }
)

export default model<IDaysSinceItem>('DaysSinceItem', daysSinceSchema)
