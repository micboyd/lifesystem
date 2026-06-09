import { Schema, model, Document, Types } from 'mongoose'

export interface IFinanceRow extends Document {
    user: Types.ObjectId
    group: Types.ObjectId
    name: string
    recurringAmount?: number
    order: number
    recurring: boolean
    month?: string          // YYYY-MM — set for non-recurring rows, absent for recurring
    budgeted: boolean
    budgetType?: 'daily' | null
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
        recurring: { type: Boolean, default: true },
        month: { type: String, default: null },
        budgeted: { type: Boolean, default: false },
        budgetType: { type: String, enum: ['daily'], default: null },
    },
    { timestamps: true }
)

financeRowSchema.index({ user: 1, group: 1, order: 1 })

export default model<IFinanceRow>('FinanceRow', financeRowSchema)
