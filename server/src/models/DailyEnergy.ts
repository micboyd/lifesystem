import { Schema, model, Document, Types } from 'mongoose'

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * One day's energy expenditure, entered by hand from a watch or ring.
 *
 * `caloriesOut` is what the watch says was burned. Once the user's body profile
 * (height, date of birth, sex) and a weigh-in are in, the client works out that
 * day's BMR and reads this as the active figure, adding the BMR on top; until
 * then it's taken as the total.
 *
 * At most one per day per user, upserted on { user, date }, for the same reason
 * weigh-ins are: a second figure for a day is a correction, not a second day.
 * Days with no entry aren't zero — they're unknown, and the client falls back to
 * maintenance measured from intake and the weight trend.
 */
export interface IDailyEnergy extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD — the day the burn covers. */
    date: string
    /** Calories burned — active once a BMR can be worked out, else the day's total. */
    caloriesOut: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

const dailyEnergySchema = new Schema<IDailyEnergy>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        caloriesOut: { type: Number, required: true, min: 0 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

dailyEnergySchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IDailyEnergy>('DailyEnergy', dailyEnergySchema)
