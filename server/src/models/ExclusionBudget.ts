import { Schema, model, Document, Types } from 'mongoose'

/**
 * An alternate budget assigned to a set of excluded days — one shared pot
 * (e.g. £150 across 3 holiday days). Each date may belong to at most one
 * pot; that invariant is enforced in the controller, not by index.
 */
export interface IExclusionBudget extends Document {
    user: Types.ObjectId
    label?: string
    /** Sorted, de-duplicated YYYY-MM-DD keys; always a subset of the user's excluded days. */
    dates: string[]
    amount: number
    note?: string
    createdAt: Date
    updatedAt: Date
}

const exclusionBudgetSchema = new Schema<IExclusionBudget>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        label: { type: String, trim: true, maxlength: 100 },
        dates: {
            type: [{ type: String, match: /^\d{4}-\d{2}-\d{2}$/ }],
            required: true,
        },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true, maxlength: 200 },
    },
    { timestamps: true }
)

exclusionBudgetSchema.index({ user: 1, dates: 1 })

export default model<IExclusionBudget>('ExclusionBudget', exclusionBudgetSchema)
