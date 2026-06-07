import { Schema, model, Document, Types } from 'mongoose'

/** month is stored as "YYYY-MM" */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export interface IFinanceEntry extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    month: string
    amount: number
    createdAt: Date
    updatedAt: Date
}

const financeEntrySchema = new Schema<IFinanceEntry>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        month: {
            type: String,
            required: true,
            validate: { validator: (v: string) => MONTH_PATTERN.test(v), message: 'month must be YYYY-MM' },
        },
        amount: { type: Number, required: true },
    },
    { timestamps: true }
)

financeEntrySchema.index({ user: 1, month: 1 })
financeEntrySchema.index({ user: 1, row: 1, month: 1 }, { unique: true })

export default model<IFinanceEntry>('FinanceEntry', financeEntrySchema)
