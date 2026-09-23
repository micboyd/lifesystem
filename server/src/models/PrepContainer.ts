import { Schema, model, Document, Types } from 'mongoose'

/**
 * An empty container's weight, saved so a tray can be weighed in it and the
 * food's net weight worked out. Optional convenience; nothing requires one.
 */
export interface IPrepContainer extends Document {
    user: Types.ObjectId
    name: string
    grams: number
    createdAt: Date
    updatedAt: Date
}

const prepContainerSchema = new Schema<IPrepContainer>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        grams: { type: Number, required: true, min: 0 },
    },
    { timestamps: true }
)

export default model<IPrepContainer>('PrepContainer', prepContainerSchema)
