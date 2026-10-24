import { Schema, model, Document, Types } from 'mongoose'

export const LIST_KINDS = ['checklist', 'bullets', 'numbered'] as const
export type ListKind = (typeof LIST_KINDS)[number]

export interface IListItem {
    /** Client-generated, so the editor can key rows before the first save lands. */
    id: string
    text: string
    done: boolean
}

export interface IList extends Document {
    user: Types.ObjectId
    title: string
    /** How items render: tick boxes, bullet points or numbers. */
    kind: ListKind
    pinned: boolean
    items: IListItem[]
    createdAt: Date
    updatedAt: Date
}

const itemSchema = new Schema<IListItem>(
    {
        id: { type: String, required: true },
        text: { type: String, default: '' },
        done: { type: Boolean, default: false },
    },
    { _id: false }
)

const listSchema = new Schema<IList>(
    {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        kind: { type: String, enum: LIST_KINDS, default: 'checklist' },
        pinned: { type: Boolean, default: false },
        items: { type: [itemSchema], default: [] },
    },
    { timestamps: true }
)

export default model<IList>('List', listSchema)
