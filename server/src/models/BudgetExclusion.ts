import { Schema, model, Document, Types } from 'mongoose'

export interface IBudgetExclusion extends Document {
    user: Types.ObjectId
    date: string
    createdAt: Date
    updatedAt: Date
}

const budgetExclusionSchema = new Schema<IBudgetExclusion>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    },
    { timestamps: true }
)

budgetExclusionSchema.index({ user: 1, date: 1 }, { unique: true })

export default model<IBudgetExclusion>('BudgetExclusion', budgetExclusionSchema)
