import { Schema, model, Document, Types } from 'mongoose'

/**
 * A named snapshot of the savings target planner. Both the inputs and the
 * computed results are frozen at save time — the required monthly amount is
 * relative to the month it was saved in (`savedMonth`), so it is stored
 * verbatim rather than recomputed.
 */
export interface ISavingsTarget extends Document {
    user: Types.ObjectId
    name: string
    notes?: string
    /**
     * 'target' solves for the monthly amount needed to reach targetAmount;
     * 'contribution' fixes the monthly amount (requiredMonthly) and projects
     * the end balance into targetAmount.
     */
    mode: 'target' | 'contribution'
    // Inputs
    targetAmount: number
    startingBalance: number
    annualInterestRate: number
    startMonth: string // YYYY-MM
    targetMonth: string // YYYY-MM
    savedMonth: string // YYYY-MM the plan was computed against
    // Computed results at save time
    onTrack: boolean
    requiredMonthly: number
    contributionMonths: number
    totalContributions: number
    interestEarned: number
    growthOnly: number
    createdAt: Date
    updatedAt: Date
}

const savingsTargetSchema = new Schema<ISavingsTarget>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        notes: { type: String, trim: true },
        mode: { type: String, enum: ['target', 'contribution'], default: 'target' },
        targetAmount: { type: Number, required: true },
        startingBalance: { type: Number, default: 0 },
        annualInterestRate: { type: Number, default: 0 },
        startMonth: { type: String, required: true },
        targetMonth: { type: String, required: true },
        savedMonth: { type: String, required: true },
        onTrack: { type: Boolean, default: false },
        requiredMonthly: { type: Number, default: 0 },
        contributionMonths: { type: Number, default: 0 },
        totalContributions: { type: Number, default: 0 },
        interestEarned: { type: Number, default: 0 },
        growthOnly: { type: Number, default: 0 },
    },
    { timestamps: true }
)

export default model<ISavingsTarget>('SavingsTarget', savingsTargetSchema)
