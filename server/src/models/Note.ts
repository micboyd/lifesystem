import { Schema, model, Document, Types } from 'mongoose'

export interface INote extends Document {
    user: Types.ObjectId
    title: string
    body: string
    /** Owning category, or null for an uncategorised note. */
    category: Types.ObjectId | null
    /** When true, the body is hidden in list responses until the password is verified. */
    locked: boolean
    /** bcrypt hash of this note's password. Never serialized to clients. */
    passwordHash: string | null
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
        locked: { type: Boolean, default: false },
        passwordHash: { type: String, default: null },
    },
    { timestamps: true }
)

export default model<INote>('Note', noteSchema)
