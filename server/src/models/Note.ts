import { Schema, model, Document, Types } from 'mongoose'

export interface INote extends Document {
    user: Types.ObjectId
    title: string
    body: string
    /** Owning category, or null for an uncategorised note. */
    category: Types.ObjectId | null
    createdAt: Date
    updatedAt: Date
}

const noteSchema = new Schema<INote>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        body: { type: String, default: '' },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'NoteCategory',
            default: null,
            index: true,
        },
    },
    { timestamps: true }
)

export default model<INote>('Note', noteSchema)
