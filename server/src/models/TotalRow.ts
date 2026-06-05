import { Schema, model, Document, Types } from 'mongoose'

export interface ITotalRow extends Document {
    user: Types.ObjectId
    name: string
    order: number
    createdAt: Date
    updatedAt: Date
}

const totalRowSchema = new Schema<ITotalRow>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

totalRowSchema.index({ user: 1, order: 1 })

export default model<ITotalRow>('TotalRow', totalRowSchema)
