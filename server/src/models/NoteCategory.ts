import { Schema, model, Document, Types } from 'mongoose'

export const NOTE_CATEGORY_COLORS = [
    'neutral',
    'emerald',
    'sky',
    'violet',
    'amber',
    'rose',
    'teal',
] as const
export type NoteCategoryColor = (typeof NOTE_CATEGORY_COLORS)[number]

export interface INoteCategory extends Document {
    user: Types.ObjectId
    name: string
    color: NoteCategoryColor
    order: number
    createdAt: Date
    updatedAt: Date
}

const noteCategorySchema = new Schema<INoteCategory>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        name: { type: String, required: true, trim: true },
        color: { type: String, enum: NOTE_CATEGORY_COLORS, default: 'neutral' },
        order: { type: Number, default: 0 },
    },
    { timestamps: true }
)

export default model<INoteCategory>('NoteCategory', noteCategorySchema)
