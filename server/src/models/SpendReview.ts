import { Schema, model, Document, Types } from 'mongoose'
import { MONTH_PATTERN } from './MonthNote'

/**
 * Statement → Transactions good/bad review for one month. Every payment is
 * "good" unless its Starling feedItemUid is in `bad`. `reportAt` is set once
 * the user has pressed "Create report", which shows the Report tab.
 */
export interface ISpendReview extends Document {
    user: Types.ObjectId
    month: string
    bad: string[]
    reportAt: Date | null
    createdAt: Date
    updatedAt: Date
}

const spendReviewSchema = new Schema<ISpendReview>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        month: { type: String, required: true, match: MONTH_PATTERN },
        bad: { type: [String], default: [] },
        reportAt: { type: Date, default: null },
    },
    { timestamps: true }
)

spendReviewSchema.index({ user: 1, month: 1 }, { unique: true })

export default model<ISpendReview>('SpendReview', spendReviewSchema)
