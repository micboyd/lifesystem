import { Schema, model, Document, Types } from 'mongoose'

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * The circumference measurements a reading can carry, in centimetres. Every one
 * is optional: the cadence that survives contact with real life is weight daily,
 * waist weekly, and the rest occasionally.
 *
 * Waist is the one that matters. Through a recomp it keeps moving during the
 * weeks the scale sits still on water, and it falls when the fat does rather
 * than when the total does — so weight flat and waist down is the signature of
 * the thing working, which no single number can show you.
 */
export interface IMeasurements {
    waist?: number
    chest?: number
    hips?: number
    neck?: number
    armLeft?: number
    armRight?: number
    thighLeft?: number
    thighRight?: number
}

/**
 * One weigh-in. At most one per day per user — the scale is noisy enough that a
 * second reading on the same day is a correction, not a new data point, so the
 * API upserts on { user, date } rather than appending.
 *
 * Waist and body fat sit alongside weight because they keep moving through the
 * week-long water swings that flatten the scale, so together they tell you
 * whether a stall is real — and whether what's coming off is fat. The remaining
 * circumferences were added later and live in the same record for the same
 * reason: they are one measuring session, taken on one morning, and splitting
 * them across collections would only invite them to disagree about the date.
 */
export interface IWeightLog extends Document, IMeasurements {
    user: Types.ObjectId
    /** YYYY-MM-DD — the morning the reading was taken. */
    date: string
    /** Bodyweight in kilograms. */
    weight: number
    /** Optional waist measurement in centimetres. */
    waist?: number
    /** Optional body fat, as a percentage of bodyweight. */
    bodyFat?: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

/** Every circumference field, so readers and writers can't drift out of step. */
export const MEASUREMENT_FIELDS = [
    'waist',
    'chest',
    'hips',
    'neck',
    'armLeft',
    'armRight',
    'thighLeft',
    'thighRight',
] as const
export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number]

const weightLogSchema = new Schema<IWeightLog>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        weight: { type: Number, required: true, min: 0 },
        waist: { type: Number, min: 0 },
        chest: { type: Number, min: 0 },
        hips: { type: Number, min: 0 },
        neck: { type: Number, min: 0 },
        armLeft: { type: Number, min: 0 },
        armRight: { type: Number, min: 0 },
        thighLeft: { type: Number, min: 0 },
        thighRight: { type: Number, min: 0 },
        bodyFat: { type: Number, min: 0, max: 100 },
        notes: { type: String, trim: true },
    },
    { timestamps: true }
)

weightLogSchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IWeightLog>('WeightLog', weightLogSchema)
