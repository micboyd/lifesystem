import { Schema, model, Document, Types } from 'mongoose'

/** One block of a mobility routine, e.g. a movement, stretch or hold. */
export interface IMobilityPart {
    name: string
    detail?: string
}

/**
 * A reusable mobility routine — e.g. a hip flow or a shoulder circuit. Structured
 * like a conditioning session (ordered parts + how-to-use) but without a category,
 * since the whole library is mobility.
 */
export interface IMobility extends Document {
    user: Types.ObjectId
    name: string
    /** Planned duration in minutes. */
    duration: number
    /** What the routine is for, e.g. "Open up tight hips". */
    purpose?: string
    /** Ordered parts making up the routine. */
    parts: IMobilityPart[]
    /** Guidance on how / when to run the routine. */
    howToUse?: string
    /** Priority position in the library (lower = sooner). */
    order: number
    createdAt: Date
    updatedAt: Date
}

const partSchema = new Schema<IMobilityPart>(
    {
        name: { type: String, required: true, trim: true },
        detail: { type: String, trim: true },
    },
    { _id: false }
)

const mobilitySchema = new Schema<IMobility>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        duration: { type: Number, default: 0, min: 0 },
        purpose: { type: String, trim: true },
        parts: { type: [partSchema], default: [] },
        howToUse: { type: String, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

mobilitySchema.index({ user: 1, order: 1 })

export default model<IMobility>('Mobility', mobilitySchema)
