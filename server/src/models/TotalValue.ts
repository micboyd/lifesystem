import { Schema, model, Document, Types } from 'mongoose'

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export interface ITotalValue extends Document {
    user: Types.ObjectId
    row: Types.ObjectId
    date: string
    value: number
    createdAt: Date
    updatedAt: Date
}

const totalValueSchema = new Schema<ITotalValue>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        row: { type: Schema.Types.ObjectId, ref: 'TotalRow', required: true },
        date: { type: String, required: true, match: DATE_PATTERN },
        value: { type: Number, required: true },
    },
    { timestamps: true }
)

// One value per row per day.
totalValueSchema.index({ user: 1, row: 1, date: 1 }, { unique: true })

export default model<ITotalValue>('TotalValue', totalValueSchema)
