import { Schema, model, Document, Types } from 'mongoose'

export interface IBudgetTopUp extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    date: string
    amount: number
    note?: string
    createdAt: Date
    updatedAt: Date
}

const budgetTopUpSchema = new Schema<IBudgetTopUp>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        amount: { type: Number, required: true, min: 0 },
        note: { type: String, trim: true, maxlength: 200 },
    },
    { timestamps: true }
)

budgetTopUpSchema.index({ user: 1, date: 1 })
budgetTopUpSchema.index({ user: 1, row: 1, date: 1 })

export default model<IBudgetTopUp>('BudgetTopUp', budgetTopUpSchema)
