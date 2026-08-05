import { Schema, model, Document, Types } from 'mongoose'

export const CONDITIONING_CATEGORIES = [
    'HIIT',
    'Cardio',
    'Endurance',
    'Mobility',
    'Recovery',
] as const
export type ConditioningCategory = (typeof CONDITIONING_CATEGORIES)[number]

/** One block of a session, e.g. a warm-up, main set or cool-down. */
export interface ISessionPart {
    name: string
    detail?: string
    /** If set, this part is an interval block to tick off — the number of rounds to complete. */
    rounds?: number
    /** What one round is called, e.g. "round", "interval", "rep". Defaults to "round". */
    roundLabel?: string
}

export interface IConditioningSession extends Document {
    user: Types.ObjectId
    name: string
    /** Planned duration in minutes. */
    duration: number
    category: ConditioningCategory
    /** What the session is for, e.g. "Build aerobic base". */
    purpose?: string
    /** Ordered parts making up the session. */
    parts: ISessionPart[]
    /** Guidance on how / when to run the session. */
    howToUse?: string
    /** Priority position in the library (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const partSchema = new Schema<ISessionPart>(
    {
        name: { type: String, required: true, trim: true },
        detail: { type: String, trim: true },
        rounds: { type: Number, min: 1 },
        roundLabel: { type: String, trim: true },
    },
    { _id: false }
)

const conditioningSessionSchema = new Schema<IConditioningSession>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        duration: { type: Number, default: 0, min: 0 },
        category: { type: String, enum: CONDITIONING_CATEGORIES, default: 'HIIT' },
        purpose: { type: String, trim: true },
        parts: { type: [partSchema], default: [] },
        howToUse: { type: String, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

conditioningSessionSchema.index({ user: 1, order: 1 })

export default model<IConditioningSession>('ConditioningSession', conditioningSessionSchema)
