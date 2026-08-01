import { Schema, model, Document, Types } from 'mongoose'

/** Whether a note flags a single day or a whole week. */
export const FITNESS_NOTE_SCOPES = ['day', 'week'] as const
export type FitnessNoteScope = (typeof FITNESS_NOTE_SCOPES)[number]

/** The flag colours a day or week can be marked with. */
export const FITNESS_FLAG_COLORS = ['coral', 'amber', 'emerald', 'sky', 'violet', 'slate'] as const
export type FitnessFlagColor = (typeof FITNESS_FLAG_COLORS)[number]

/**
 * A flag + label annotation on the fitness planner. It marks either one day or
 * one week (e.g. "Deload", "Race week", "Test day") with a colour and a short
 * label, independent of the training items placed that day. There is at most one
 * note per (user, scope, date): for `scope: 'day'` the `date` is the day key,
 * for `scope: 'week'` it is the week's Monday.
 */
export interface IFitnessPlanNote extends Document {
    user: Types.ObjectId
    scope: FitnessNoteScope
    /** Day key ("YYYY-MM-DD") for a day note; the week's Monday for a week note. */
    date: string
    color: FitnessFlagColor
    label: string
    createdAt: Date
    updatedAt: Date
}

const fitnessPlanNoteSchema = new Schema<IFitnessPlanNote>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        scope: { type: String, enum: FITNESS_NOTE_SCOPES, required: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        color: { type: String, enum: FITNESS_FLAG_COLORS, default: 'coral' },
        label: { type: String, default: '', trim: true, maxlength: 80 },
    },
    { timestamps: true }
)

// One note per day/week per user, so saves can upsert on this key.
fitnessPlanNoteSchema.index({ user: 1, scope: 1, date: 1 }, { unique: true })

export default model<IFitnessPlanNote>('FitnessPlanNote', fitnessPlanNoteSchema)
