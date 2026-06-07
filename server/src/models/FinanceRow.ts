import { Schema, model, Document, Types } from 'mongoose'

export interface IFinanceRow extends Document {
    user: Types.ObjectId
    group: Types.ObjectId
    name: string
    recurringAmount?: number
    order: number
    createdAt: Date
    updatedAt: Date
}

const financeRowSchema = new Schema<IFinanceRow>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        group: { type: Schema.Types.ObjectId, ref: 'FinanceGroup', required: true, index: true },
        name: { type: String, required: true, trim: true },
        recurringAmount: { type: Number },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

financeRowSchema.index({ user: 1, group: 1, order: 1 })

export default model<IFinanceRow>('FinanceRow', financeRowSchema)
