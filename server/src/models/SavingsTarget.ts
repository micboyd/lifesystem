import { Schema, model, Document, Types } from 'mongoose'

/**
 * A named savings plan from the target planner. Inputs and computed results
 * are stored together; the required monthly amount is relative to the month
 * it was worked out in (`savedMonth`). Editing the plan's numbers re-works it
 * client-side and saves the whole set again.
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
    /** Manual display position among the user's saved plans (lower first). */
    order: number
    /** User-set flag to mark the plan as a priority. */
    priority: boolean
    /** Counted in the planner's combined totals. */
    included: boolean
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
        order: { type: Number, default: 0 },
        priority: { type: Boolean, default: false },
        included: { type: Boolean, default: true },
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
