import { Schema, model, Document, Types } from 'mongoose'

export interface IFinanceGroup extends Document {
    user: Types.ObjectId
    name: string
    type: 'income' | 'expense'
    order: number
    createdAt: Date
    updatedAt: Date
}

const financeGroupSchema = new Schema<IFinanceGroup>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ['income', 'expense'], required: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

financeGroupSchema.index({ user: 1, order: 1 })

export default model<IFinanceGroup>('FinanceGroup', financeGroupSchema)
