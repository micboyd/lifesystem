import { Schema, model, Document, Types } from 'mongoose'

export interface IFinanceGroup extends Document {
    user: Types.ObjectId
    name: string
    type: 'income' | 'expense' | 'savings'
    order: number
    currentBalance?: number
    annualInterestRate?: number
    startMonth?: string | null // YYYY-MM inclusive; null = active since forever
    endMonth?: string | null // YYYY-MM inclusive; null = open-ended
    skipMonths: string[] // months explicitly hidden ("this month only" deletes)
    createdAt: Date
    updatedAt: Date
}

const financeGroupSchema = new Schema<IFinanceGroup>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ['income', 'expense', 'savings'], required: true },
        order: { type: Number, default: 0 },
        currentBalance: { type: Number, default: 0 },
        annualInterestRate: { type: Number, default: 0 },
        startMonth: { type: String, default: null },
        endMonth: { type: String, default: null },
        skipMonths: { type: [String], default: [] },
    },
    { timestamps: true }
)

financeGroupSchema.index({ user: 1, order: 1 })

export default model<IFinanceGroup>('FinanceGroup', financeGroupSchema)
