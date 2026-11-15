import { Schema, model, Document, Types } from 'mongoose'
import { ISO_DATE_PATTERN } from './DailyEnergy'

/**
 * One day of what the watch recorded, copied from Garmin for the long-term
 * trends: steps, calories burned, sleep and resting heart rate. At most one per
 * day per user. Every measure is optional — a day the watch stayed on the
 * charger overnight has steps but no sleep — and a missing one is unknown,
 * never zero.
 */
export interface IGarminDay extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD */
    date: string
    steps?: number
    /** Whole-day calories burned: resting plus active. */
    kcal?: number
    activeKcal?: number
    /** Minutes asleep. */
    sleepMin?: number
    /** Garmin's 0–100 sleep score, on watches that give one. */
    sleepScore?: number
    /** Beats per minute. */
    restingHr?: number
    createdAt: Date
    updatedAt: Date
}

const garminDaySchema = new Schema<IGarminDay>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        steps: { type: Number, min: 0 },
        kcal: { type: Number, min: 0 },
        activeKcal: { type: Number, min: 0 },
        sleepMin: { type: Number, min: 0 },
        sleepScore: { type: Number, min: 0 },
        restingHr: { type: Number, min: 0 },
    },
    { timestamps: true }
)

garminDaySchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IGarminDay>('GarminDay', garminDaySchema)
