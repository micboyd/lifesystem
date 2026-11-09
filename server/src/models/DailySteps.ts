import { Schema, model, Document, Types } from 'mongoose'
import { ISO_DATE_PATTERN } from './DailyEnergy'

/**
 * One day's step total, copied from Garmin so the dashboard can show it without
 * waiting on the watch's account. At most one per day per user. Days with no
 * row aren't zero — they're unknown (the watch wasn't worn, or hasn't synced).
 */
export interface IDailySteps extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD */
    date: string
    steps: number
    createdAt: Date
    updatedAt: Date
}

const dailyStepsSchema = new Schema<IDailySteps>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        steps: { type: Number, required: true, min: 0 },
    },
    { timestamps: true }
)

dailyStepsSchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IDailySteps>('DailySteps', dailyStepsSchema)
