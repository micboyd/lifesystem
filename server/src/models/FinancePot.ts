import { Schema, model, Document, Types } from 'mongoose'

export interface IFinancePot extends Document {
    user: Types.ObjectId
    group: Types.ObjectId
    name: string
    order: number
    createdAt: Date
    updatedAt: Date
}

const financePotSchema = new Schema<IFinancePot>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        group: { type: Schema.Types.ObjectId, ref: 'FinanceGroup', required: true, index: true },
        name: { type: String, required: true, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

financePotSchema.index({ user: 1, group: 1, order: 1 })

export default model<IFinancePot>('FinancePot', financePotSchema)
