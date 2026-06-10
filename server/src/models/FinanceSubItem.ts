import { Schema, model, Document, Types } from 'mongoose'

export interface IFinanceSubItem extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    month: string
    name: string
    amount: number
    order: number
    createdAt: Date
    updatedAt: Date
}

const financeSubItemSchema = new Schema<IFinanceSubItem>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        month: { type: String, match: /^\d{4}-\d{2}$/ }, // optional: omitted for non-recurring rows
        name: { type: String, required: true, trim: true },
        amount: { type: Number, required: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

financeSubItemSchema.index({ user: 1, row: 1, month: 1, order: 1 })

export default model<IFinanceSubItem>('FinanceSubItem', financeSubItemSchema)
