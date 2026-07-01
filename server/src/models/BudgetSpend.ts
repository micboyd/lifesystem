import { Schema, model, Document, Types } from 'mongoose'

export interface IBudgetSpend extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    date: string
    amount: number
    note?: string
    /** Set when this transaction was imported from a Starling Space feed (its feedItemUid). */
    starlingFeedItemUid?: string
    createdAt: Date
    updatedAt: Date
}

const budgetSpendSchema = new Schema<IBudgetSpend>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true, maxlength: 200 },
        starlingFeedItemUid: { type: String, default: undefined },
    },
    { timestamps: true }
)

// One imported transaction per Starling feed item — lets re-syncs upsert rather
// than duplicate. Sparse so manually-logged spends (no feed id) aren't constrained.
budgetSpendSchema.index(
    { user: 1, starlingFeedItemUid: 1 },
    { unique: true, sparse: true }
)

// A day can hold many transactions per row, so this is a plain lookup index — not
// unique. (If upgrading an existing DB, drop the old unique {user,row,date} index.)
budgetSpendSchema.index({ user: 1, date: 1 })
budgetSpendSchema.index({ user: 1, row: 1, date: 1 })

export default model<IBudgetSpend>('BudgetSpend', budgetSpendSchema)
