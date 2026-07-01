import { Schema, model, Document, Types } from 'mongoose'

export interface IFinanceRow extends Document {
    user: Types.ObjectId
    group: Types.ObjectId
    name: string
    recurringAmount?: number
    order: number
    recurring: boolean
    month?: string // YYYY-MM — set for non-recurring rows, absent for recurring
    startMonth?: string | null // YYYY-MM inclusive; null = active since forever (recurring rows)
    endMonth?: string | null // YYYY-MM inclusive; null = open-ended
    skipMonths: string[] // months explicitly hidden ("this month only" deletes)
    budgeted: boolean
    budgetType?: 'daily' | 'weekly' | null
    pot?: Types.ObjectId | null
    /** Starling Space categoryUid this budget mirrors transactions from (null = not linked). */
    starlingCategoryUid?: string | null
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
        startMonth: { type: String, default: null },
        endMonth: { type: String, default: null },
        skipMonths: { type: [String], default: [] },
        budgeted: { type: Boolean, default: false },
        budgetType: { type: String, enum: ['daily', 'weekly'], default: null },
        pot: { type: Schema.Types.ObjectId, ref: 'FinancePot', default: null },
        starlingCategoryUid: { type: String, default: null },
    },
    { timestamps: true }
)

financeRowSchema.index({ user: 1, group: 1, order: 1 })

export default model<IFinanceRow>('FinanceRow', financeRowSchema)
