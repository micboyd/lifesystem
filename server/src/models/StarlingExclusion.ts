import { Schema, model, Document, Types } from 'mongoose'

/**
 * A Starling feed item the user has deliberately removed from budget tracking —
 * either deleted outright, or moved to a different budget (which detaches it from
 * its original space). Sync checks this before importing so the transaction can't
 * silently reappear just because Starling still shows it in the source Space's feed.
 */
export interface IStarlingExclusion extends Document {
    user: Types.ObjectId
    feedItemUid: string
    createdAt: Date
    updatedAt: Date
}

const starlingExclusionSchema = new Schema<IStarlingExclusion>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        feedItemUid: { type: String, required: true },
    },
    { timestamps: true }
)

starlingExclusionSchema.index({ user: 1, feedItemUid: 1 }, { unique: true })

export default model<IStarlingExclusion>('StarlingExclusion', starlingExclusionSchema)
