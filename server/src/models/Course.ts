import { Schema, model, Document, Types } from 'mongoose'

export interface ICourse extends Document {
    user: Types.ObjectId
    title: string
    hours: number
    category: string
    url?: string
    order: number
    createdAt: Date
    updatedAt: Date
}

const courseSchema = new Schema<ICourse>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        hours: { type: Number, required: true, min: 0 },
        category: { type: String, required: true, trim: true },
        url: { type: String, trim: true },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

courseSchema.index({ user: 1, order: 1 })

export default model<ICourse>('Course', courseSchema)
