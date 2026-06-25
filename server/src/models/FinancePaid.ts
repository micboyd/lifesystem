import { Schema, model, Document, Types } from 'mongoose'
import { MONTH_PATTERN } from './FinanceEntry'

export interface IFinancePaid extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    month: string
    createdAt: Date
    updatedAt: Date
}

const financePaidSchema = new Schema<IFinancePaid>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'FinanceRow', required: true },
        month: {
            type: String,
            required: true,
            validate: {
                validator: (v: string) => MONTH_PATTERN.test(v),
                message: 'month must be YYYY-MM',
            },
        },
    },
    { timestamps: true }
)

financePaidSchema.index({ user: 1, month: 1 })
financePaidSchema.index({ user: 1, row: 1, month: 1 }, { unique: true })

export default model<IFinancePaid>('FinancePaid', financePaidSchema)
