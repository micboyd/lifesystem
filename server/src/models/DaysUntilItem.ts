import { Schema, model, Document, Types } from 'mongoose'
import { ISO_DATE_PATTERN, DAYS_SINCE_COLORS, DaysSinceColor } from './DaysSinceItem'

/** Same accent palette as Days Since — one enum of counter colours for both. */
export const DAYS_UNTIL_COLORS = DAYS_SINCE_COLORS
export type DaysUntilColor = DaysSinceColor

export interface IDaysUntilItem extends Document {
    user: Types.ObjectId
    label: string
    /** YYYY-MM-DD — the day the count reaches zero. */
    targetDate: string
    /** Font Awesome class string, e.g. "fa-solid fa-plane-departure". */
    icon: string
    color: DaysUntilColor
    createdAt: Date
    updatedAt: Date
}

const daysUntilSchema = new Schema<IDaysUntilItem>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        label: { type: String, required: true, trim: true },
        targetDate: { type: String, required: true, match: ISO_DATE_PATTERN },
        icon: { type: String, default: 'fa-solid fa-hourglass-end', trim: true },
        color: { type: String, enum: DAYS_UNTIL_COLORS, default: 'sky' },
    },
    { timestamps: true }
)

export default model<IDaysUntilItem>('DaysUntilItem', daysUntilSchema)
