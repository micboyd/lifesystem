import { Schema, model, Document, Types } from 'mongoose'

export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** How clothes are sitting compared to last time — the cheapest honest signal there is. */
export const CLOTHES_FITS = ['tighter', 'same', 'looser'] as const
export type ClothesFit = (typeof CLOTHES_FITS)[number]

/**
 * A monthly check-in: how the recomp actually feels.
 *
 * Deliberately five fields and a note, not a wellness questionnaire. Each is a
 * 1–5 rating because the difference between a 6 and a 7 out of ten is noise you
 * would be inventing, and the only thing these are for is context — a run of
 * poor recovery alongside a fast weight drop is worth saying out loud when
 * discussing calories.
 *
 * None of it is allowed to move a calorie target on its own. Subjective scores
 * are the most suggestible data in the system: rate hunger 5 after a bad
 * afternoon and any rule keyed on it would hand you 200 kcal for being in a bad
 * mood. They colour the explanation; the weight trend and adherence make the call.
 *
 * At most one per date, upserted like weigh-ins are.
 */
export interface IProgressCheckIn extends Document {
    user: Types.ObjectId
    /** YYYY-MM-DD — the day the check-in describes. */
    date: string
    clothesFit?: ClothesFit
    /** 1 (ravenous) – 5 (comfortable). */
    hunger?: number
    /** 1 (flat) – 5 (excellent). */
    energy?: number
    /** 1 (wrecked) – 5 (fully recovered). */
    recovery?: number
    /** 1 (going backwards) – 5 (strong). */
    trainingFeel?: number
    notes?: string
    createdAt: Date
    updatedAt: Date
}

/** The 1–5 ratings, so readers and writers can't drift apart. */
export const RATING_FIELDS = ['hunger', 'energy', 'recovery', 'trainingFeel'] as const
export type RatingField = (typeof RATING_FIELDS)[number]

const progressCheckInSchema = new Schema<IProgressCheckIn>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: ISO_DATE_PATTERN },
        clothesFit: { type: String, enum: CLOTHES_FITS },
        hunger: { type: Number, min: 1, max: 5 },
        energy: { type: Number, min: 1, max: 5 },
        recovery: { type: Number, min: 1, max: 5 },
        trainingFeel: { type: Number, min: 1, max: 5 },
        notes: { type: String, trim: true, maxlength: 2000 },
    },
    { timestamps: true }
)

progressCheckInSchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IProgressCheckIn>('ProgressCheckIn', progressCheckInSchema)
