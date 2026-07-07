import { Schema, model, Document, Types } from 'mongoose'
import { ISO_DATE_PATTERN } from './DaysSinceItem'

export interface IDaysSinceCheckIn extends Document {
    user: Types.ObjectId
    item: Types.ObjectId
    /** YYYY-MM-DD */
    date: string
    /** 1 (easy) – 5 (intense urge) */
    intensity: number
    note?: string
    createdAt: Date
    updatedAt: Date
}

const daysSinceCheckInSchema = new Schema<IDaysSinceCheckIn>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        item: { type: Schema.Types.ObjectId, ref: 'DaysSinceItem', required: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        intensity: { type: Number, required: true, min: 1, max: 5 },
        note: { type: String, trim: true },
    },
    { timestamps: true }
)

daysSinceCheckInSchema.index({ user: 1, date: 1 })
daysSinceCheckInSchema.index({ user: 1, item: 1, date: 1 }, { unique: true })

export default model<IDaysSinceCheckIn>('DaysSinceCheckIn', daysSinceCheckInSchema)
