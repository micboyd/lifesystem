import { Schema, model, Document, Types } from 'mongoose'

/**
 * A Starling feed item the user has deliberately removed from budget tracking —
 * either deleted outright, or moved to a different budget (which detaches it from
 * its original space). Sync checks this before importing so the transaction can't
 * silently reappear just because Starling still shows it in the source Space's feed.
 *
 * Carries a snapshot of the transaction (not just the Starling id) so it can be
 * fully restored later from the "removed transactions" drawer without re-hitting
 * the Starling API.
 */
export interface IStarlingExclusion extends Document {
    user: Types.ObjectId
    feedItemUid: string
    reason: 'deleted' | 'moved'
    /** The budget it was in immediately before removal — recovering sends it back here. */
    originalRow: Types.ObjectId
    originalRowName: string
    /** Only for 'moved': the budget it was moved to — recovering a lost move sends
     *  the transaction here rather than back to originalRow. */
    movedToRow?: Types.ObjectId
    movedToRowName?: string
    /** Only for 'moved': the still-live BudgetSpend to reattach on recovery. */
    spendId?: Types.ObjectId
    date: string
    amount: number
    note?: string
    createdAt: Date
    updatedAt: Date
}

const starlingExclusionSchema = new Schema<IStarlingExclusion>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        feedItemUid: { type: String, required: true },
        reason: { type: String, enum: ['deleted', 'moved'], required: true },
        originalRow: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        originalRowName: { type: String, required: true },
        movedToRow: { type: Schema.Types.ObjectId, ref: 'FinanceRow' },
        movedToRowName: { type: String },
        spendId: { type: Schema.Types.ObjectId, ref: 'BudgetSpend' },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true, maxlength: 200 },
    },
    { timestamps: true }
)

starlingExclusionSchema.index({ user: 1, feedItemUid: 1 }, { unique: true })
starlingExclusionSchema.index({ user: 1, createdAt: -1 })

export default model<IStarlingExclusion>('StarlingExclusion', starlingExclusionSchema)
