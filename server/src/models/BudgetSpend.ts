import { Schema, model, Document, Types } from 'mongoose'

export interface IBudgetSpend extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    date: string
    amount: number
    createdAt: Date
    updatedAt: Date
}

const budgetSpendSchema = new Schema<IBudgetSpend>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        amount: { type: Number, required: true, min: 0 },
    },
    { timestamps: true }
)

budgetSpendSchema.index({ user: 1, date: 1 })
budgetSpendSchema.index({ user: 1, row: 1, date: 1 }, { unique: true })

export default model<IBudgetSpend>('BudgetSpend', budgetSpendSchema)
